import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { IssueDatabase } from './database.js';
import { createApp } from './app.js';
import { profileProgress, type PointEntry, type ProfileDetails } from '../src/profiles.js';
const value={ title:'Rampa precisa de manutenção', category:'Calçada' as const, subcategory:'Rampa de acesso danificada' as const, description:'',address:'Centro, Itajaí',lat:-26.9078,lng:-48.6635 };

test('ledger awards real resident actions once, reverses supports/deletions, and never mistakes resolved for concluded',()=>{
  const store=new IssueDatabase(':memory:');
  try {
    assert.equal(store.profiles.details('resident',store.revision).total,0);
    const id=store.create(value,'resident');
    assert.equal(store.profiles.details('resident',store.revision).total,10);
    assert.throws(()=>store.support(id,'resident',true),/próprio/);
    assert.throws(()=>store.support(id,'agency',true),/moradores/);
    store.support(id,'resident-felipe',true);store.support(id,'resident-felipe',true);
    assert.equal(store.profiles.details('resident-felipe',store.revision).ledger.length,1);
    store.support(id,'resident-felipe',false);store.support(id,'resident-felipe',false);
    store.support(id,'resident-felipe',true);
    let details=store.profiles.details('resident-felipe',store.revision);
    assert.equal(details.total,2);assert.deepEqual(details.ledger.map(entry=>entry.amount),[2,-2,2]);
    assert.deepEqual(details.ledger.map(entry=>entry.balance),[2,0,2]);
    store.status(id,'agency','Resolvida');store.status(id,'agency','Em andamento');store.status(id,'agency','Resolvida');
    store.comment(id,'resident','Teste de comentário que não pontua');
    assert.equal(store.profiles.details('resident',store.revision).total,10);
    store.support('example-1','resident-gabriel',true);
    assert.equal(store.profiles.details('resident-gabriel',store.revision).total,0);
    store.create(value,'admin');
    assert.equal(store.profiles.details('admin',store.revision).total,0);
    store.remove(id);
    for(const user of ['resident','resident-felipe']) {
      details=store.profiles.details(user,store.revision);
      assert.equal(details.total,0);assert.ok(details.ledger.length>=2);
      assert.equal(details.stats.reports+details.stats.supports,0);
      assert.ok(details.ledger.some(entry=>entry.amount<0));
    }
    assert.throws(()=>store.db.exec('UPDATE point_ledger SET amount=1000'),/append-only/);
    assert.throws(()=>store.db.exec('DELETE FROM point_ledger'),/append-only/);
  } finally {store.close();}
});

test('profile thresholds and accessibility badges use active qualifying actions and reverse cleanly',()=>{
  const store=new IssueDatabase(':memory:');
  try {
    const ids=Array.from({length:10},()=>store.create(value,'resident'));
    let details=store.profiles.details('resident',store.revision);
    assert.equal(details.total,100);assert.equal(details.level.title,'Vizinho Atento');
    assert.equal(details.achievements.find(item=>item.id==='accessibility')!.progress,10);
    assert.ok(details.achievements.find(item=>item.id==='accessibility')!.earnedAt);
    store.remove(ids[0]);
    details=store.profiles.details('resident',store.revision);
    assert.equal(details.total,90);assert.equal(details.level.level,1);
    assert.equal(details.achievements.find(item=>item.id==='accessibility')!.earnedAt,undefined);
    store.create({...value,subcategory:'Piso quebrado'},'resident');
    assert.equal(store.profiles.details('resident',store.revision).achievements.find(item=>item.id==='accessibility')!.progress,9);
    for(const [total,level] of [[0,1],[99,1],[100,2],[299,2],[300,3],[699,3],[700,4],[1499,4],[1500,5],[2000,5]]) {
      const entry={id:'points',action:'report',amount:total,createdAt:new Date().toISOString()} as PointEntry;
      const result=profileProgress(details.profile,[entry],1);
      assert.equal(result.level.level,level);assert.ok(result.progress>=0 && result.progress<=100);
    }
  } finally {store.close();}
});

test('legacy contributions are imported once, samples excluded, and ledger survives reopen',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'like-cidade-profile-migration-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const path=join(directory,'legacy.sqlite');let store=new IssueDatabase(path);
  const id=store.create(value,'resident');store.support(id,'resident-felipe',true);
  const issues=JSON.parse(JSON.stringify(store.snapshot().issues));store.close();
  const legacy=new DatabaseSync(path);
  legacy.exec("DROP TRIGGER immutable_ledger_delete; DROP TRIGGER immutable_ledger_update; DROP TABLE agency_scopes; DROP TABLE point_locations; DROP TABLE demo_point_ledger; DROP TABLE point_ledger; DROP TABLE user_identities; DROP TABLE profiles; DELETE FROM metadata WHERE key IN ('points_initialized','agency_scopes_initialized'); PRAGMA user_version=2;");legacy.close();
  store=new IssueDatabase(path);
  const first=store.profiles.details('resident',store.revision);
  assert.equal(first.total,10);assert.match(first.ledger[0].reason,/importado/);
  assert.equal(store.profiles.details('resident-felipe',store.revision).total,2);
  assert.deepEqual(JSON.parse(JSON.stringify(store.snapshot().issues)),issues);
  store.close();store=new IssueDatabase(path);
  try {assert.deepEqual(store.profiles.details('resident',store.revision),first);assert.equal(store.db.prepare('PRAGMA integrity_check').get()!.integrity_check,'ok');} finally{store.close();}
});

