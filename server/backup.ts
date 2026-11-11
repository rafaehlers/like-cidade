import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const source = resolve(process.env.SQLITE_PATH ?? './data/like-cidade.sqlite');
const destination = resolve(process.argv[2] ?? `${dirname(source)}/backups/like-cidade-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
if (!existsSync(source)) throw new Error('Banco de origem não encontrado.');
if (existsSync(destination)) throw new Error('O destino já existe. Escolha outro nome para o backup.');
mkdirSync(dirname(destination), { recursive: true });
const db = new DatabaseSync(source, { readOnly: true });
try { await backup(db, destination); console.log(`Backup salvo em ${destination}`); } finally { db.close(); }
