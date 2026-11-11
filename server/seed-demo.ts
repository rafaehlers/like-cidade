import { resolve } from 'node:path';
import { seedDemoReports } from './demo-seed.js';

try {
  const result = seedDemoReports(resolve(process.env.SQLITE_PATH ?? './data/like-cidade.sqlite'));
  console.log(JSON.stringify(result, null, 2));
  console.log('Reinicie a aplicação para que as conexões SSE recebam a nova revisão.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Não foi possível importar os relatos de demonstração.');
  process.exitCode = 1;
}
