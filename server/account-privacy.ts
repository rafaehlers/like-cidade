import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { DeletionReceipt } from '../src/legal.js';
import { RequestError } from './errors.js';

const REMOVED = 'privacy-removed';
const image = (value: unknown) => value ? `data:image/jpeg;base64,${Buffer.from(value as Uint8Array).toString('base64')}` : null;

/** Called only after a server-verified session, never using a client-selected account. */
export class AccountPrivacyStore {
  private erasing = false;
  constructor(private db: DatabaseSync) {
    db.function('privacy_erasure_authorized', () => this.erasing ? 1 : 0);
    db.exec('PRAGMA secure_delete=ON; BEGIN IMMEDIATE');
    try {
      db.exec('CREATE TABLE IF NOT EXISTS privacy_receipts (id TEXT PRIMARY KEY, completed_at TEXT NOT NULL)');
      // Preserve append-only behavior for every normal write. Erasure is a narrow,
      // synchronous transaction on this connection; the flag is never exposed to SQL/API callers.
      for (const [table, prefix] of [['point_ledger', 'immutable_ledger'], ['admin_audit', 'audit_no'], ['service_events', 'service_no']] as const) {
        for (const action of ['update', 'delete']) {
          const name = `${prefix}_${action}`;
          db.exec(`DROP TRIGGER IF EXISTS ${name}; CREATE TRIGGER ${name} BEFORE ${action.toUpperCase()} ON ${table} WHEN privacy_erasure_authorized()=0 BEGIN SELECT RAISE(ABORT,'History is append-only'); END;`);
        }
      }
      if (Number(db.prepare('PRAGMA user_version').get()!.user_version) < 7) db.exec('PRAGMA user_version=7');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  export(userId: string) {
    const profile = this.db.prepare('SELECT * FROM profiles WHERE id=? AND id!=?').get(userId, REMOVED);
    if (!profile) throw new RequestError(404, 'Conta não encontrada.');
    const reports = this.db.prepare('SELECT * FROM issues WHERE author_id=? ORDER BY created_at').all(userId);
    const comments = this.db.prepare('SELECT id,issue_id,text,created_at FROM comments WHERE author_id=? ORDER BY created_at').all(userId);
    const service = this.db.prepare('SELECT id,issue_id,comment,status,priority,photo,created_at FROM service_events WHERE author_id=? ORDER BY created_at').all(userId);
    const ledger = this.db.prepare('SELECT l.*,p.city FROM point_ledger l LEFT JOIN point_locations p ON p.entry_id=l.id WHERE l.user_id=? ORDER BY l.rowid').all(userId);
    return {
      formatVersion: 1, exportedAt: new Date().toISOString(),
      scope: 'Dados da conta na base ativa do Like Cidade. Não inclui dados privados de outras pessoas, backups ou dados mantidos por provedores externos.',
      profile: { ...profile, avatar: image(profile.avatar) },
      identities: this.db.prepare('SELECT provider,subject FROM user_identities WHERE user_id=?').all(userId),
      reports: reports.map(row => ({ ...row, photo: image(row.photo) })),
      supports: this.db.prepare('SELECT issue_id FROM likes WHERE user_id=?').all(userId),
      comments, serviceEvents: service.map(row => ({ ...row, photo: image(row.photo) })),
      publicHistory: this.db.prepare('SELECT issue_id,label,created_at FROM history WHERE author_id=? ORDER BY created_at').all(userId),
      pointLedger: ledger,
      additionalPointLedger: this.db.prepare('SELECT * FROM demo_point_ledger WHERE user_id=?').all(userId),
      responsibilities: this.db.prepare('SELECT city,category,department FROM agency_scopes WHERE user_id=?').all(userId),
      administrativeActions: this.db.prepare('SELECT id,target_id,city,created_at FROM admin_audit WHERE actor_id=? ORDER BY rowid').all(userId),
      assignmentHistory: this.db.prepare('SELECT city,before_json,after_json,created_at FROM admin_audit WHERE target_id=? ORDER BY rowid').all(userId),
    };
  }

  erase(userId: string): DeletionReceipt {
    const receipt = { receiptId: randomUUID(), completedAt: new Date().toISOString() };
    this.db.exec('BEGIN IMMEDIATE');
    this.erasing = true;
    try {
      const account = this.db.prepare('SELECT id FROM profiles WHERE id=? AND id!=?').get(userId, REMOVED);
      if (!account) throw new RequestError(404, 'Conta não encontrada.');
      const owned = this.db.prepare('SELECT id FROM issues WHERE author_id=?').all(userId).map(row => String(row.id));
      // A shared neutral actor preserves status chronology without a per-person tombstone.
      if (this.db.prepare('SELECT 1 FROM service_events WHERE author_id=? LIMIT 1').get(userId)) {
        this.db.prepare("INSERT OR IGNORE INTO profiles (id,nickname,city,bio,role,updated_at) VALUES (?,'Conta excluída','', '', 'agency',?)").run(REMOVED, receipt.completedAt);
        this.db.prepare("UPDATE service_events SET author_id=?,comment='Conteúdo removido a pedido do titular',photo=NULL WHERE author_id=?").run(REMOVED,userId);
      }
      this.db.prepare("UPDATE history SET author='Conta excluída',author_id=NULL WHERE author_id=?").run(userId);
      this.db.prepare('DELETE FROM comments WHERE author_id=?').run(userId);
      this.db.prepare('DELETE FROM likes WHERE user_id=?').run(userId);
      this.db.prepare('DELETE FROM admin_audit WHERE actor_id=? OR target_id=?').run(userId,userId);
      const purgePoints = (column: 'user_id' | 'issue_id', id: string) => {
        this.db.prepare(`DELETE FROM point_locations WHERE entry_id IN (SELECT id FROM point_ledger WHERE ${column}=?)`).run(id);
        // Reversal entries reference credits; remove both in the same deferred-FK transaction.
        this.db.prepare(`DELETE FROM point_ledger WHERE ${column}=?`).run(id);
        this.db.prepare(`DELETE FROM demo_point_ledger WHERE ${column}=?`).run(id);
      };
      this.db.exec('PRAGMA defer_foreign_keys=ON');
      purgePoints('user_id',userId);
      for (const id of owned) {
        purgePoints('issue_id',id);
        this.db.prepare('DELETE FROM service_events WHERE issue_id=?').run(id);
        this.db.prepare('DELETE FROM issue_priorities WHERE issue_id=?').run(id);
        this.db.prepare('DELETE FROM issues WHERE id=?').run(id);
      }
      this.db.prepare('DELETE FROM agency_scopes WHERE user_id=?').run(userId);
      this.db.prepare('DELETE FROM assignment_versions WHERE user_id=?').run(userId);
      this.db.prepare('DELETE FROM user_identities WHERE user_id=?').run(userId);
      this.db.prepare('DELETE FROM profiles WHERE id=?').run(userId);
      this.db.prepare('INSERT INTO privacy_receipts VALUES (?,?)').run(receipt.receiptId, receipt.completedAt);
      this.db.prepare("UPDATE metadata SET value=CAST(value AS INTEGER)+1 WHERE key='revision'").run();
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    finally { this.erasing = false; }
    // Logical erasure does not claim to erase backups or third-party copies.
    try { this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* Active readers can delay a WAL checkpoint. */ }
    return receipt;
  }
}
