import assert from 'node:assert/strict';
import test from 'node:test';
import { seedIssues } from './domain';
import { displayIssue, displayPointEntry } from './presentation';
import type { PointEntry } from './profiles';
import { serviceStats } from './management';

test('fixture labels are removed for display without changing stored records or credits', () => {
  const original = seedIssues()[0];
  const saved = structuredClone(original);
  const displayed = displayIssue(original);
  assert.equal(displayed.address, 'Centro, Itajaí');
  assert.equal(displayed.description, 'Trecho de calçada com desnível, dificultando a passagem.');
  assert.equal(displayed.history[0].label, 'Ocorrência registrada');
  assert.equal(displayed.sample, true);
  assert.equal(displayed.id, original.id);
  assert.deepEqual(original, saved);
  assert.deepEqual(displayIssue(displayed), displayed);
});

test('imported descriptions and history retain the scenario, attribution and status', () => {
  const original = {...seedIssues()[0], id:'demo-city-v1-itajai-13',
    description:'Exemplo fictício para testes. A foto é ilustrativa, de outro local, e não comprova um problema nesta cidade.\n\nCenário: Piso solto.\n\nFoto: Autor / Wikimedia Commons (CC BY-SA 2.0).',
    history:[{label:'Atendimento simulado: em andamento', author:'Marcos', createdAt:'2026-11-12T00:00:00Z'}],
  };
  const displayed = displayIssue(original);
  assert.equal(displayed.description, 'Piso solto.\n\nFoto: Autor / Wikimedia Commons (CC BY-SA 2.0).');
  assert.equal(displayed.history[0].label, 'Atendimento: em andamento');
  const resolved = {...original,status:'Resolvida' as const,history:[{...original.history[0],label:'Atendimento simulado: resolvida'}]};
  assert.deepEqual(serviceStats([displayIssue(resolved)]),serviceStats([resolved]));
});

test('user content and new internal notes are never rewritten', () => {
  const issue = {...seedIssues()[0], sample:false, description:'Possível relato fictício: verificar no local.'};
  assert.equal(displayIssue(issue), issue);
  const scopedIssue = {...issue, sample:true, comments:[{id:'user-note',author:'Marcos',text:'Atendimento simulado: verificar.',createdAt:'2026-11-12T00:00:00Z'}]};
  assert.equal(displayIssue(scopedIssue).comments![0].text, scopedIssue.comments[0].text);
});

test('ledger presentation keeps amounts, balances and provenance intact', () => {
  const entry:PointEntry = {id:'demo-ranking-v1:resident:report:0',demo:true,action:'report',amount:10,balance:1520,
    issueId:'demo-ranking-activity:0:report:0',issueTitle:'Relato fictício — Itajaí',reason:'Demonstração fictícia: ocorrência registrada',
    category:'Calçada',createdAt:'2026-11-12T00:00:00Z'};
  assert.deepEqual(displayPointEntry(entry), {...entry,issueTitle:'Relato — Itajaí',reason:'Ocorrência registrada'});
  assert.equal(displayPointEntry({...entry,demo:false}).reason,entry.reason);
});
