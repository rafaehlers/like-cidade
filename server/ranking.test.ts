import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { IssueDatabase } from './database.js';
import { seedRankingDemo } from './ranking-demo.js';
import { buildRanking, cityFromReference, periodStart, type RankingEvent } from '../src/ranking.js';
import type { PublicProfile } from '../src/profiles.js';
import { createApp } from './app.js';

const now=new Date('2026-11-11T23:00:00.000Z');
const profile=(id:string,role:PublicProfile['role']='resident'):PublicProfile=>({id,nickname:id,city:'Itajaí',role,bio:'',updatedAt:now.toISOString()});
const event=(userId:string,amount:number,createdAt=now.toISOString(),city:RankingEvent['city']='Navegantes'):RankingEvent=>({userId,amount,action:'report',createdAt,city});
const options={period:'all' as const,city:'all' as const,theme:'all' as const,now,revision:1};

test('ranking uses Brasília calendar boundaries and never includes future events',()=>{
  assert.equal(periodStart('week',new Date('2026-11-09T02:59:59Z')),'2026-11-02T03:00:00.000Z');
  assert.equal(periodStart('week',new Date('2026-11-09T03:00:00Z')),'2026-11-09T03:00:00.000Z');
  assert.equal(periodStart('month',new Date('2026-12-01T02:59:59Z')),'2026-11-01T03:00:00.000Z');
  assert.equal(periodStart('month',new Date('2026-12-01T03:00:00Z')),'2026-12-01T03:00:00.000Z');
  const result=buildRanking([profile('a')],[event('a',10,'2026-11-09T02:59:59Z'),event('a',20,'2026-11-09T03:00:00Z'),event('a',500,'2026-12-01T00:00:00Z')],{...options,period:'week'});
  assert.equal(result.rows[0].points,20);
});
test('top 10 has stable ties, excludes staff, and shows the current resident outside the top 10',()=>{
  const profiles=[...Array.from({length:13},(_,i)=>profile(`resident-${String(i).padStart(2,'0')}`)),profile('staff','agency'),profile('admin','admin')];
  const events=profiles.map((p,i)=>event(p.id,1000-i*10));events.push(event('resident-01',10));
  const result=buildRanking(profiles,events,{...options,userId:'resident-12'});
  assert.equal(result.rows.length,10);assert.equal(result.participants,13);
  assert.equal(result.own!.position,13);assert.equal(result.rows.some(row=>row.profile.id==='resident-12'),false);
  assert.equal(result.rows[0].position,1);assert.equal(result.rows[1].position,1);assert.equal(result.rows[2].position,3);
  assert.deepEqual(result.rows.map(row=>row.profile.id),buildRanking([...profiles].reverse(),[...events].reverse(),options).rows.map(row=>row.profile.id));
});
test('city and thematic ranking use contribution metadata, not the resident home city',()=>{
  const profiles=[profile('a'),profile('b')];const entries=[event('a',10),event('b',50,now.toISOString(),'Itajaí'),{...event('a',2),action:'support' as const},{...event('a',10),subcategory:'Piso tátil ausente' as const}];
  const ranking=buildRanking(profiles,entries,{...options,city:'Navegantes',theme:'accessibility'});
  assert.equal(ranking.rows.length,1);assert.equal(ranking.rows[0].profile.id,'a');assert.equal(ranking.rows[0].points,10);
  assert.equal(buildRanking(profiles,entries,{...options,theme:'supports'}).rows[0].points,2);
  assert.equal(cityFromReference('Centro, Balneário Camboriú'),'Balneário Camboriú');
  assert.equal(cityFromReference('Rua sem município'),undefined);
  assert.equal(cityFromReference('Entre Itajaí e Navegantes'),undefined);
});
test('fictional rankings seed every current resident once, preserve real data, and reconcile with profiles',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'like-cidade-ranking-'));t.after(()=>rm(directory,{recursive:true,force:true}));const path=join(directory,'test.sqlite');
  let store=new IssueDatabase(path);
  const id=store.create({title:'Relato real preservado',category:'Calçada',lat:-26.9,lng:-48.66,address:'Centro, Itajaí',description:''},'resident');
  store.support(id,'resident-felipe',true);
  const before=JSON.stringify(store.snapshot().issues);const real=store.db.prepare('SELECT * FROM point_ledger ORDER BY rowid').all();store.close();
  const seeded=seedRankingDemo(path,now);assert.equal(seeded.residents,5);assert.ok(seeded.inserted>0);
  const repeat=seedRankingDemo(path,new Date('2026-11-12T23:00:00Z'));assert.equal(repeat.inserted,0);assert.equal(repeat.revision,seeded.revision);
  store=new IssueDatabase(path);
  try {
    assert.equal(JSON.stringify(store.snapshot().issues),before);assert.deepEqual(store.db.prepare('SELECT * FROM point_ledger ORDER BY rowid').all(),real);
    const future=new Date(Date.now()+1000);const ranking=store.profiles.ranking({period:'all',city:'all',theme:'all'},store.revision,future);assert.equal(ranking.rows.length,5);assert.equal(ranking.hasDemo,true);
    for(const row of ranking.rows) {
      const details=store.profiles.details(row.profile.id,store.revision);
      assert.equal(row.points,details.total);assert.ok(details.demoPoints>0);assert.equal(details.total,details.actualPoints+details.demoPoints);assert.ok(details.ledger.some(entry=>entry.demo));
    }
    assert.equal(store.profiles.details('resident',store.revision).actualPoints,10);
    assert.equal(store.profiles.details('resident-felipe',store.revision).actualPoints,2);
    store.remove(id);
    const filtered=store.profiles.ranking({period:'all',city:'Itajaí',theme:'all'},store.revision,future);
    assert.equal(store.profiles.details('resident',store.revision).actualPoints,0);
    assert.ok(filtered.rows.length);
    const location=store.db.prepare('SELECT COUNT(*) AS n FROM point_locations').get()!;assert.equal(location.n,4);
  } finally {store.close();}
});
test('ranking API validates filters and exposes no private identity fields',async t=>{
  const resource=createApp({databasePath:':memory:'});const server=resource.app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{resource.close();server.closeAllConnections();server.close();});const address=server.address();assert.ok(address && typeof address!=='string');const origin=`http://127.0.0.1:${address.port}/api/ranking`;
  const response=await fetch(`${origin}?period=week&city=all&theme=all&userId=resident`);assert.equal(response.status,200);const result=await response.json();assert.equal(result.rows.length,5);assert.equal(result.own.profile.id,'resident');assert.equal('email' in result.rows[0].profile,false);
  for(const query of ['period=bad','city=Unknown','theme=bad','userId[a]=bad'])assert.equal((await fetch(`${origin}?${query}`)).status,400);
});
