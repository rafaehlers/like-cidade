import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATEGORIES, PEOPLE, STATUSES, canManage, isUserId, validPosition, type Category, type Status, type UserId } from '../src/domain.js';
import { IssueDatabase } from './database.js';
import { RequestError } from './errors.js';

function body(req: Request): Record<string, unknown> {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new RequestError(400, 'Envie os dados em formato JSON.');
  return req.body;
}
function actor(data: Record<string, unknown>): UserId {
  if (!isUserId(data.userId)) throw new RequestError(400, 'Selecione um perfil válido da demonstração.');
  return data.userId;
}
function text(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new RequestError(400, `${label}: use de ${min} a ${max} caracteres.`);
  return value.trim();
}
function id(req: Request) { return String(req.params.id); }

export function createApp({ databasePath, staticDirectory }: { databasePath: string; staticDirectory?: string }) {
  const database = new IssueDatabase(databasePath);
  const app = express();
  const clients = new Set<Response>();
  let publishedRevision = database.revision;
  app.disable('x-powered-by');
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '5mb' }));

  const publish = () => {
    const revision = database.revision;
    if (revision === publishedRevision) return;
    publishedRevision = revision;
    for (const client of clients) client.write(`event: change\ndata: ${JSON.stringify({ revision })}\n\n`);
  };
  const finish = (res: Response, status = 200, extra = {}) => { const snapshot = database.snapshot(); publish(); res.status(status).json({ ...snapshot, ...extra }); };

  app.get('/api/health', (_req, res) => { database.db.prepare('SELECT 1').get(); res.json({ ok: true, storage: 'sqlite' }); });
  app.get('/api/issues', (_req, res) => res.json(database.snapshot()));
  app.get('/api/events', (_req, res) => {
    res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    clients.add(res);
    // Always announce the current revision on connect/reconnect, including missed changes.
    res.write(`retry: 1500\nevent: change\ndata: ${JSON.stringify({ revision: database.revision })}\n\n`);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);
    res.on('close', () => { clearInterval(heartbeat); clients.delete(res); });
  });
  app.get('/api/issues/:id/photo', (req, res) => {
    const photo = database.photo(id(req));
    if (!photo) throw new RequestError(404, 'Foto não encontrada.');
    res.type('image/jpeg').send(Buffer.from(photo));
  });
  app.post('/api/issues', (req, res) => {
    const data = body(req); const userId = actor(data);
    if (PEOPLE[userId].type === 'agency') throw new RequestError(403, 'Use um perfil de morador ou administrador para publicar.');
    if (!CATEGORIES.includes(data.category as Category)) throw new RequestError(400, 'Escolha uma categoria válida.');
    if (typeof data.lat !== 'number' || typeof data.lng !== 'number' || !validPosition({ lat: data.lat, lng: data.lng })) throw new RequestError(400, 'Escolha um ponto válido no mapa.');
    let photo: Buffer | undefined;
    if (data.photo !== undefined) {
      const match = typeof data.photo === 'string' && /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(data.photo);
      if (!match) throw new RequestError(400, 'Envie uma foto JPEG preparada pelo aplicativo.');
      photo = Buffer.from(match[1], 'base64');
      if (photo.length > 3 * 1024 * 1024 || photo.length < 4 || photo[0] !== 0xff || photo[1] !== 0xd8 || photo[2] !== 0xff) throw new RequestError(400, 'A foto é inválida ou ultrapassa 3 MB após o preparo.');
    }
    const createdId = database.create({ title: text(data.title, 'Título', 5, 100), category: data.category as Category,
      description: text(data.description ?? '', 'Descrição', 0, 1200), address: text(data.address ?? 'Local marcado no mapa', 'Referência', 1, 140),
      lat: data.lat, lng: data.lng }, userId, photo);
    res.set('Location', `/api/issues/${createdId}`);
    finish(res, 201, { createdId });
  });
  app.put('/api/issues/:id/support', (req, res) => {
    const data = body(req); const userId = actor(data);
    if (typeof data.supported !== 'boolean') throw new RequestError(400, 'Informe se deseja apoiar o relato.');
    database.support(id(req), userId, data.supported); finish(res);
  });
  app.post('/api/issues/:id/comments', (req, res) => {
    const data = body(req); database.comment(id(req), actor(data), text(data.text, 'Comentário', 1, 700)); finish(res, 201);
  });
  app.patch('/api/issues/:id/status', (req, res) => {
    const data = body(req); const userId = actor(data);
    if (!canManage(PEOPLE[userId].type)) throw new RequestError(403, 'Esse perfil não pode atualizar o atendimento.');
    if (!STATUSES.includes(data.status as Status)) throw new RequestError(400, 'Escolha uma situação válida.');
    database.status(id(req), userId, data.status as Status); finish(res);
  });
  app.delete('/api/issues/:id', (req, res) => {
    if (PEOPLE[actor(body(req))].type !== 'admin') throw new RequestError(403, 'Use o perfil de administrador para remover relatos.');
    database.remove(id(req)); finish(res);
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endereço não encontrado.' }));

  if (staticDirectory && existsSync(resolve(staticDirectory, 'index.html'))) {
    app.use(express.static(staticDirectory));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve(staticDirectory, 'index.html')));
  }
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const tooLarge = error?.type === 'entity.too.large';
    const invalidJson = error?.type === 'entity.parse.failed';
    const status = error instanceof RequestError ? error.status : tooLarge ? 413 : invalidJson ? 400 : 500;
    if (status === 500) console.error('Falha no servidor Like Cidade:', error);
    res.status(status).json({ error: error instanceof RequestError ? error.message : tooLarge ? 'A foto ultrapassa o tamanho permitido.' : invalidJson ? 'Os dados enviados são inválidos.' : 'Não foi possível concluir a ação. Tente novamente.' });
  };
  app.use(errorHandler);
  return { app, close: () => { for (const client of clients) client.end(); clients.clear(); database.close(); } };
}
