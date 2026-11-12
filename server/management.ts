import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { type Category, type Status, type UserId } from '../src/domain.js';
import type { AgencyScope, AssignmentUpdate, AssignmentVersion, AuditRecord, Priority, ServiceEvent, ServiceUpdate } from '../src/management.js';
import { cityFromReference } from '../src/ranking.js';
import type { PilotCity } from '../src/profiles.js';
import { RequestError } from './errors.js';

type Write=(action:()=>void|boolean)=>void;
export class ManagementStore {
  constructor(private db:DatabaseSync,private write:Write) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const columns=db.prepare('PRAGMA table_info(agency_scopes)').all();
      if(!columns.some(column=>column.name==='department'))db.exec("ALTER TABLE agency_scopes ADD COLUMN department TEXT NOT NULL DEFAULT ''");
      db.exec(`
        CREATE TABLE IF NOT EXISTS assignment_versions (user_id TEXT NOT NULL REFERENCES profiles(id),city TEXT NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(user_id,city));
        CREATE TABLE IF NOT EXISTS admin_audit (id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,target_id TEXT NOT NULL,city TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS service_events (id TEXT PRIMARY KEY,issue_id TEXT NOT NULL,author_id TEXT NOT NULL,comment TEXT NOT NULL,status TEXT,priority TEXT,photo BLOB,created_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS service_issue ON service_events(issue_id,created_at);
        CREATE TABLE IF NOT EXISTS issue_priorities (issue_id TEXT PRIMARY KEY,priority TEXT NOT NULL);
        CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON admin_audit BEGIN SELECT RAISE(ABORT,'Audit is append-only');END;
        CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON admin_audit BEGIN SELECT RAISE(ABORT,'Audit is append-only');END;
        CREATE TRIGGER IF NOT EXISTS service_no_update BEFORE UPDATE ON service_events BEGIN SELECT RAISE(ABORT,'Service history is append-only');END;
        CREATE TRIGGER IF NOT EXISTS service_no_delete BEFORE DELETE ON service_events BEGIN SELECT RAISE(ABORT,'Service history is append-only');END;
      `);
      if(Number(db.prepare('PRAGMA user_version').get()!.user_version)<6){db.exec('PRAGMA user_version=6');db.prepare("UPDATE metadata SET value=CAST(value AS INTEGER)+1 WHERE key='revision'").run();}
      db.exec('COMMIT');
    } catch(error){db.exec('ROLLBACK');throw error;}
  }
  role(id:UserId) {const row=this.db.prepare('SELECT role FROM profiles WHERE id=?').get(id);if(!row)throw new RequestError(403,'Perfil sem acesso ao atendimento.');return row.role;}
  capabilities(id?:UserId) {return {admin:!!id&&this.role(id)==='admin',service:!!id&&(this.role(id)==='admin'||!!this.db.prepare('SELECT 1 FROM agency_scopes WHERE user_id=? LIMIT 1').get(id))};}
  canHandle(id:UserId|undefined,city:PilotCity|undefined,category:Category) {
    if(!id)return false;
    return this.role(id)==='admin'||!!(city && this.db.prepare('SELECT 1 FROM agency_scopes WHERE user_id=? AND city=? AND category=?').get(id,city,category));
  }
  requireAccess(id:UserId|undefined) {if(!id||!this.capabilities(id).service)throw new RequestError(403,'Seu perfil não tem categorias de atendimento atribuídas.');return id;}
  scopes():AgencyScope[] {return this.db.prepare('SELECT * FROM agency_scopes ORDER BY city,user_id,category').all().map(row=>({userId:String(row.user_id),city:row.city as PilotCity,category:row.category as Category,department:String(row.department)}));}
  versions():AssignmentVersion[] {return this.db.prepare('SELECT * FROM assignment_versions').all().map(row=>({userId:String(row.user_id),city:row.city as PilotCity,version:Number(row.version)}));}
  audit():AuditRecord[] {return this.db.prepare('SELECT a.*,p.nickname AS actor,t.nickname AS target FROM admin_audit a JOIN profiles p ON p.id=a.actor_id JOIN profiles t ON t.id=a.target_id ORDER BY a.rowid DESC LIMIT 40').all().map(row=>({id:String(row.id),actor:String(row.actor),target:String(row.target),city:String(row.city),createdAt:String(row.created_at),before:JSON.parse(String(row.before_json)),after:JSON.parse(String(row.after_json))}));}
  assign(actor:UserId,value:AssignmentUpdate) {
    this.write(()=>{
      if(this.role(actor)!=='admin')throw new RequestError(403,'Somente a administração pode atribuir responsáveis.');
      if(this.role(value.targetUserId)==='admin')throw new RequestError(400,'Administradores já têm acesso a todas as categorias.');
      const cityHasReports=this.db.prepare('SELECT address FROM issues').all().some(row=>cityFromReference(String(row.address))===value.city);
      if(!cityHasReports)throw new RequestError(400,'Escolha uma cidade com relatos cadastrados.');
      const current=this.db.prepare('SELECT version FROM assignment_versions WHERE user_id=? AND city=?').get(value.targetUserId,value.city);
      if(Number(current?.version ?? 0)!==value.expectedVersion)throw new RequestError(409,'Outro administrador alterou estas atribuições. Recarregue antes de salvar.');
      const before=this.scopes().filter(scope=>scope.userId===value.targetUserId&&scope.city===value.city);
      const after=value.assignments.map(item=>({...item,userId:value.targetUserId,city:value.city})).sort((a,b)=>a.category.localeCompare(b.category));
      const canonical=(items:AgencyScope[])=>JSON.stringify(items.map(item=>[item.category,item.department]).sort((a,b)=>a[0].localeCompare(b[0])));
      if(canonical(before)===canonical(after))return false;
      this.db.prepare('DELETE FROM agency_scopes WHERE user_id=? AND city=?').run(value.targetUserId,value.city);
      for(const item of after)this.db.prepare('INSERT INTO agency_scopes (user_id,city,category,department) VALUES (?,?,?,?)').run(item.userId,item.city,item.category,item.department);
      this.db.prepare('INSERT INTO assignment_versions VALUES (?,?,?) ON CONFLICT(user_id,city) DO UPDATE SET version=excluded.version').run(value.targetUserId,value.city,value.expectedVersion+1);
      this.db.prepare('INSERT INTO admin_audit VALUES (?,?,?,?,?,?,?)').run(randomUUID(),actor,value.targetUserId,value.city,JSON.stringify(before),JSON.stringify(after),new Date().toISOString());
    });
  }
  update(actor:UserId,id:string,value:ServiceUpdate,photo?:Buffer) {
    this.write(()=>{
      const issue=this.db.prepare('SELECT * FROM issues WHERE id=?').get(id);if(!issue)throw new RequestError(404,'Relato não encontrado.');
      if(!this.canHandle(actor,cityFromReference(String(issue.address)),issue.category as Category))throw new RequestError(403,'Este relato não pertence às suas categorias de atendimento nesta cidade.');
      const version=Number(this.db.prepare('SELECT COUNT(*) AS n FROM service_events WHERE issue_id=?').get(id)!.n);
      if(version!==value.expectedVersion)throw new RequestError(409,'O atendimento foi alterado por outra pessoa. Recarregue antes de salvar.');
      if(issue.status!==value.expectedStatus)throw new RequestError(409,'O status foi atualizado por outra pessoa. Recarregue o atendimento.');
      const changed=issue.status!==value.status;
      if(changed && value.status==='Resolvida'&&!photo)throw new RequestError(400,'Anexe uma foto da solução para marcar como resolvida.');
      const at=new Date().toISOString();
      this.db.prepare('INSERT INTO service_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),id,actor,value.comment,changed?value.status:null,value.priority ?? null,photo ?? null,at);
      if(changed){this.db.prepare('UPDATE issues SET status=? WHERE id=?').run(value.status,id);const author=this.db.prepare('SELECT nickname FROM profiles WHERE id=?').get(actor)!.nickname;this.db.prepare('INSERT INTO history VALUES (?,?,?,?,?,?)').run(randomUUID(),id,author,actor,`Situação alterada para ${value.status.toLowerCase()}`,at);}
      if(value.priority==='auto')this.db.prepare('DELETE FROM issue_priorities WHERE issue_id=?').run(id);
      else if(value.priority)this.db.prepare('INSERT INTO issue_priorities VALUES (?,?) ON CONFLICT(issue_id) DO UPDATE SET priority=excluded.priority').run(id,value.priority);
    });
  }
  events(issueId:string):ServiceEvent[] {return this.db.prepare('SELECT e.*,p.nickname FROM service_events e JOIN profiles p ON p.id=e.author_id WHERE issue_id=? ORDER BY e.rowid DESC').all(issueId).map(row=>({id:String(row.id),authorId:String(row.author_id),author:String(row.nickname),comment:String(row.comment),createdAt:String(row.created_at),status:(row.status ?? undefined) as Status|undefined,priority:(row.priority ?? undefined) as Priority|'auto'|undefined,photo:row.photo?`/api/management/issues/${encodeURIComponent(issueId)}/events/${encodeURIComponent(String(row.id))}/photo`:undefined}));}
  priority(id:string) {return this.db.prepare('SELECT priority FROM issue_priorities WHERE issue_id=?').get(id)?.priority as Priority|undefined;}
  photo(actor:UserId|undefined,issueId:string,eventId:string) {
    const issue=this.db.prepare('SELECT address,category FROM issues WHERE id=?').get(issueId);
    if(!issue||!this.canHandle(actor,cityFromReference(String(issue.address)),issue.category as Category))throw new RequestError(403,'Sem acesso a esta evidência.');
    const row=this.db.prepare('SELECT photo FROM service_events WHERE id=? AND issue_id=?').get(eventId,issueId);
    if(!row?.photo)throw new RequestError(404,'Evidência não encontrada.');return row.photo as Uint8Array;
  }
}
