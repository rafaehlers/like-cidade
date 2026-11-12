import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { IssueDatabase } from './database.js';
import { createApp } from './app.js';
const privateText='Detalhe confidencial do formulário';const legacyText='Comentário anterior preservado';
const payload={title:'Problema na calçada para testar',category:'Calçada' as const,description:privateText,address:'Centro, Itajaí',lat:-26.9,lng:-48.66};

test('only admin and the assigned agency receive private report text and legacy comments',()=>{
  const store=new IssueDatabase(':memory:');
  try {
    const id=store.create(payload,'resident');store.comment(id,'resident-felipe',legacyText);
    const outside=store.create({...payload,address:'Centro, Navegantes'},'resident');
    const unknown=store.create({...payload,address:'Local sem município'},'resident');
    for(const viewer of [undefined,'resident','resident-felipe','resident-gabriel','resident-sergio','resident-ricardo']) {
      const snapshot=JSON.stringify(store.snapshot(viewer));assert.ok(!snapshot.includes(privateText));assert.ok(!snapshot.includes(legacyText));
      for(const issue of store.snapshot(viewer).issues){assert.equal(issue.description,undefined);assert.deepEqual(issue.comments,[]);assert.equal(issue.privateDetailsVisible,false);}
    }
    const agency=store.snapshot('agency');assert.equal(agency.issues.find(issue=>issue.id===id)!.description,privateText);
    assert.equal(agency.issues.find(issue=>issue.id===id)!.comments![0].text,legacyText);
    for(const key of [outside,unknown]){assert.equal(agency.issues.find(issue=>issue.id===key)!.description,undefined);assert.deepEqual(agency.issues.find(issue=>issue.id===key)!.comments,[]);}
    // Public municipality edits never expand an agency's assigned jurisdiction.
    store.updateProfile('agency',{nickname:'Marcos',city:'Navegantes',bio:''});
    assert.equal(store.snapshot('agency').issues.find(issue=>issue.id===outside)!.description,undefined);
    store.db.prepare('DELETE FROM agency_scopes WHERE user_id=? AND city=? AND category=?').run('agency','Itajaí','Calçada');
    assert.equal(store.snapshot('agency').issues.find(issue=>issue.id===id)!.description,undefined);
    for(const issue of store.snapshot('admin').issues.filter(issue=>[id,outside,unknown].includes(issue.id)))assert.equal(issue.description,privateText);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM comments').get()!.n,1);
  } finally{store.close();}
});

test('all read/write response paths redact notes and the old conversation endpoint is closed',async t=>{
  const resource=createApp({databasePath:':memory:'});const server=resource.app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{resource.close();server.closeAllConnections();server.close();});const address=server.address();assert.ok(address && typeof address!=='string');
  const call=(path:string,method='GET',data?:unknown,viewer?:string)=>fetch(`http://127.0.0.1:${address.port}/api${path}`,{method,headers:{'Content-Type':'application/json',...(viewer?{'X-Demo-User':viewer}:{})},body:data?JSON.stringify(data):undefined});
  const created=await (await call('/issues','POST',{...payload,userId:'resident'},'resident')).json();
  const id=created.createdId;assert.equal(created.viewerId,'resident');assert.ok(!JSON.stringify(created).includes(privateText));
  const admin=await (await call('/issues','GET',undefined,'admin')).json();assert.ok(JSON.stringify(admin).includes(privateText));
  // Same global revision, different viewer: the browser must re-fetch and replace its snapshot.
  const resident=await (await call('/issues','GET',undefined,'resident')).json();assert.equal(admin.revision,resident.revision);assert.equal(resident.viewerId,'resident');assert.ok(!JSON.stringify(resident).includes(privateText));
  for(const [path,method,value] of [
    [`/issues/${id}/support`,'PUT',{userId:'resident-felipe',supported:true}],
    ['/profiles/resident','PATCH',{userId:'resident',nickname:'Rafa',city:'Itajaí',bio:''}],
    [`/issues/${id}/status`,'PATCH',{userId:'agency',status:'Em andamento'}],
  ] as const){const response=await call(path,method,value);assert.equal(response.status,200);assert.ok(!(await response.text()).includes(privateText));}
  const before=await (await call('/issues')).json();
  for(const userId of ['resident','agency','admin'])assert.equal((await call(`/issues/${id}/comments`,'POST',{userId,text:'Novo comentário'})).status,410);
  const after=await (await call('/issues')).json();assert.equal(before.revision,after.revision);
  assert.equal((await call('/issues','GET',undefined,'not-a-profile')).status,400);
  const fakeQuery=await (await call('/issues?userId=admin')).text();assert.ok(!fakeQuery.includes(privateText));
});

test('a verified session resolver determines private visibility rather than browser role hints',async t=>{
  const resource=createApp({databasePath:':memory:',resolveActor:()=> 'resident'});const server=resource.app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{resource.close();server.closeAllConnections();server.close();});const address=server.address();assert.ok(address && typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
  await fetch(`${origin}/api/issues`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,userId:'admin'})});
  const result=await (await fetch(`${origin}/api/issues`,{headers:{'X-Demo-User':'admin'}})).text();assert.ok(!result.includes(privateText));assert.equal(JSON.parse(result).viewerId,'resident');
});

test('privacy migration preserves report bodies and historical comments on disk and across restart',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'like-cidade-private-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'test.sqlite');let store=new IssueDatabase(path);
  const id=store.create(payload,'resident');store.comment(id,'resident',legacyText);store.close();store=new IssueDatabase(path);
  try {assert.equal(store.snapshot('admin').issues.find(issue=>issue.id===id)!.description,privateText);assert.equal(store.snapshot('admin').issues.find(issue=>issue.id===id)!.comments![0].text,legacyText);assert.equal(store.snapshot().issues.find(issue=>issue.id===id)!.description,undefined);assert.equal(store.db.prepare('PRAGMA integrity_check').get()!.integrity_check,'ok');}finally{store.close();}
});
