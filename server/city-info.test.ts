import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { CityInfoService, geographicSummary, latestQuantity, parseCityQuery } from './city-info.js';
import { createApp } from './app.js';
import type { CityInfo } from '../src/cityInfo.js';

const now=Date.parse('2026-11-12T12:00:00Z');
const query={name:'Itajaí',region:'Santa Catarina',regionCode:'SC',countryCode:'BR'};
const statement=(value:unknown,year?:number,rank='normal')=>({rank,mainsnak:{datavalue:{value}},...(year?{qualifiers:{P585:[{datavalue:{value:{time:`+${year}-00-00T00:00:00Z`}}}]}}:{})});
const quantity=(amount:number,year?:number,rank='normal',unit='1')=>statement({amount:`${amount>=0?'+':''}${amount}`,unit},year,rank);
const reference=(id:string)=>statement({id});
function fixture() {
  const city={id:'Q10',labels:{pt:{value:'Itajaí'}},claims:{
    P131:[reference('Q20')],P17:[reference('Q30')],P625:[statement({latitude:-26.9,longitude:-48.66,globe:'http://www.wikidata.org/entity/Q2'})],
    P1082:[quantity(100,2022,'preferred'),quantity(150,2025),quantity(99999,2027),quantity(999,2025,'deprecated')],
    P2046:[quantity(10,undefined,'normal','http://www.wikidata.org/entity/Q712226')],P2044:[quantity(0,undefined,'normal','http://www.wikidata.org/entity/Q11573')],
    P856:[statement('javascript:alert(1)'),statement('https://municipio.example/')],
  }};
  const other={...city,id:'Q11',claims:{...city.claims,P131:[reference('Q21')]}};
  const entities={Q10:city,Q11:other,Q20:{id:'Q20',labels:{pt:{value:'Santa Catarina'}},claims:{P300:[statement('BR-SC')],P131:[reference('Q30')]}},
    Q21:{id:'Q21',labels:{pt:{value:'Paraná'}},claims:{P300:[statement('BR-PR')],P131:[reference('Q30')]}},Q30:{id:'Q30',labels:{pt:{value:'Brasil'}},claims:{P297:[statement('BR')]}}};
  const calls:URL[]=[];
  const fetcher:typeof fetch=async input=>{
    const url=new URL(String(input));calls.push(url);
    if(url.hostname==='www.wikidata.org')return Response.json({entities:Object.fromEntries((url.searchParams.get('ids') ?? '').split('|').flatMap(id=>id in entities?[[id,entities[id as keyof typeof entities]]]:[]))});
    if(url.searchParams.get('action')==='parse')return Response.json({parse:{sections:[{line:'História<sup>[1]</sup>',anchor:'História[1]',toclevel:1},{line:'Geografia',anchor:'Geografia',toclevel:1},{line:'Referências',anchor:'Referências',toclevel:1}]}});
    return Response.json({query:{rightsinfo:{url:'https://creativecommons.org/licenses/by-sa/4.0/'},pages:[{pageid:11,title:'Itajaí (Paraná)',pageprops:{wikibase_item:'Q11'},extract:'Wrong city'},{pageid:10,title:'Itajaí',pageprops:{wikibase_item:'Q10'},extract:'Resumo público da cidade.'}]}});
  };
  return {city,entities,calls,fetcher};
}

