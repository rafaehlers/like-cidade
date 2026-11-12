import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { PEOPLE, type Issue, type UserId } from '../src/domain.js';
import { POINT_RULES, profileProgress, type PointAction, type PointEntry, type ProfileUpdate, type PublicProfile } from '../src/profiles.js';
import { buildRanking, cityFromReference, type RankingPeriod, type RankingTheme } from '../src/ranking.js';
import { RequestError } from './errors.js';

export class ProfileStore {
  constructor(private db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY, nickname TEXT NOT NULL, city TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL, avatar BLOB, avatar_version INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_identities (
        provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES profiles(id),
        PRIMARY KEY(provider, subject), UNIQUE(provider, user_id)
      );
      CREATE TABLE IF NOT EXISTS point_ledger (
        id TEXT PRIMARY KEY, source_key TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES profiles(id),
        action TEXT NOT NULL CHECK(action IN ('report','support','solution','conclusion')),
        amount INTEGER NOT NULL CHECK(amount != 0), issue_id TEXT NOT NULL, issue_title TEXT NOT NULL,
        category TEXT NOT NULL, subcategory TEXT, created_at TEXT NOT NULL, reason TEXT NOT NULL,
        reverses_id TEXT UNIQUE REFERENCES point_ledger(id)
      );
      CREATE TABLE IF NOT EXISTS point_locations (entry_id TEXT PRIMARY KEY REFERENCES point_ledger(id), city TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS demo_point_ledger (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES profiles(id), action TEXT NOT NULL CHECK(action IN ('report','support')),
        amount INTEGER NOT NULL CHECK(amount IN (2,10)), issue_id TEXT NOT NULL, issue_title TEXT NOT NULL,
        category TEXT NOT NULL, subcategory TEXT, created_at TEXT NOT NULL, reason TEXT NOT NULL, city TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ledger_user ON point_ledger(user_id, created_at);
      CREATE INDEX IF NOT EXISTS ledger_issue ON point_ledger(issue_id);
      CREATE TRIGGER IF NOT EXISTS immutable_ledger_update BEFORE UPDATE ON point_ledger BEGIN SELECT RAISE(ABORT, 'Ledger is append-only'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_ledger_delete BEFORE DELETE ON point_ledger BEGIN SELECT RAISE(ABORT, 'Ledger is append-only'); END;
    `);
    db.exec('BEGIN IMMEDIATE');
    try {
      const at = new Date().toISOString();
      for (const [id, person] of Object.entries(PEOPLE)) {
        db.prepare('INSERT OR IGNORE INTO profiles (id,nickname,city,role,updated_at) VALUES (?,?,?,?,?)').run(id,person.name,'Itajaí',person.type,at);
        db.prepare("INSERT OR IGNORE INTO user_identities VALUES ('demo',?,?)").run(id,id);
      }
      if (!db.prepare("SELECT value FROM metadata WHERE key='points_initialized'").get()) {
        const rows = db.prepare('SELECT * FROM issues WHERE sample=0 ORDER BY created_at,id').all();
        for (const row of rows) {
          const issue = { id: row.id, title: row.title, category: row.category, subcategory: row.subcategory, authorId: row.author_id, sample: false } as unknown as Issue;
          this.credit(issue.authorId,'report',issue,`report:${issue.id}`,String(row.created_at),'Relato anterior ao perfil, importado com a data original.');
          for (const like of db.prepare('SELECT user_id FROM likes WHERE issue_id=? AND user_id!=?').all(issue.id,issue.authorId)) {
            this.credit(String(like.user_id),'support',issue,`support-import:${issue.id}:${like.user_id}`,at,'Apoio anterior ao perfil, importado hoje; a data original não estava disponível.');
          }
        }
        db.prepare("INSERT INTO metadata VALUES ('points_initialized','1')").run();
        db.prepare("UPDATE metadata SET value=CAST(value AS INTEGER)+1 WHERE key='revision'").run();
      }
      for(const row of db.prepare('SELECT l.id,i.address FROM point_ledger l JOIN issues i ON i.id=l.issue_id LEFT JOIN point_locations p ON p.entry_id=l.id WHERE p.entry_id IS NULL').all()) {
        const city=cityFromReference(String(row.address));
        if(city)db.prepare('INSERT OR IGNORE INTO point_locations VALUES (?,?)').run(row.id,city);
      }
      const version = Number(db.prepare('PRAGMA user_version').get()!.user_version);
      if (version < 4) db.exec('PRAGMA user_version=4');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  list(): PublicProfile[] {
    return this.db.prepare('SELECT id,nickname,city,bio,role,updated_at,avatar_version,avatar IS NOT NULL AS has_avatar FROM profiles ORDER BY rowid').all().map(row => ({
      id: String(row.id), nickname: String(row.nickname), city: row.city as PublicProfile['city'], bio: String(row.bio), role: row.role as PublicProfile['role'], updatedAt: String(row.updated_at),
      avatarUrl: row.has_avatar ? `/api/profiles/${encodeURIComponent(String(row.id))}/avatar?v=${row.avatar_version}` : undefined,
    }));
  }
  require(id: UserId) {
    const profile = this.list().find(item => item.id===id);
    if (!profile) throw new RequestError(404,'Perfil não encontrado.');
    return profile;
  }
  name(id: UserId) { return this.require(id).nickname; }
  update(id: UserId, value: ProfileUpdate, avatar?: Buffer) {
    this.require(id);
    this.db.prepare('UPDATE profiles SET nickname=?,city=?,bio=?,updated_at=? WHERE id=?').run(value.nickname,value.city,value.bio,new Date().toISOString(),id);
    if (value.avatar !== undefined) this.db.prepare('UPDATE profiles SET avatar=?,avatar_version=avatar_version+1 WHERE id=?').run(avatar ?? null,id);
  }
  avatar(id: UserId) { return this.db.prepare('SELECT avatar FROM profiles WHERE id=?').get(id)?.avatar as Uint8Array | undefined; }
  credit(userId: UserId, action: PointAction, issue: Pick<Issue,'id'|'title'|'category'|'subcategory'|'sample'>, key: string, at=new Date().toISOString(), reason='') {
    if (issue.sample || this.require(userId).role!=='resident') return;
    const rule = POINT_RULES.find(rule=>rule.action===action)!;
    // Only validated domain flows may issue future solution/conclusion credits.
    if (!rule.available) throw new Error('This action has no implemented validation flow.');
    const id=randomUUID();
    const inserted=this.db.prepare('INSERT OR IGNORE INTO point_ledger VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL)').run(id,key,userId,action,rule.points,issue.id,issue.title,issue.category,issue.subcategory ?? null,at,reason || rule.label);
    const address=this.db.prepare('SELECT address FROM issues WHERE id=?').get(issue.id)?.address;
    const city=address?cityFromReference(String(address)):undefined;
    if(inserted.changes && city)this.db.prepare('INSERT INTO point_locations VALUES (?,?)').run(id,city);
  }
  reverse(issueId: string, reason: string, userId?: UserId, action?: PointAction) {
    const rows = this.db.prepare(`SELECT l.* FROM point_ledger l WHERE l.issue_id=? AND l.amount>0
      AND (? IS NULL OR l.user_id=?) AND (? IS NULL OR l.action=?)
      AND NOT EXISTS (SELECT 1 FROM point_ledger r WHERE r.reverses_id=l.id)`).all(issueId,userId ?? null,userId ?? null,action ?? null,action ?? null);
    for (const row of rows) {
      const id=randomUUID();
      this.db.prepare('INSERT INTO point_ledger VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id,`reverse:${row.id}`,row.user_id,row.action,-Number(row.amount),row.issue_id,row.issue_title,row.category,row.subcategory,new Date().toISOString(),reason,row.id);
      const city=this.db.prepare('SELECT city FROM point_locations WHERE entry_id=?').get(row.id)?.city;
      if(city)this.db.prepare('INSERT INTO point_locations VALUES (?,?)').run(id,city);
    }
  }
  details(id: UserId, revision: number) {
    const profile=this.require(id);
    return profileProgress(profile,this.ledger(id),revision);
  }
  ledger(id: UserId): PointEntry[] {
    let balance=0;
    const real=this.db.prepare('SELECT l.*,p.city FROM point_ledger l LEFT JOIN point_locations p ON p.entry_id=l.id WHERE l.user_id=? ORDER BY l.rowid').all(id);
    const demo=this.db.prepare('SELECT * FROM demo_point_ledger WHERE user_id=? ORDER BY rowid').all(id);
    const combined: (Record<string,unknown> & {demo:boolean})[]=[...real.map(row=>({...row,demo:false})),...demo.map(row=>({...row,demo:true}))];
    combined.sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
    return combined.map(row=>{
      balance+=Number(row.amount);
      return {id:String(row.id),action:row.action as PointAction,amount:Number(row.amount),issueId:String(row.issue_id),issueTitle:String(row.issue_title),category:row.category as Issue['category'],subcategory:(row.subcategory ?? undefined) as Issue['subcategory'],createdAt:String(row.created_at),reason:String(row.reason),reversesId:row.reverses_id?String(row.reverses_id):undefined,balance,demo:row.demo || undefined,city:(row.city ?? undefined) as PublicProfile['city']|undefined};
    }).reverse();
  }
  ranking(options:{period:RankingPeriod;city:PublicProfile['city']|'all';theme:RankingTheme;userId?:string},revision:number,now=new Date()) {
    const profiles=this.list();
    const events=profiles.filter(profile=>profile.role==='resident').flatMap(profile=>this.ledger(profile.id).map(entry=>({...entry,userId:profile.id})));
    return buildRanking(profiles,events,{...options,now,revision});
  }

}
