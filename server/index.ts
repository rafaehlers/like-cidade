import { resolve } from 'node:path';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
const { app, close } = createApp({ databasePath: resolve(process.env.SQLITE_PATH ?? './data/like-cidade.sqlite'), staticDirectory: resolve('dist') });
const server = app.listen(port, host, () => console.log(`Like Cidade: http://${host}:${port} (SQLite + SSE)`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  close();
  server.close(() => process.exit(0));
  server.closeIdleConnections();
});
