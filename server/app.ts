import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATEGORIES, STATUSES, isSubcategory, validPosition, type Category, type Status, type UserId } from '../src/domain.js';
import { IssueDatabase } from './database.js';
import { RequestError } from './errors.js';
import { resolveDemoActor } from './identity.js';
import { PRIORITIES, type AssignmentUpdate, type ServiceUpdate } from '../src/management.js';
import { PILOT_CITIES, type PilotCity } from '../src/profiles.js';
import { renderReportPage } from './sharing.js';

function body(req: Request): Record<string, unknown> {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new RequestError(400, 'Envie os dados em formato JSON.');
  return req.body;
}
function text(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new RequestError(400, `${label}: use de ${min} a ${max} caracteres.`);
  return value.trim();
}
function id(req: Request) { return String(req.params.id); }

export function createApp({ databasePath, staticDirectory, publicSiteUrl = process.env.PUBLIC_SITE_URL || 'https://likecidade.com.br', resolveActor = resolveDemoActor }: {
  databasePath: string; staticDirectory?: string; publicSiteUrl?:string;
  resolveActor?: (request: Request, data: Record<string, unknown>) => UserId;
}) {
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
  const viewer = (req:Request) => {
    const selected=req.get('X-Demo-User');
    if(!selected && resolveActor===resolveDemoActor)return undefined;
    return resolveActor(req,{userId:selected});
  };
  const finish = (req:Request, res: Response, status = 200, extra = {}) => { const snapshot = database.snapshot(viewer(req)); publish(); res.status(status).json({ ...snapshot, ...extra }); };

  app.get('/api/health', (_req, res) => { database.db.prepare('SELECT 1').get(); res.json({ ok: true, storage: 'sqlite' }); });
  app.get('/api/issues', (_req, res) => res.json(database.snapshot(viewer(_req))));
  app.get('/api/management',(req,res)=>res.json(database.managementSnapshot(viewer(req))));
  app.put('/api/management/assignments',(req,res)=>{
    const data=body(req);const userId=resolveActor(req,data);
    if(!(PILOT_CITIES as readonly unknown[]).includes(data.city)||typeof data.targetUserId!=='string'||!Number.isSafeInteger(data.expectedVersion)||Number(data.expectedVersion)<0||!Array.isArray(data.assignments)||data.assignments.length>CATEGORIES.length)throw new RequestError(400,'Confira a cidade, o usuário e as categorias.');
    const assignments=data.assignments.map((item:unknown)=>{
      if(!item||typeof item!=='object'||Array.isArray(item))throw new RequestError(400,'Categoria inválida.');
      const row=item as Record<string,unknown>;if(!CATEGORIES.includes(row.category as Category))throw new RequestError(400,'Categoria inválida.');
      return {category:row.category as Category,department:text(row.department ?? '', 'Órgão ou secretaria',0,80)};
    });
    if(new Set(assignments.map(item=>item.category)).size!==assignments.length)throw new RequestError(400,'Não repita categorias.');
    database.management.assign(userId,{city:data.city,targetUserId:data.targetUserId,expectedVersion:data.expectedVersion,assignments} as AssignmentUpdate);finish(req,res,200,viewer(req)===userId?{management:database.managementSnapshot(userId)}:{});
  });
  const updateService=(req:Request,res:Response)=>{
    const data=body(req);const actor=resolveActor(req,data);
    if(!STATUSES.includes(data.status as Status)||!STATUSES.includes(data.expectedStatus as Status)||!Number.isSafeInteger(data.expectedVersion)||Number(data.expectedVersion)<0)throw new RequestError(400,'Escolha um status válido e atualize os dados do atendimento.');
    if(data.priority!==undefined && data.priority!=='auto'&&!PRIORITIES.includes(data.priority as import('../src/management.js').Priority))throw new RequestError(400,'Prioridade inválida.');
    let photo:Buffer|undefined;
    if(data.photo!==undefined){const match=typeof data.photo==='string'&&/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(data.photo);if(!match)throw new RequestError(400,'Envie uma foto JPEG preparada pelo aplicativo.');photo=Buffer.from(match[1],'base64');if(photo.length<4||photo.length>3*1024*1024||photo[0]!==0xff||photo[1]!==0xd8||photo[2]!==0xff)throw new RequestError(400,'Foto de evidência inválida ou maior que 3 MB.');}
    database.management.update(actor,id(req),{comment:text(data.comment,'Comentário interno',3,1200),status:data.status,expectedStatus:data.expectedStatus,expectedVersion:data.expectedVersion,priority:data.priority,photo:data.photo} as ServiceUpdate,photo);finish(req,res,200,viewer(req)===actor?{management:database.managementSnapshot(actor)}:{});
  };
  app.post('/api/management/issues/:id/events',updateService);
  app.get('/api/management/issues/:id/events/:eventId/photo',(req,res)=>{const photo=database.management.photo(viewer(req),id(req),String(req.params.eventId));res.type('image/jpeg').send(Buffer.from(photo));});
  app.get('/api/ranking',(req,res)=>{
    if(Object.keys(req.query).some(key=>!['period','theme','city','userId'].includes(key)))throw new RequestError(400,'Filtros de ranking inválidos.');
    const period=req.query.period ?? 'all';const theme=req.query.theme ?? 'all';const city=req.query.city ?? 'all';
    if(typeof period!=='string'||typeof theme!=='string'||typeof city!=='string')throw new RequestError(400,'Filtros de ranking inválidos.');
    if(!['week','month','all'].includes(String(period)) || !['all','reports','supports','accessibility'].includes(String(theme)) || (city!=='all' && !(PILOT_CITIES as readonly unknown[]).includes(city)))throw new RequestError(400,'Filtros de ranking inválidos.');
    if(req.query.userId!==undefined && typeof req.query.userId!=='string')throw new RequestError(400,'Perfil inválido.');
    res.json(database.profiles.ranking({period:period as import('../src/ranking.js').RankingPeriod,theme:theme as import('../src/ranking.js').RankingTheme,city:city as PilotCity|'all',userId:req.query.userId as string|undefined},database.revision));
  });
  app.get('/api/profiles/:id', (req,res) => res.json(database.profiles.details(id(req),database.revision)));
  app.get('/api/profiles/:id/avatar', (req,res) => {
    const avatar=database.profiles.avatar(id(req));
    if (!avatar) throw new RequestError(404,'Foto de perfil não encontrada.');
    res.type('image/jpeg').send(Buffer.from(avatar));
  });
  app.patch('/api/profiles/:id', (req,res) => {
    const data=body(req); const userId=resolveActor(req,data);
    if (userId!==id(req)) throw new RequestError(403,'Você só pode editar o perfil selecionado.');
    const allowed=['userId','nickname','city','bio','avatar'];
    if (Object.keys(data).some(key=>!allowed.includes(key))) throw new RequestError(400,'O perfil contém campos que não podem ser alterados.');
    const nickname=text(data.nickname,'Apelido',2,30);
    if (/[\u0000-\u001f\u007f]/.test(nickname) || nickname.includes('@')) throw new RequestError(400,'Use um apelido sem e-mail ou caracteres de controle.');
    if (!(PILOT_CITIES as readonly unknown[]).includes(data.city)) throw new RequestError(400,'Escolha um município do piloto.');
    let avatar: Buffer | undefined;
    if (data.avatar !== undefined && data.avatar !== null) {
      const match=typeof data.avatar==='string' && /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(data.avatar);
      if (!match) throw new RequestError(400,'Escolha uma foto JPEG preparada pelo aplicativo.');
      avatar=Buffer.from(match[1],'base64');
      if (avatar.length>512*1024 || avatar.length<4 || avatar[0]!==0xff || avatar[1]!==0xd8 || avatar[2]!==0xff) throw new RequestError(400,'Foto de perfil inválida ou maior que 512 KB.');
    }
    database.updateProfile(userId,{nickname,city:data.city as PilotCity,bio:text(data.bio ?? '', 'Sobre você',0,160),avatar:data.avatar as string | null | undefined},avatar);
    finish(req,res);
  });
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
    const data = body(req); const userId = resolveActor(req,data);
    if (database.profiles.require(userId).role === 'agency') throw new RequestError(403, 'Use um perfil de morador ou administrador para publicar.');
    if (!CATEGORIES.includes(data.category as Category)) throw new RequestError(400, 'Escolha uma categoria válida.');
    const category = data.category as Category;
    const subcategory = typeof data.subcategory === 'string' ? data.subcategory.trim() || undefined : data.subcategory ?? undefined;
    if (subcategory !== undefined && !isSubcategory(category, subcategory)) throw new RequestError(400, 'Escolha uma subcategoria válida para a categoria selecionada.');
    if (typeof data.lat !== 'number' || typeof data.lng !== 'number' || !validPosition({ lat: data.lat, lng: data.lng })) throw new RequestError(400, 'Escolha um ponto válido no mapa.');
    let photo: Buffer | undefined;
    if (data.photo !== undefined) {
      const match = typeof data.photo === 'string' && /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(data.photo);
      if (!match) throw new RequestError(400, 'Envie uma foto JPEG preparada pelo aplicativo.');
      photo = Buffer.from(match[1], 'base64');
      if (photo.length > 3 * 1024 * 1024 || photo.length < 4 || photo[0] !== 0xff || photo[1] !== 0xd8 || photo[2] !== 0xff) throw new RequestError(400, 'A foto é inválida ou ultrapassa 3 MB após o preparo.');
    }
    const createdId = database.create({ title: text(data.title, 'Título', 5, 100), category, subcategory,
      description: text(data.description ?? '', 'Comentário para o atendimento', 0, 1200), address: text(data.address ?? 'Local marcado no mapa', 'Referência', 1, 140),
      lat: data.lat, lng: data.lng }, userId, photo);
    res.set('Location', `/api/issues/${createdId}`);
    finish(req,res, 201, { createdId });
  });
  app.put('/api/issues/:id/support', (req, res) => {
    const data = body(req); const userId = resolveActor(req,data);
    if (typeof data.supported !== 'boolean') throw new RequestError(400, 'Informe se deseja apoiar o relato.');
    database.support(id(req), userId, data.supported); finish(req,res);
  });
  app.post('/api/issues/:id/comments', (_req, _res) => { throw new RequestError(410,'A conversa foi encerrada. Envie as informações para o atendimento no formulário do relato.'); });
  app.patch('/api/issues/:id/status',updateService);
  app.delete('/api/issues/:id', (req, res) => {
    if (database.profiles.require(resolveActor(req,body(req))).role !== 'admin') throw new RequestError(403, 'Use o perfil de administrador para remover relatos.');
    database.remove(id(req)); finish(req,res);
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endereço não encontrado.' }));

  if (staticDirectory && existsSync(resolve(staticDirectory, 'index.html'))) {
    const pageTemplate=readFileSync(resolve(staticDirectory,'index.html'),'utf8');
    app.get('/relatos/:id',(req,res)=>{
      const report=database.publicReport(id(req));
      res.set('Cache-Control','no-store').status(report?200:404).type('html').send(renderReportPage(pageTemplate,report,publicSiteUrl));
    });
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
