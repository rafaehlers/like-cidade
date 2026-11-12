import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CATEGORIES, STATUSES } from '../src/domain';
import { IssueDatabase } from './database';
import { loadDemoDataset, seedDemoReports } from './demo-seed';

test('demo dataset has 20 reports in each pilot city with matching licensed JPEG photos', () => {
  const { reports, photos, descriptions } = loadDemoDataset();
  assert.equal(reports.length, 60);
  assert.equal(new Set(reports.map(report => report.id)).size, 60);
  assert.equal(photos.size, 12);
  for (const city of ['Balneário Camboriú', 'Itajaí', 'Navegantes']) {
    const local = reports.filter(report => report.city === city);
    assert.equal(local.length, 20);
    assert.deepEqual(new Set(local.map(report => report.category)), new Set(CATEGORIES));
    assert.deepEqual(new Set(local.map(report => report.status)), new Set(STATUSES));
    assert.equal(new Set(local.map(report => report.authorId)).size, 5);
  }
  for (const report of reports) {
    assert.equal(photos.get(report.photoKey)!.credit.category, report.category);
    assert.ok(descriptions.get(report.id)!.includes('Exemplo fictício'));
    assert.ok(descriptions.get(report.id)!.includes(photos.get(report.photoKey)!.credit.sourceUrl));
  }
});

test('demo import preserves existing records and reruns do not reset edits or duplicate interactions', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'like-cidade-demo-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'demo.sqlite');
  let store = new IssueDatabase(path);
  const realId = store.create({ title: 'Relato criado por um morador', category: 'Calçada', lat: -26.9078, lng: -48.6635, address: 'Local do teste', description: 'Preservar este registro' }, 'resident-ricardo');
  store.support(realId, 'resident');
  store.comment(realId, 'resident-felipe', 'Preservar este comentário');
  const before = store.snapshot('admin').issues.find(issue => issue.id === realId);
  store.close();

  const first = seedDemoReports(path);
  assert.equal(first.inserted, 60);
  assert.deepEqual(Object.values(first.byCity), [20, 20, 20]);
  store = new IssueDatabase(path);
  assert.equal(store.snapshot('admin').issues.length, 64);
  assert.deepEqual(store.snapshot('admin').issues.find(issue => issue.id === realId), before);
  const demo = store.snapshot('admin').issues.find(issue => issue.id === 'demo-city-v1-bc-01')!;
  assert.equal(demo.sample, true);
  assert.ok(store.photo(demo.id)!.length > 1000);
  store.status(demo.id, 'agency', 'Resolvida');
  store.comment(demo.id, 'resident-ricardo', 'Alteração feita durante os testes');
  const changed = store.snapshot('admin').issues.find(issue => issue.id === demo.id);
  const revision = store.revision;
  store.close();

  const second = seedDemoReports(path);
  assert.equal(second.inserted, 0);
  assert.equal(second.skipped, 60);
  assert.equal(second.revision, revision);
  store = new IssueDatabase(path);
  assert.deepEqual(store.snapshot('admin').issues.find(issue => issue.id === demo.id), changed);
  assert.deepEqual(store.snapshot('admin').issues.find(issue => issue.id === realId), before);
  assert.equal(store.snapshot('admin').issues.length, 64);
  store.close();
});

test('an invalid dataset does not modify an existing database', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'like-cidade-invalid-demo-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'demo.sqlite');
  let store = new IssueDatabase(path);
  const before = store.snapshot('admin');
  store.close();
  assert.throws(() => seedDemoReports(path, resolve(directory, 'missing-assets')));
  store = new IssueDatabase(path);
  assert.deepEqual(store.snapshot('admin'), before);
  store.close();
});
