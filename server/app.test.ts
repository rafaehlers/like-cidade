import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './app.js';
import type { IssueSnapshot } from '../src/domain.js';

const payload = { userId: 'resident', title: 'Calçada para testar em grupo', category: 'Calçada', description: 'Relato de teste', address: 'Centro, Itajaí', lat: -26.9078, lng: -48.6635 };

async function start(path = ':memory:', staticDirectory?: string) {
  const resource = createApp({ databasePath: path, staticDirectory });
  const server = resource.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    request: (path: string, method = 'GET', value?: unknown) => fetch(`${origin}/api${path}`, { method, headers: value === undefined ? {} : { 'Content-Type': 'application/json' }, body: value === undefined ? undefined : JSON.stringify(value) }),
    close: async () => { resource.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

async function subscribe(origin: string) {
  const controller = new AbortController();
  const response = await fetch(`${origin}/api/events`, { signal: controller.signal });
  assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
  const reader = response.body!.getReader(); let buffer = '';
  return {
    close: () => controller.abort(),
    next: async () => {
      const timer = setTimeout(() => controller.abort(new Error('SSE did not deliver the event within 3 seconds')), 3000);
      try {
        while (true) {
          const split = buffer.indexOf('\n\n');
          if (split >= 0) {
            const message = buffer.slice(0, split); buffer = buffer.slice(split + 2);
            if (message.includes('event: change')) return JSON.parse(message.split('data: ')[1]) as { revision: number };
            continue;
          }
          const chunk = await reader.read(); assert.equal(chunk.done, false);
          buffer += new TextDecoder().decode(chunk.value);
        }
      } finally { clearTimeout(timer); }
    },
  };
}

test('independent users share atomic supports and photos survive a server restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'like-cidade-db-'));
  const path = join(directory, 'shared.sqlite');
  let api = await start(path);
  t.after(async () => { await api.close(); await rm(directory, { recursive: true, force: true }); });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
  const created = await api.request('/issues', 'POST', { ...payload, subcategory: 'Piso quebrado', photo: `data:image/jpeg;base64,${jpeg.toString('base64')}` });
  assert.equal(created.status, 201);
  const initial = await created.json() as IssueSnapshot & { createdId: string };
  const id = initial.createdId;
  const people = ['resident-felipe', 'resident-gabriel', 'resident-sergio', 'resident-ricardo'];
  const responses = await Promise.all([
    ...people.map(userId => api.request(`/issues/${id}/support`, 'PUT', { userId, supported: true })),
  ]);
  assert.ok(responses.every(response => response.ok));
  const firstSupport = await (await api.request(`/issues/${id}/support`, 'PUT', { userId: 'resident-felipe', supported: true })).json() as IssueSnapshot;
  const repeatSupport = await (await api.request(`/issues/${id}/support`, 'PUT', { userId: 'resident-felipe', supported: true })).json() as IssueSnapshot;
  assert.equal(repeatSupport.revision, firstSupport.revision);
  assert.equal((await api.request(`/issues/${id}/status`, 'PATCH', { userId: 'agency', status: 'Em andamento', expectedStatus:'Registrada',expectedVersion:0,comment:'Atendimento iniciado' })).status, 200);
  await api.close(); api = await start(path);
  const latest = await (await api.request('/issues')).json() as IssueSnapshot;
  const issue = latest.issues.find(issue => issue.id === id)!;
  assert.deepEqual(issue.likes.sort(), people.sort());
  assert.deepEqual(issue.comments, []);
  assert.equal(issue.description, undefined);
  assert.equal(issue.status, 'Em andamento');
  assert.equal(issue.history.length, 2);
  assert.equal(issue.author, 'Rafael');
  assert.equal(issue.subcategory, 'Piso quebrado');
  const photo = await fetch(`${api.origin}${issue.photo}`);
  assert.equal(photo.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), jpeg);
});

test('subcategory is optional but must belong to the selected category when supplied', async t => {
  const api = await start(); t.after(() => api.close());
  for (const subcategory of [undefined, '', null]) {
    const response = await api.request('/issues', 'POST', { ...payload, subcategory });
    assert.equal(response.status, 201);
    const snapshot = await response.json() as IssueSnapshot & { createdId: string };
    assert.equal(snapshot.issues.find(issue => issue.id === snapshot.createdId)!.subcategory, undefined);
  }
  const response = await api.request('/issues', 'POST', { ...payload, category: 'Iluminação', subcategory: 'Lâmpada apagada' });
  assert.equal(response.status, 201);
  const saved = await response.json() as IssueSnapshot & { createdId: string };
  assert.equal(saved.issues.find(issue => issue.id === saved.createdId)!.subcategory, 'Lâmpada apagada');
  for (const subcategory of ['Piso quebrado', 'Inexistente', 42, {}]) {
    assert.equal((await api.request('/issues', 'POST', { ...payload, category: 'Iluminação', subcategory })).status, 400);
  }
  assert.equal(((await (await api.request('/issues')).json()) as IssueSnapshot).revision, saved.revision);
});

