import test from 'node:test';
import assert from 'node:assert/strict';
import { reportIdFromPath, reportPath, reportShareData, reportShareLinks } from './sharing';

const issue={id:'report-123',title:'Calçada & iluminação na praça',category:'Calçada' as const,address:'Centro, Itajaí',status:'Registrada' as const,
  description:'PRIVATE_COMMENT_CANARY',comments:[{text:'INTERNAL_NOTE_CANARY'}],authorId:'USER_ID_CANARY',lat:-26.123456,lng:-48.123456};

test('report links are clean, encoded and reopen the exact report',()=>{
  assert.equal(reportPath('report-123'),'/relatos/report-123');
  assert.equal(reportIdFromPath(reportPath('relato com espaço & #?')), 'relato com espaço & #?');
  assert.equal(reportIdFromPath('/relatos/example-0/'),'example-0');
  for(const value of ['/','/relatos/','/relatos/a/b','/relatos/%E0%A4%A'])assert.equal(reportIdFromPath(value),undefined);
  assert.equal(reportShareData(issue,'https://likecidade.com.br/?userId=admin#private').url,'https://likecidade.com.br/relatos/report-123');
});
test('sharing allows only public fields, even for an administrator viewing internal notes',()=>{
  const data=reportShareData(issue,'https://likecidade.com.br');
  assert.deepEqual(Object.keys(data).sort(),['text','title','url']);
  assert.match(data.text,/Centro, Itajaí/);assert.match(data.text,/Registrada/);
  for(const secret of ['PRIVATE_COMMENT_CANARY','INTERNAL_NOTE_CANARY','USER_ID_CANARY','26.123456','48.123456'])assert.equal(JSON.stringify(data).includes(secret),false);
});
test('social links preserve accents and encode the public link and text independently',()=>{
  const data=reportShareData(issue,'https://likecidade.com.br');
  const links=reportShareLinks(issue,'https://likecidade.com.br');
  assert.equal(new URL(links.whatsapp).searchParams.get('text'),`${data.text}\n${data.url}`);
  assert.equal(new URL(links.facebook).searchParams.get('u'),data.url);
  assert.equal(new URL(links.x).searchParams.get('url'),data.url);
  assert.match(new URL(links.x).searchParams.get('text')!,/Calçada & iluminação/);
  assert.equal(JSON.stringify(links).includes('CANARY'),false);
  const maximum=reportShareLinks({...issue,title:'á'.repeat(100)},'https://likecidade.com.br');
  assert.ok(new URL(maximum.x).searchParams.get('text')!.length+24<280);
});