test('city queries reject URL injection, extra parameters and malformed country codes',()=>{
  assert.deepEqual(parseCityQuery({...query,name:' Itajaí ',countryCode:'br'}),query);
  for(const bad of [{...query,name:['Itajaí']},{...query,name:'Itajaí|Paris'},{...query,countryCode:'Brazil'},{...query,lat:'-26.9'},{...query,name:'x'.repeat(101)}])assert.throws(()=>parseCityQuery(bad));
});
test('geographic excerpts do not duplicate population estimates with a different reference year',()=>{
  assert.equal(geographicSummary('Itajaí fica em Santa Catarina. É sede de uma região metropolitana. Atualmente, conta com população de 302.247 habitantes.'),'Itajaí fica em Santa Catarina. É sede de uma região metropolitana.');
  assert.equal(geographicSummary('Tem 100 habitantes segundo o censo de 2022.'),'');
});
test('city lookup verifies the state, dates population and supplies only safe source links',async()=>{
  const fixtureData=fixture();const service=new CityInfoService(fixtureData.fetcher,()=>now);
  const data=await service.lookup(query);
  assert.equal(data.summary,'Resumo público da cidade.');assert.equal(data.wikipediaUrl,'https://pt.wikipedia.org/wiki/Itaja%C3%AD');
  assert.deepEqual(data.population,{value:150,year:2025});assert.equal(data.areaKm2,10);assert.equal(data.elevationM,0);
  assert.equal(data.officialWebsite,'https://municipio.example/');assert.equal(data.wikidataUrl,'https://www.wikidata.org/wiki/Q10');
  assert.deepEqual(data.sections.map(item=>item.title),['História','Geografia']);assert.ok(data.sections.every(item=>new URL(item.url).hostname==='pt.wikipedia.org'));
  assert.equal(data.wikipediaLicenseUrl,'https://creativecommons.org/licenses/by-sa/4.0/');
  assert.ok(fixtureData.calls.every(url=>['pt.wikipedia.org','www.wikidata.org'].includes(url.hostname)));
});
test('city lookup shares concurrent work, caches responses and refreshes expired entries',async()=>{
  const fixtureData=fixture();let time=now;const service=new CityInfoService(fixtureData.fetcher,()=>time);
  const [a,b]=await Promise.all([service.lookup(query),service.lookup(query)]);assert.deepEqual(a,b);const requests=fixtureData.calls.length;
  assert.equal((await service.lookup(query)).fetchedAt,a.fetchedAt);assert.equal(fixtureData.calls.length,requests);
  time+=25*3600000;const refreshed=await service.lookup(query);assert.notEqual(refreshed.fetchedAt,a.fetchedAt);assert.ok(fixtureData.calls.length>requests);
});
test('unknown cities and unavailable sources never invent demographic values',async()=>{
  const empty:typeof fetch=async()=>Response.json({query:{pages:[]}});
  await assert.rejects(new CityInfoService(empty,()=>now).lookup(query),error=>(error as {status:number}).status===404);
  const offline:typeof fetch=async()=>new Response('unavailable',{status:503});
  await assert.rejects(new CityInfoService(offline,()=>now).lookup(query),error=>(error as {status:number}).status===502);
  const data=fixture();data.city.claims.P1082=[];data.city.claims.P2046=[];
  const result=await new CityInfoService(data.fetcher,()=>now).lookup(query);assert.equal(result.population,undefined);assert.equal(result.areaKm2,undefined);
});
test('quantity parsing excludes deprecated, future, invalid and unknown-unit values',()=>{
  const entity={id:'Q10',claims:{P1082:[quantity(-1,2026),quantity(1.1,2026),quantity(999,2027),quantity(50,2025,'deprecated'),quantity(10,2024)],P2046:[quantity(100,2025,'normal','unknown-unit')]}};
  assert.equal(latestQuantity(entity,'P1082','1',now)?.value,10);assert.equal(latestQuantity(entity,'P2046','Q712226',now),undefined);
});
test('city information is public and rejects invalid query shapes before looking anything up',async t=>{
  const requests:unknown[]=[];const result:CityInfo={name:'Itajaí',region:'Santa Catarina',country:'Brasil',summary:'Resumo público.',sections:[],wikipediaUrl:'https://pt.wikipedia.org/wiki/Itaja%C3%AD',wikidataUrl:'https://www.wikidata.org/wiki/Q10',fetchedAt:new Date(now).toISOString()};
  const resource=createApp({databasePath:':memory:',cityInfoService:{lookup:async city=>{requests.push(city);return result;}}});const server=resource.app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{resource.close();server.closeAllConnections();server.close();});const address=server.address();assert.ok(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}/api/city-info`;
  const response=await fetch(`${origin}?${new URLSearchParams(query)}`);assert.equal(response.status,200);assert.deepEqual(await response.json(),result);assert.deepEqual(requests,[query]);
  for(const suffix of ['name=Itajai&countryCode=Brazil','name=Itajai&countryCode=BR&lat=1','name[]=Itajai&countryCode=BR'])assert.equal((await fetch(`${origin}?${suffix}`)).status,400);
  assert.equal(requests.length,1);
});
