import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from './app.js';
import { renderReportPage } from './sharing.js';

const template='<!doctype html><html><head><meta name="description" content="Default" /><title>Like Cidade</title></head><body><div id="root"></div><script src="/assets/app.js"></script></body></html>';

test('share metadata escapes HTML and rejects credential-bearing origins',()=>{
  const issue={id:'a"b',title:'<script>alert("x")</script> $&',category:'Calçada' as const,status:'Registrada' as const,address:'Rua & praça',hasPhoto:false};
  const page=renderReportPage(template,issue,'https://likecidade.com.br');
  assert.match(page,/&lt;script&gt;/);assert.equal(page.includes('<script>alert'),false);assert.match(page,/\$&amp;/);
  assert.match(page,/\/relatos\/a%22b/);assert.match(page,/\/favicon.png\?v=2/);
  assert.throws(()=>renderReportPage(template,issue,'javascript:alert(1)'));
  assert.throws(()=>renderReportPage(template,issue,'https://secret:password@example.com'));
});
test('report pages and photo previews are public while internal notes never enter the HTML',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'like-cidade-sharing-'));await writeFile(join(directory,'index.html'),template);
  const resource=createApp({databasePath:':memory:',staticDirectory:directory,publicSiteUrl:'https://likecidade.com.br'});
  const server=resource.app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{resource.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});});
  const address=server.address();assert.ok(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
  const title='Tampa <quebrada> & "solta" $&';
  const jpeg=Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10,0xff,0xd9]);
  const created=await fetch(`${origin}/api/issues`,{method:'POST',headers:{'Content-Type':'application/json','X-Demo-User':'resident'},body:JSON.stringify({userId:'resident',title,category:'Água e esgoto',description:'INTERNAL_COMMENT_MUST_STAY_PRIVATE',address:'Centro, Itajaí',lat:-26.9,lng:-48.66,photo:`data:image/jpeg;base64,${jpeg.toString('base64')}`})});
  assert.equal(created.status,201);const {createdId}=await created.json();
  for(const headers of [{},{'X-Demo-User':'admin','X-Forwarded-Host':'attacker.example'}]) {
    const response=await fetch(`${origin}/relatos/${createdId}`,{headers});assert.equal(response.status,200);
    assert.match(response.headers.get('cache-control')!,/no-store/);
    const page=await response.text();
    assert.match(page,/Tampa &lt;quebrada&gt; &amp; &quot;solta&quot; \$&amp;/);
    assert.match(page,new RegExp(`https://likecidade.com.br/relatos/${createdId}`));
    assert.match(page,new RegExp(`https://likecidade.com.br/api/issues/${createdId}/photo`));
    assert.equal(page.includes('INTERNAL_COMMENT_MUST_STAY_PRIVATE'),false);assert.equal(page.includes('attacker.example'),false);
  }
  const photo=await fetch(`${origin}/api/issues/${createdId}/photo`);assert.equal(photo.status,200);assert.deepEqual(Buffer.from(await photo.arrayBuffer()),jpeg);
  const missing=await fetch(`${origin}/relatos/not-found`);assert.equal(missing.status,404);assert.match(await missing.text(),/name="robots" content="noindex"/);
  assert.equal((await fetch(`${origin}/`)).status,200);
  assert.equal((await fetch(`${origin}/api/unknown`)).status,404);
  assert.equal((await fetch(`${origin}/api/issues/${createdId}`,{method:'DELETE',headers:{'Content-Type':'application/json','X-Demo-User':'admin'},body:JSON.stringify({userId:'admin'})})).status,200);
  const removed=await fetch(`${origin}/relatos/${createdId}`);assert.equal(removed.status,404);assert.equal((await removed.text()).includes('Tampa'),false);
});
