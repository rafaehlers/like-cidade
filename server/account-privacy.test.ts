import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IssueDatabase } from './database.js';
import { createApp } from './app.js';

const report={title:'Piso precisando de manutenção',category:'Calçada' as const,address:'Centro, Itajaí',description:'Comentário privado do titular',lat:-26.9,lng:-48.66};
const photo=Buffer.from([0xff,0xd8,0xff,0xd9]);
async function start(verified=false,age=0) {
  const resource=createApp({databasePath:':memory:',resolvePrivacySession:verified?req=>req.get('X-Test-Verified')?{userId:req.get('X-Test-Verified')!,authenticatedAt:Date.now()-age}:undefined:undefined});
  const server=resource.app.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address!=='string');
  const origin=`http://127.0.0.1:${address.port}`;
  return {origin,call:(route:string,method='GET',data?:unknown,headers:Record<string,string>={})=>fetch(`${origin}/api${route}`,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined}),close:()=>{resource.close();server.closeAllConnections();server.close();}};
}

test('public selectors and forged account ids never unlock private exports or account deletion',async t=>{
  const api=await start();t.after(api.close);
  assert.deepEqual((await (await api.call('/account/privacy')).json()).verified,false);
  for(const fake of ['resident','admin']) {
    const headers={'X-Demo-User':fake,'X-Test-Verified':fake};
    assert.equal((await api.call('/account/export?userId='+fake,'GET',undefined,headers)).status,401);
    assert.equal((await api.call('/account','DELETE',{confirmation:'EXCLUIR MINHA CONTA',acknowledged:true,userId:fake},headers)).status,401);
  }
  assert.equal((await api.call('/profiles/resident')).status,200);
});

test('export includes only the verified owner data and attachments, without other users private notes',()=>{
  const store=new IssueDatabase(':memory:');
  try {
    store.updateProfile('resident',{nickname:'Dona dos dados',city:'Itajaí',bio:'Minha apresentação',avatar:'prepared'},photo);
    const own=store.create(report,'resident',photo);
    const other=store.create({...report,title:'Outro relato na cidade',description:'SEGREDO DE OUTRA PESSOA'},'resident-felipe');
    store.comment(own,'resident-felipe','OUTRO COMENTÁRIO PRIVADO');
    store.comment(other,'resident','Comentário escrito pelo titular');
    store.support(other,'resident',true);
    const exported=store.privacy.export('resident');
    assert.equal(exported.profile.nickname,'Dona dos dados');assert.equal(exported.profile.avatar,`data:image/jpeg;base64,${photo.toString('base64')}`);
    assert.equal(exported.reports.find(row=>row.id===own)!.description,report.description);
    assert.equal(exported.reports.find(row=>row.id===own)!.photo,exported.profile.avatar);
    assert.ok(!exported.reports.some(row=>row.id===other));
    assert.ok(exported.comments.some(row=>row.text==='Comentário escrito pelo titular'));
    assert.ok(!JSON.stringify(exported).includes('SEGREDO DE OUTRA PESSOA'));
    assert.ok(!JSON.stringify(exported).includes('OUTRO COMENTÁRIO PRIVADO'));
    assert.ok(exported.supports.some(row=>row.issue_id===other));
    assert.ok(exported.pointLedger.length>0);
  } finally {store.close();}
});