test('profile API persists nicknames and photos, rejects tampering, and publishes changes over SSE',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'like-cidade-profile-api-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const path=join(directory,'test.sqlite');
  const start=async()=>{
    const app=createApp({databasePath:path});const server=app.app.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address && typeof address!=='string');
    const origin=`http://127.0.0.1:${address.port}`;
    return {origin,call:(route:string,method='GET',data?:unknown)=>fetch(`${origin}/api${route}`,{method,headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined}),close:async()=>{app.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
  };
  let api=await start();t.after(()=>api.close());
  const controller=new AbortController();const events=await fetch(`${api.origin}/api/events`,{signal:controller.signal});const reader=events.body!.getReader();await reader.read();
  const jpeg=Buffer.from([0xff,0xd8,0xff,0xd9]);
  const update={userId:'resident',nickname:'Rafa da cidade',city:'Navegantes',bio:'Cuidando da vizinhança',avatar:`data:image/jpeg;base64,${jpeg.toString('base64')}`};
  const saved=await api.call('/profiles/resident','PATCH',update);assert.equal(saved.status,200);
  const snapshot=await saved.json();assert.ok(snapshot.profiles.some((p: {nickname:string})=>p.nickname==='Rafa da cidade'));
  const event=await Promise.race([reader.read(),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('SSE timed out')),2000))]);
  assert.match(new TextDecoder().decode(event.value),new RegExp(`"revision":${snapshot.revision}`));controller.abort();
  for(const data of [{...update,userId:'resident-felipe'},{...update,nickname:'x'},{...update,city:'Outra cidade'},{...update,role:'admin'},{...update,workosUserId:'user_fake'},{...update,total:999},{...update,avatar:'https://example.com/picture.jpg'}]) {
    assert.ok((await api.call('/profiles/resident','PATCH',data)).status>=400);
  }
  await api.close();api=await start();
  const profile=await (await api.call('/profiles/resident')).json() as ProfileDetails;
  assert.equal(profile.profile.nickname,'Rafa da cidade');assert.equal(profile.profile.city,'Navegantes');assert.equal(profile.profile.bio,update.bio);
  assert.equal(profile.profile.role,'resident');assert.equal(profile.total,0);
  assert.equal('email' in profile.profile,false);assert.equal('workosUserId' in profile.profile,false);
  assert.deepEqual(Buffer.from(await (await fetch(api.origin+profile.profile.avatarUrl)).arrayBuffer()),jpeg);
  const issue=await (await api.call('/issues','POST',{...value,userId:'resident'})).json();assert.equal(issue.issues.find((i:{id:string})=>i.id===issue.createdId).author,'Rafa da cidade');
  assert.equal((await api.call('/profiles/missing')).status,404);
  assert.equal((await api.call('/profiles/resident','PATCH',{...update,avatar:null})).status,200);
  assert.equal((await api.call('/profiles/resident/avatar')).status,404);
});

test('a future verified identity resolver uses a stable application ID and ignores a forged browser actor',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'like-cidade-trusted-identity-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const path=join(directory,'identity.sqlite');const store=new IssueDatabase(path);
  const userId='app-user-61c32e78';
  store.db.prepare('INSERT INTO profiles (id,nickname,city,role,updated_at) VALUES (?,?,?,?,?)').run(userId,'Vizinho independente','Itajaí','resident',new Date().toISOString());
  store.db.prepare('INSERT INTO user_identities VALUES (?,?,?)').run('workos','user_test_subject',userId);store.close();
  const resource=createApp({databasePath:path,resolveActor:()=>userId});
  const server=resource.app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{resource.close();server.closeAllConnections();server.close();});const address=server.address();assert.ok(address && typeof address!=='string');
  const origin=`http://127.0.0.1:${address.port}`;
  const response=await fetch(`${origin}/api/profiles/${userId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:'admin',nickname:'Vizinho',city:'Itajaí',bio:''})});
  assert.equal(response.status,200);
  const created=await fetch(`${origin}/api/issues`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...value,userId:'admin'})});
  assert.equal(created.status,201);
  const snapshot=await created.json();const issue=snapshot.issues.find((item:{id:string})=>item.id===snapshot.createdId);
  assert.equal(issue.authorId,userId);assert.equal(issue.author,'Vizinho');
  const details=await (await fetch(`${origin}/api/profiles/${userId}`)).json();assert.equal(details.total,10);
});
