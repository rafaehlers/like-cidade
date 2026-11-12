import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IssueDatabase } from './database';

test('adding optional subcategories migrates an existing database without changing reports or interactions', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'like-cidade-migration-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'legacy.sqlite');
  const photo = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  let store = new IssueDatabase(path);
  const value = { title: 'Relato anterior às subcategorias', category: 'Calçada' as const, description: 'Manter todos os dados', address: 'Centro, Itajaí', lat: -26.9078, lng: -48.6635 };
  const id = store.create(value, 'resident-ricardo', photo);
  store.support(id, 'resident');
  store.comment(id, 'resident-felipe', 'Comentário anterior à atualização');
  store.status(id, 'agency', 'Em andamento');
  const before = JSON.parse(JSON.stringify(store.snapshot('admin')));
  store.close();

  // Reproduce the version-1 schema while retaining the populated reports and child tables.
  const legacy = new DatabaseSync(path);
  legacy.exec('ALTER TABLE issues DROP COLUMN subcategory; PRAGMA user_version = 1;');
  legacy.close();
  store = new IssueDatabase(path);
  try {
    assert.equal(store.db.prepare('PRAGMA user_version').get()!.user_version, 6);
    const migrated=JSON.parse(JSON.stringify(store.snapshot('admin')));
    assert.deepEqual(migrated.issues,before.issues);assert.deepEqual(migrated.profiles,before.profiles);assert.ok(migrated.revision>=before.revision);
    assert.deepEqual(Buffer.from(store.photo(id)!), photo);
    assert.equal(store.snapshot('admin').issues.find(issue => issue.id === id)!.subcategory, undefined);
    const created = store.create({ ...value, subcategory: 'Piso desnivelado' }, 'resident');
    assert.equal(store.snapshot('admin').issues.find(issue => issue.id === created)!.subcategory, 'Piso desnivelado');
    store.close(); store = new IssueDatabase(path);
    assert.equal(store.snapshot('admin').issues.find(issue => issue.id === created)!.subcategory, 'Piso desnivelado');
  } finally { store.close(); }
});