test('erasure removes account, attachments, authored reports and related points, and survives restart without reseeding',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'like-privacy-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'test.sqlite');let store=new IssueDatabase(path);
  const owned=store.create(report,'resident',photo);const other=store.create({...report,title:'Relato que deve permanecer'},'resident-felipe',photo);
  store.updateProfile('resident',{nickname:'Nome privado para remover',city:'Itajaí',bio:'Minha bio',avatar:'prepared'},photo);
  store.support(owned,'resident-felipe',true);store.support(owned,'resident-felipe',false); // credit + reversal FKs
  store.support(other,'resident',true);store.comment(other,'resident','Texto privado a excluir');
  store.management.assign('admin',{city:'Itajaí',targetUserId:'resident',expectedVersion:0,assignments:[{category:'Calçada',department:'Obras'}]});
  const before=store.revision;const receipt=store.privacy.erase('resident');
  assert.ok(receipt.receiptId);assert.ok(receipt.completedAt);assert.equal(store.revision,before+1);
  for(const [table,column] of [['profiles','id'],['user_identities','user_id'],['point_ledger','user_id'],['demo_point_ledger','user_id'],['agency_scopes','user_id'],['assignment_versions','user_id'],['likes','user_id'],['comments','author_id']])assert.equal(store.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${column}=?`).get('resident')!.n,0);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM issues WHERE id=?').get(owned)!.n,0);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM point_ledger WHERE issue_id=?').get(owned)!.n,0);
  assert.deepEqual(Buffer.from(store.photo(other)!),photo);
  assert.ok(store.profiles.require('resident-felipe'));
  assert.throws(()=>store.profiles.require('resident'),/não encontrado/);
  assert.equal(store.db.prepare('PRAGMA foreign_key_check').all().length,0);
  const serialized=JSON.stringify(store.snapshot());assert.ok(!serialized.includes('Nome privado para remover'));assert.ok(!serialized.includes('Texto privado a excluir'));
  store.close();store=new IssueDatabase(path);
  try {assert.throws(()=>store.profiles.require('resident'));assert.equal(store.db.prepare('SELECT count(*) AS n FROM privacy_receipts').get()!.n,1);assert.equal(store.db.prepare('PRAGMA integrity_check').get()!.integrity_check,'ok');}finally{store.close();}
});

test('staff erasure strips names, private comments and evidence while preserving anonymous status chronology',()=>{
  const store=new IssueDatabase(':memory:');
  try {
    const id=store.create(report,'resident');
    store.management.update('agency',id,{status:'Resolvida',expectedStatus:'Registrada',expectedVersion:0,comment:'Nome identificável no atendimento',photo:'image'},photo);
    store.privacy.erase('agency');
    const publicIssue=store.snapshot().issues.find(issue=>issue.id===id)!;
    assert.equal(publicIssue.status,'Resolvida');assert.ok(publicIssue.history.some(event=>event.author==='Conta excluída'));
    const event=store.managementSnapshot('admin').issues.find(issue=>issue.id===id)!.serviceEvents[0];
    assert.equal(event.author,'Conta excluída');assert.equal(event.photo,undefined);assert.ok(!event.comment.includes('Nome identificável'));
    assert.ok(!store.profiles.list().some(profile=>profile.id==='privacy-removed'));
  }finally{store.close();}
});

test('failed erasure rolls back atomically and cannot leave append-only history unlocked',()=>{
  const store=new IssueDatabase(':memory:');
  try {
    const id=store.create(report,'resident');store.support(id,'resident-felipe',true);const before=JSON.stringify(store.snapshot('admin'));
    store.db.exec("CREATE TRIGGER fail_erasure BEFORE DELETE ON profiles WHEN OLD.id='resident' BEGIN SELECT RAISE(ABORT,'Forced failure'); END;");
    assert.throws(()=>store.privacy.erase('resident'),/Forced failure/);assert.equal(JSON.stringify(store.snapshot('admin')),before);
    assert.throws(()=>store.db.exec('DELETE FROM point_ledger'),/append-only/);
    assert.throws(()=>store.db.exec("UPDATE point_ledger SET issue_title='changed'"),/append-only/);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM privacy_receipts').get()!.n,0);
  }finally{store.close();}
});

test('verified account routes require fresh login, same-origin and explicit confirmation; selected ids cannot choose another account',async t=>{
  const api=await start(true);t.after(api.close);
  const headers={'X-Test-Verified':'resident'};
  const caps=await (await api.call('/account/privacy','GET',undefined,headers)).json();assert.equal(caps.canExport,true);assert.equal(caps.canDelete,true);
  const exported=await api.call('/account/export?userId=resident-felipe','GET',undefined,headers);
  assert.match(exported.headers.get('content-disposition')! ,/attachment/);assert.equal((await exported.json()).profile.id,'resident');
  assert.equal((await api.call('/account','DELETE',{confirmation:'EXCLUIR MINHA CONTA',acknowledged:true,userId:'resident-felipe'},headers)).status,400);
  for(const data of [{confirmation:'excluir',acknowledged:true},{confirmation:'EXCLUIR MINHA CONTA',acknowledged:false}])assert.equal((await api.call('/account','DELETE',data,headers)).status,400);
  const payload={confirmation:'EXCLUIR MINHA CONTA',acknowledged:true};
  assert.equal((await api.call('/account','DELETE',payload,{...headers,Origin:'https://other.example'})).status,403);
  assert.equal((await api.call('/account','DELETE',payload,{...headers,'Sec-Fetch-Site':'cross-site'})).status,403);
  const controller=new AbortController();t.after(()=>controller.abort());const stream=await fetch(api.origin+'/api/events',{signal:controller.signal});const reader=stream.body!.getReader();await reader.read();
  const deleted=await api.call('/account','DELETE',payload,headers);assert.equal(deleted.status,200);assert.ok((await deleted.json()).receiptId);
  assert.match(new TextDecoder().decode((await reader.read()).value),/event: change/);controller.abort();
  assert.equal((await api.call('/profiles/resident')).status,404);assert.equal((await api.call('/profiles/resident-felipe')).status,200);
});

test('old verified sessions cannot perform irreversible account erasure',async t=>{
  const api=await start(true,11*60*1000);t.after(api.close);const headers={'X-Test-Verified':'resident'};
  assert.equal((await (await api.call('/account/privacy','GET',undefined,headers)).json()).canDelete,false);
  assert.equal((await api.call('/account','DELETE',{confirmation:'EXCLUIR MINHA CONTA',acknowledged:true},headers)).status,401);
  assert.equal((await api.call('/profiles/resident')).status,200);
});