test('SSE notifies two open clients of every change and catches up after reconnecting', async t => {
  const api = await start(); const first = await subscribe(api.origin); const second = await subscribe(api.origin);
  t.after(async () => { first.close(); second.close(); await api.close(); });
  const initial = await first.next(); assert.equal((await second.next()).revision, initial.revision);
  const response = await api.request('/issues', 'POST', payload);
  const created = await response.json() as IssueSnapshot & { createdId: string };
  assert.equal((await first.next()).revision, created.revision);
  assert.equal((await second.next()).revision, created.revision);
  for (const [path, method, value] of [
    [`/issues/${created.createdId}/support`, 'PUT', { userId: 'resident-felipe', supported: true }],
    [`/issues/${created.createdId}/status`, 'PATCH', { userId: 'agency', status: 'Em andamento',expectedStatus:'Registrada',expectedVersion:0,comment:'Atendimento iniciado' }],
    [`/issues/${created.createdId}`, 'DELETE', { userId: 'admin' }],
  ] as const) {
    const response = await api.request(path, method, value); assert.ok(response.ok);
    const snapshot = await response.json() as IssueSnapshot;
    assert.equal((await first.next()).revision, snapshot.revision);
    assert.equal((await second.next()).revision, snapshot.revision);
  }
  second.close();
  const changed = await (await api.request('/issues', 'POST', { ...payload, title: 'Criado durante desconexão' })).json() as IssueSnapshot;
  assert.equal((await first.next()).revision, changed.revision);
  const reconnected = await subscribe(api.origin);
  try { assert.equal((await reconnected.next()).revision, changed.revision); } finally { reconnected.close(); }
});

test('server validates data, enforces the selected demo role, and rejects stale deleted records', async t => {
  const api = await start(); t.after(() => api.close());
  const initial = await (await api.request('/issues')).json() as IssueSnapshot;
  for (const invalid of [{ userId: '__proto__' }, { lat: 100 }, { category: 'Inexistente' }, { photo: 'data:image/svg+xml;base64,AAAA' }]) {
    assert.equal((await api.request('/issues', 'POST', { ...payload, ...invalid })).status, 400);
  }
  assert.equal((await api.request('/issues', 'POST', { ...payload, userId: 'agency' })).status, 403);
  assert.equal((await api.request('/issues/example-0/status', 'PATCH', { userId: 'resident', status: 'Em andamento',expectedStatus:'Registrada',expectedVersion:0,comment:'Atendimento iniciado' })).status, 403);
  assert.equal((await api.request('/issues/example-0', 'DELETE', { userId: 'agency' })).status, 403);
  assert.equal((await api.request('/issues/example-0/support', 'PUT', { userId: 'resident', supported: 'yes' })).status, 400);
  assert.equal((await (await api.request('/issues')).json() as IssueSnapshot).revision, initial.revision);
  assert.equal((await api.request('/issues/example-0', 'DELETE', { userId: 'admin' })).status, 200);
  assert.equal((await api.request('/issues/example-0/comments', 'POST', { userId: 'resident', text: 'Não pode ressuscitar o relato' })).status, 410);
  assert.equal((await api.request('/no-such-route')).status, 404);
});

test('deleting all shared samples does not recreate them after restarting SQLite', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'like-cidade-empty-')); const path = join(directory, 'shared.sqlite');
  let api = await start(path);
  t.after(async () => { await api.close(); await rm(directory, { recursive: true, force: true }); });
  for (const id of ['example-0', 'example-1', 'example-2']) assert.equal((await api.request(`/issues/${id}`, 'DELETE', { userId: 'admin' })).status, 200);
  await api.close(); api = await start(path);
  assert.deepEqual((await (await api.request('/issues')).json() as IssueSnapshot).issues, []);
});

test('production serves the app and JSON API from the same origin', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'like-cidade-static-'));
  await writeFile(join(directory, 'index.html'), '<html>Like Cidade compartilhado</html>');
  const api = await start(':memory:', directory);
  t.after(async () => { await api.close(); await rm(directory, { recursive: true, force: true }); });
  assert.match(await (await fetch(api.origin)).text(), /Like Cidade compartilhado/);
  assert.deepEqual(await (await api.request('/health')).json(), { ok: true, storage: 'sqlite' });
  assert.equal((await api.request('/missing')).headers.get('content-type')?.startsWith('application/json'), true);
});
