import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PEOPLE, seedIssues, type Issue, type Status, type Subcategory, type UserId, type NewIssue } from '../src/domain.js';
import { RequestError } from './errors.js';
import { ProfileStore } from './profiles.js';
import type { ProfileUpdate } from '../src/profiles.js';

type IssueRow = Omit<Issue, 'author' | 'authorId' | 'createdAt' | 'photo' | 'likes' | 'comments' | 'history' | 'sample' | 'subcategory'> & {
  author_id: UserId; created_at: string; has_photo: number; sample: number; subcategory: Subcategory | null;
};
type ChildRow = { id: string; issue_id: string; author_id: UserId; author: string; text: string; label: string; created_at: string };

export class IssueDatabase {
  readonly db: DatabaseSync;
  readonly profiles: ProfileStore;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO metadata VALUES ('revision', '0');
      CREATE TABLE IF NOT EXISTS issues (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
        description TEXT NOT NULL, address TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL,
        status TEXT NOT NULL, author_id TEXT NOT NULL, created_at TEXT NOT NULL,
        sample INTEGER NOT NULL DEFAULT 0, photo BLOB, subcategory TEXT
      );
      CREATE TABLE IF NOT EXISTS likes (
        issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL, PRIMARY KEY (issue_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY, issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
        author_id TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY, issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
        author TEXT NOT NULL, author_id TEXT, label TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS comments_issue ON comments(issue_id);
      CREATE INDEX IF NOT EXISTS history_issue ON history(issue_id);
    `);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const columns = this.db.prepare('PRAGMA table_info(issues)').all();
      if (!columns.some(column => column.name === 'subcategory')) this.db.exec('ALTER TABLE issues ADD COLUMN subcategory TEXT');
      const version = this.db.prepare('PRAGMA user_version').get()!;
      if (Number(version.user_version) < 2) this.db.exec('PRAGMA user_version = 2');
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); this.db.close(); throw error; }
    if (!this.db.prepare("SELECT value FROM metadata WHERE key = 'seeded'").get()) {
      this.write(() => {
        for (const issue of seedIssues()) {
          this.insertIssue(issue);
          for (const userId of issue.likes) this.db.prepare('INSERT INTO likes VALUES (?, ?)').run(issue.id, userId);
          for (const event of issue.history) this.addHistory(issue.id, event.authorId, event.label, event.createdAt, event.author);
        }
        this.db.prepare("INSERT INTO metadata VALUES ('seeded', '1')").run();
      });
    }
    this.profiles = new ProfileStore(this.db);
  }

  get revision() { return Number(this.db.prepare("SELECT value FROM metadata WHERE key = 'revision'").get()!.value); }

  private write(action: () => void | boolean) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (action() !== false) this.db.prepare("UPDATE metadata SET value = CAST(value AS INTEGER) + 1 WHERE key = 'revision'").run();
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  private insertIssue(issue: Issue, photo?: Buffer) {
    this.db.prepare('INSERT INTO issues (id, title, category, description, address, lat, lng, status, author_id, created_at, sample, photo, subcategory) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      issue.id, issue.title, issue.category, issue.description, issue.address, issue.lat, issue.lng,
      issue.status, issue.authorId, issue.createdAt, issue.sample ? 1 : 0, photo ?? null, issue.subcategory ?? null,
    );
  }

  private requireIssue(id: string) {
    const row = this.db.prepare('SELECT id,title,category,subcategory,status,author_id,sample FROM issues WHERE id = ?').get(id);
    if (!row) throw new RequestError(404, 'Esse relato já foi removido.');
    return row;
  }

  private addHistory(id: string, userId: UserId | undefined, label: string, at: string, author = userId ? this.profiles?.name(userId) ?? PEOPLE[userId]?.name ?? 'Morador' : 'Demonstração') {
    this.db.prepare('INSERT INTO history VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), id, author, userId ?? null, label, at);
  }

  snapshot() {
    // One synchronous connection keeps the revision and all related rows in the same snapshot.
    const rows = this.db.prepare('SELECT id, title, category, subcategory, description, address, lat, lng, status, author_id, created_at, sample, photo IS NOT NULL AS has_photo FROM issues ORDER BY created_at DESC, id').all() as unknown as IssueRow[];
    const likes = this.db.prepare('SELECT issue_id, user_id FROM likes ORDER BY user_id').all() as { issue_id: string; user_id: UserId }[];
    const comments = this.db.prepare('SELECT * FROM comments ORDER BY created_at, rowid').all() as unknown as ChildRow[];
    const history = this.db.prepare('SELECT * FROM history ORDER BY created_at, rowid').all() as unknown as ChildRow[];
    const issues: Issue[] = rows.map(row => ({
      id: row.id, title: row.title, category: row.category, subcategory: row.subcategory ?? undefined, description: row.description, address: row.address,
      lat: row.lat, lng: row.lng, status: row.status, authorId: row.author_id, author: this.profiles.name(row.author_id),
      createdAt: row.created_at, sample: !!row.sample, photo: row.has_photo ? `/api/issues/${encodeURIComponent(row.id)}/photo` : undefined,
      likes: likes.filter(like => like.issue_id === row.id).map(like => like.user_id),
      comments: comments.filter(comment => comment.issue_id === row.id).map(comment => ({ id: comment.id, authorId: comment.author_id, author: this.profiles.name(comment.author_id), text: comment.text, createdAt: comment.created_at })),
      history: history.filter(event => event.issue_id === row.id).map(event => ({ author: event.author, authorId: event.author_id || undefined, label: event.label, createdAt: event.created_at })),
    }));
    return { issues, revision: this.revision, profiles: this.profiles.list() };
  }

  create(value: NewIssue, userId: UserId, photo?: Buffer) {
    const id = randomUUID(); const at = new Date().toISOString();
    this.write(() => {
      this.insertIssue({ ...value, id, authorId: userId, author: this.profiles.name(userId), createdAt: at, status: 'Registrada', likes: [], comments: [], history: [] }, photo);
      this.addHistory(id, userId, 'Ocorrência registrada', at);
      this.profiles.credit(userId,'report',{ ...value,id },`report:${id}`,at);
    });
    return id;
  }

  support(id: string, userId: UserId, supported: boolean) {
    this.write(() => {
      const row = this.requireIssue(id);
      const already = this.db.prepare('SELECT 1 FROM likes WHERE issue_id=? AND user_id=?').get(id,userId);
      if (supported && already) return false;
      if (supported && row.author_id === userId) throw new RequestError(400,'Você não pode apoiar seu próprio relato.');
      if (supported && this.profiles.require(userId).role !== 'resident') throw new RequestError(403,'Apenas moradores podem apoiar relatos.');
      const result = supported ? this.db.prepare('INSERT OR IGNORE INTO likes VALUES (?, ?)').run(id, userId) : this.db.prepare('DELETE FROM likes WHERE issue_id = ? AND user_id = ?').run(id, userId);
      if (!Number(result.changes)) return false;
      if (supported) this.profiles.credit(userId,'support',{ id, title: String(row.title), category: row.category as Issue['category'], subcategory: (row.subcategory ?? undefined) as Issue['subcategory'], sample: !!row.sample },`support:${randomUUID()}`);
      else this.profiles.reverse(id,'Apoio retirado',userId,'support');
      return true;
    });
  }

  comment(id: string, userId: UserId, text: string) {
    this.write(() => {
      this.requireIssue(id);
      this.db.prepare('INSERT INTO comments VALUES (?, ?, ?, ?, ?)').run(randomUUID(), id, userId, text, new Date().toISOString());
    });
  }

  status(id: string, userId: UserId, status: Status) {
    this.write(() => {
      if (this.requireIssue(id).status === status) return false;
      this.db.prepare('UPDATE issues SET status = ? WHERE id = ?').run(status, id);
      this.addHistory(id, userId, `Situação alterada para ${status.toLowerCase()}`, new Date().toISOString());
    });
  }

  remove(id: string) {
    this.write(() => { this.requireIssue(id); this.profiles.reverse(id,'Relato removido pela administração'); this.db.prepare('DELETE FROM issues WHERE id = ?').run(id); });
  }

  updateProfile(id: UserId, value: ProfileUpdate, avatar?: Buffer) { this.write(() => this.profiles.update(id,value,avatar)); }

  photo(id: string) { return this.db.prepare('SELECT photo FROM issues WHERE id = ?').get(id)?.photo as Uint8Array | undefined; }
  close() { this.db.close(); }
}
