import { GameServer } from '../dist/net/server.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const prod = process.env.NODE_ENV === 'production';

let store;
if (process.env.DATABASE_URL) {
  const { Pool } = await import('pg');
  const { PostgresStore } = await import('../dist/net/store-pg.js');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
  store = new PostgresStore(pool);
  await store.migrate();
}

const srv = new GameServer({
  store,
  dbPath: process.env.DB ?? join(here, '..', 'clues.db'),
  dev: !prod,
  staticDir: join(here, '..', 'demo', 'dist'),
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
});

if (prod) {
  const missing = [];
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!process.env.ALLOWED_ORIGINS) missing.push('ALLOWED_ORIGINS');
  if (missing.length) {
    console.error(`refusing to start in production without: ${missing.join(', ')}`);
    process.exit(1);
  }
}

const http = srv.listen(port);
console.log(`clues server on http://localhost:${port} (${prod ? 'production' : 'development'}, ${store ? 'postgres' : 'sqlite'})`);
if (!prod) console.log('  dev login: the six-digit code comes back in the sign-in response');

// finish in-flight requests before dying, or a player loses the move they just made
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`${sig} — draining`);
    http.close(async () => { await srv.store.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
