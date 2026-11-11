import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATEGORIES, PEOPLE, STATUSES, isUserId, validPosition, type Category, type Status, type UserId } from '../src/domain.js';
import { IssueDatabase } from './database.js';

type PhotoCredit = { key: string; category: Category; file: string; author: string; license: string; licenseUrl: string; sourceUrl: string; sha256: string };
type DemoReport = { id: string; city: string; citySlug: string; title: string; category: Category; description: string; lat: number; lng: number; address: string; status: Status; authorId: UserId; photoKey: string; ageHours: number; supportCount: number; commentCount: number };
const cities: Record<string, string> = { bc: 'Balneário Camboriú', itajai: 'Itajaí', navegantes: 'Navegantes' };
const residents = Object.keys(PEOPLE).filter(id => PEOPLE[id as UserId].type === 'resident') as UserId[];

export function loadDemoDataset(directory = resolve('demo-data')) {
  const reports = JSON.parse(readFileSync(resolve(directory, 'reports.json'), 'utf8')) as DemoReport[];
  const credits = JSON.parse(readFileSync(resolve(directory, 'photo-credits.json'), 'utf8')) as PhotoCredit[];
  if (!Array.isArray(reports) || reports.length !== 60 || !Array.isArray(credits)) throw new Error('Esperados 60 relatos de demonstração e seus créditos.');
  const photos = new Map<string, { credit: PhotoCredit; bytes: Buffer }>();
  for (const credit of credits) {
    if (!/^[a-z0-9-]+$/.test(credit.key) || photos.has(credit.key) || !/^photos\/[a-z0-9-]+\.jpg$/.test(credit.file)) throw new Error('Identificador ou caminho de foto inválido.');
    if (!credit.author || !credit.sourceUrl.startsWith('https://commons.wikimedia.org/wiki/File:') || !/^(CC BY|CC0|Public domain)/.test(credit.license)) throw new Error(`Créditos incompletos: ${credit.key}`);
    const bytes = readFileSync(resolve(directory, credit.file));
    if (bytes.length > 3 * 1024 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff || createHash('sha256').update(bytes).digest('hex') !== credit.sha256) throw new Error(`Foto inválida ou modificada: ${credit.key}`);
    photos.set(credit.key, { credit, bytes });
  }
  const ids = new Set<string>();
  const descriptions = new Map<string, string>();
  for (const report of reports) {
    if (cities[report.citySlug] !== report.city || !new RegExp(`^demo-city-v1-${report.citySlug}-\\d{2}$`).test(report.id) || ids.has(report.id)) throw new Error('Cidade ou identificador de relato inválido.');
    ids.add(report.id);
    if (!CATEGORIES.includes(report.category) || !STATUSES.includes(report.status) || !validPosition(report) || !isUserId(report.authorId) || PEOPLE[report.authorId].type !== 'resident') throw new Error(`Dados inválidos: ${report.id}`);
    if (!Number.isInteger(report.ageHours) || report.ageHours < 6 || !Number.isInteger(report.supportCount) || report.supportCount < 0 || report.supportCount > 4 || !Number.isInteger(report.commentCount) || report.commentCount < 0 || report.commentCount > 2) throw new Error(`Interações ou data inválidas: ${report.id}`);
    const photo = photos.get(report.photoKey);
    if (!photo || photo.credit.category !== report.category) throw new Error(`A foto não corresponde à categoria: ${report.id}`);
    const credit = photo.credit;
    const description = `Exemplo fictício para testes. A foto é ilustrativa, de outro local, e não comprova um problema nesta cidade.\n\nCenário: ${report.description}\n\nFoto: ${credit.author} / Wikimedia Commons (${credit.license}). Fonte: ${credit.sourceUrl}${credit.licenseUrl ? `\nLicença: ${credit.licenseUrl}` : ''}`;
    if (!report.title || report.title.length > 100 || !report.address || report.address.length > 140 || description.length > 1200) throw new Error(`Texto excede os limites: ${report.id}`);
    descriptions.set(report.id, description);
  }
  for (const city of Object.values(cities)) if (reports.filter(report => report.city === city).length !== 20) throw new Error(`Esperados 20 relatos para ${city}.`);
  return { reports, photos, descriptions };
}

export function seedDemoReports(databasePath: string, directory = resolve('demo-data'), now = Date.now()) {
  // Validate every asset before opening a transaction, so a missing photo never produces a partial import.
  const { reports, photos, descriptions } = loadDemoDataset(directory);
  const store = new IssueDatabase(databasePath);
  const db = store.db;
  let inserted = 0;
  const byCity: Record<string, number> = {};
  try {
    db.exec('BEGIN IMMEDIATE');
    const exists = db.prepare('SELECT sample FROM issues WHERE id = ?');
    const insert = db.prepare('INSERT INTO issues (id, title, category, description, address, lat, lng, status, author_id, created_at, sample, photo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)');
    const history = db.prepare('INSERT INTO history (id, issue_id, author, author_id, label, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    const support = db.prepare('INSERT INTO likes (issue_id, user_id) VALUES (?, ?)');
    const comment = db.prepare('INSERT INTO comments (id, issue_id, author_id, text, created_at) VALUES (?, ?, ?, ?, ?)');
    for (const report of reports) {
      const current = exists.get(report.id);
      if (current) {
        if (!current.sample) throw new Error(`Identificador já usado por um relato real: ${report.id}`);
        continue; // Keep all existing edits, likes, comments, photos and timestamps on repeated runs.
      }
      const created = now - report.ageHours * 3600000;
      insert.run(report.id, report.title, report.category, descriptions.get(report.id)!, report.address, report.lat, report.lng, report.status, report.authorId, new Date(created).toISOString(), photos.get(report.photoKey)!.bytes);
      history.run(`${report.id}-history-0`, report.id, PEOPLE[report.authorId].name, report.authorId, 'Relato fictício de demonstração criado com foto ilustrativa', new Date(created).toISOString());
      for (let step = 1; step <= STATUSES.indexOf(report.status); step++) {
        history.run(`${report.id}-history-${step}`, report.id, PEOPLE.agency.name, 'agency', `Atendimento simulado: ${STATUSES[step].toLowerCase()}`, new Date(created + step * 3600000).toISOString());
      }
      const otherResidents = residents.filter(id => id !== report.authorId);
      otherResidents.slice(0, report.supportCount).forEach(id => support.run(report.id, id));
      if (report.commentCount >= 1) comment.run(`${report.id}-comment-0`, report.id, otherResidents[0], 'Comentário fictício: seria útil acompanhar a manutenção deste trecho.', new Date(created + 30 * 60000).toISOString());
      if (report.commentCount >= 2) comment.run(`${report.id}-comment-1`, report.id, 'agency', 'Atendimento simulado para testar a conversa e o acompanhamento do relato. Não há envio ao órgão público.', new Date(created + 90 * 60000).toISOString());
      inserted++;
      byCity[report.city] = (byCity[report.city] ?? 0) + 1;
    }
    if (inserted) db.prepare("UPDATE metadata SET value = CAST(value AS INTEGER) + 1 WHERE key = 'revision'").run();
    db.exec('COMMIT');
    return { inserted, skipped: reports.length - inserted, byCity, revision: store.revision };
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  } finally { store.close(); }
}
