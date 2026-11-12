import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from './app.js';
import { IssueDatabase } from './database.js';
import { automaticPriority, neighborhoodFromReference, serviceStats } from '../src/management.js';
import type { ManagementSnapshot, AssignmentUpdate } from '../src/management.js';
const base={title:'Calçada precisa de manutenção',category:'Calçada' as const,description:'Informação restrita do morador',address:'Centro, Itajaí',lat:-26.9078,lng:-48.6635};
const assignment={city:'Itajaí',targetUserId:'resident-felipe',expectedVersion:0,assignments:[{category:'Calçada',department:'Secretaria de Obras'}]};
async function start(path=':memory:') {
 const resource=createApp({databasePath:path});const server=resource.app.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
 return {origin,call:(route:string,actor?:string,method='GET',data?:unknown)=>fetch(`${origin}/api${route}`,{method,headers:{'Content-Type':'application/json',...(actor?{'X-Demo-User':actor}:{})},body:data?JSON.stringify({...data,userId:actor}):undefined}),close:async()=>{resource.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
test('admin assigns only scoped capabilities without changing the resident role, and revocation applies to every endpoint',async t=>{
 const api=await start();t.after(()=>api.close());
 const created=await (await api.call('/issues','resident','POST',base)).json();const id=created.createdId;
 const water=await (await api.call('/issues','resident','POST',{...base,category:'Água e esgoto'})).json();
 await api.call('/issues','resident','POST',{...base,address:'Centro, Navegantes'});
 assert.equal((await api.call('/management','resident-felipe')).status,403);
 assert.equal((await api.call('/management/assignments','agency','PUT',assignment)).status,403);
 const saved=await api.call('/management/assignments','admin','PUT',assignment);assert.equal(saved.status,200);const first=await saved.json();
 const view=await (await api.call('/management','resident-felipe')).json() as ManagementSnapshot;
 assert.ok(view.issues.some(issue=>issue.id===id));assert.ok(!view.issues.some(issue=>issue.id===water.createdId));assert.ok(view.issues.every(issue=>issue.city==='Itajaí'&&issue.category==='Calçada'));
 assert.equal(view.profiles.find(profile=>profile.id==='resident-felipe')!.role,'resident');assert.equal(view.capabilities.admin,false);assert.equal(view.capabilities.service,true);assert.equal(view.audit.length,0);
 const duplicate=await (await api.call('/management/assignments','admin','PUT',{...assignment,expectedVersion:1})).json();assert.equal(duplicate.revision,first.revision);
 assert.equal((await api.call('/management/assignments','admin','PUT',assignment)).status,409);
 assert.equal((await api.call('/management/assignments','resident-felipe','PUT',{...assignment,expectedVersion:1})).status,403);
 const update={comment:'Equipe acionada para vistoria',status:'Em andamento',expectedStatus:'Registrada',expectedVersion:0};
 assert.equal((await api.call(`/management/issues/${water.createdId}/events`,'resident-felipe','POST',update)).status,403);
 assert.equal((await api.call(`/issues/${water.createdId}/status`,'resident-felipe','PATCH',update)).status,403);
 assert.equal((await api.call(`/management/issues/${id}/events`,'resident-felipe','POST',update)).status,200);
 const revoked=await api.call('/management/assignments','admin','PUT',{...assignment,expectedVersion:1,assignments:[]});assert.equal(revoked.status,200);
 assert.equal((await api.call('/management','resident-felipe')).status,403);
 const publicView=await (await api.call('/issues','resident-felipe')).json();assert.equal(publicView.capabilities.service,false);assert.ok(!JSON.stringify(publicView).includes(base.description));assert.ok(!JSON.stringify(publicView).includes(update.comment));
 const audit=await (await api.call('/management','admin')).json();assert.equal(audit.audit.length,2);assert.deepEqual(audit.audit[0].after,[]);
});
test('updates require justification and resolution evidence, preserve versions, and keep internal notes out of public history',async t=>{
 const api=await start();t.after(()=>api.close());const id=(await (await api.call('/issues','resident','POST',base)).json()).createdId;
 const change={status:'Resolvida',expectedStatus:'Registrada',expectedVersion:0,comment:'Conserto concluído pela equipe'};
 assert.equal((await api.call(`/management/issues/${id}/events`,'agency','POST',change)).status,400);
 assert.equal((await api.call(`/management/issues/${id}/events`,'agency','POST',{...change,comment:''})).status,400);
 // Use a known JPEG photo from the manifest, not an invented image signature.
 const credits=JSON.parse(await (await import('node:fs/promises')).readFile('demo-data/photo-credits.json','utf8'));const jpeg=await readFile(join('demo-data',credits[0].file));assert.equal(jpeg[0],0xff);
 const result=await api.call(`/management/issues/${id}/events`,'agency','POST',{...change,priority:'Alta',photo:`data:image/jpeg;base64,${jpeg.toString('base64')}`});assert.equal(result.status,200);
 const saved=await result.json();const issue=saved.management.issues.find((issue:{id:string})=>issue.id===id);assert.equal(issue.status,'Resolvida');assert.equal(issue.priority,'Alta');assert.equal(issue.serviceVersion,1);assert.equal(issue.serviceEvents[0].comment,change.comment);
 const url=issue.serviceEvents[0].photo;const image=await fetch(api.origin+url,{headers:{'X-Demo-User':'agency'}});assert.deepEqual(Buffer.from(await image.arrayBuffer()),jpeg);
 assert.equal((await fetch(api.origin+url)).status,403);assert.equal((await fetch(api.origin+url,{headers:{'X-Demo-User':'resident'}})).status,403);
 const latest=await (await api.call('/issues','resident')).json();assert.ok(!JSON.stringify(latest).includes(change.comment));assert.ok(latest.issues.find((i:{id:string})=>i.id===id).history.some((event:{label:string})=>event.label==='Situação alterada para resolvida'));
 assert.equal((await api.call(`/management/issues/${id}/events`,'agency','POST',{...change,status:'Em andamento'})).status,409);
 assert.equal((await api.call(`/management/issues/${id}/events`,'agency','POST',{...change,status:'Resolvida',expectedStatus:'Resolvida',expectedVersion:1,comment:'Aguardando confirmação do morador'})).status,200);
 const after=await (await api.call('/profiles/resident')).json();assert.equal(after.total,10); // Resolved is not a confirmed conclusion.
});
test('assignment and service history survive restart and cannot be overwritten or erased',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'like-cidade-crm-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'test.sqlite');let store=new IssueDatabase(path);const id=store.create(base,'resident');
 store.management.assign('admin',assignment as AssignmentUpdate);store.management.update('resident-felipe',id,{status:'Em andamento',expectedStatus:'Registrada',expectedVersion:0,comment:'Agendada vistoria',priority:'Média'});store.close();store=new IssueDatabase(path);
 try {const snapshot=store.managementSnapshot('resident-felipe');assert.equal(snapshot.issues.find(issue=>issue.id===id)!.serviceEvents[0].comment,'Agendada vistoria');assert.equal(store.managementSnapshot('admin').audit.length,1);assert.throws(()=>store.db.exec('DELETE FROM admin_audit'),/append-only/);assert.throws(()=>store.db.prepare('UPDATE service_events SET comment=?').run('alterado'),/append-only/);assert.equal(store.db.prepare('PRAGMA integrity_check').get()!.integrity_check,'ok');}finally{store.close();}
});
test('assignment changes notify connected clients through the existing revision stream',async t=>{
 const api=await start();const controller=new AbortController();t.after(()=>{controller.abort();return api.close();});const response=await fetch(api.origin+'/api/events',{signal:controller.signal});const reader=response.body!.getReader();await reader.read();
 const saved=await (await api.call('/management/assignments','admin','PUT',assignment)).json();
 const read=await reader.read();assert.match(new TextDecoder().decode(read.value),new RegExp(`"revision":${saved.revision}`));
});
test('priority, neighborhood parsing and service metrics follow the documented rules without inventing missing history',()=>{
 const issue={...base,status:'Registrada' as const,likes:[],createdAt:'2026-11-01T12:00:00Z'};
 assert.equal(automaticPriority(issue,new Date('2026-11-11T12:00:00Z').getTime()),'Baixa');assert.equal(automaticPriority({...issue,likes:Array(10).fill('user')},new Date('2026-12-02T12:00:00Z').getTime()),'Alta');assert.equal(automaticPriority({...issue,category:'Iluminação'},new Date(issue.createdAt).getTime()),'Média');assert.equal(automaticPriority({...issue,category:'Água e esgoto'}),'Alta');
 assert.equal(neighborhoodFromReference('Rua João, 12 — Centro, Itajaí','Itajaí'),'Centro');assert.equal(neighborhoodFromReference('Centro, Itajaí · exemplo','Itajaí'),'Centro');assert.equal(neighborhoodFromReference('Rua desconhecida sem bairro','Itajaí'),undefined);
 const stats=serviceStats([{...issue,history:[],serviceEvents:[],serviceVersion:0,priority:'Baixa',id:'a',author:'Rafael',authorId:'resident',comments:[],city:'Itajaí'},{...issue,status:'Resolvida',history:[],serviceEvents:[],serviceVersion:0,priority:'Baixa',id:'b',author:'Rafael',authorId:'resident',comments:[],city:'Itajaí'}]);assert.equal(stats.pending,1);assert.equal(stats.resolutionRate,50);assert.equal(stats.averageDays,undefined);
});
