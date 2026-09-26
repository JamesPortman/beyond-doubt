import { GameServer, devModeFromEnv } from '../dist/net/server.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const prod = process.env.NODE_ENV === 'production';
// `npm run serve` passes --dev; running this file directly does not. Either way, never in
// production — devModeFromEnv ignores the flag there.
const dev = devModeFromEnv({ ...process.env, BD_DEV: process.argv.includes('--dev') ? '1' : process.env.BD_DEV });

let store;
const CONNECTION = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (CONNECTION) {
  const { Pool } = await import('pg');
  const { PostgresStore } = await import('../dist/net/store-pg.js');
  const pool = new Pool({ connectionString: CONNECTION, max: 8 });
  store = new PostgresStore(pool);
  await store.migrate();
}

const srv = new GameServer({
  store,
  dbPath: process.env.DB ?? join(here, '..', 'clues.db'),
  dev,
  staticDir: join(here, '..', 'demo', 'dist'),
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  adminToken: process.env.ADMIN_TOKEN,
  launchDate: process.env.LAUNCH_DATE,
  editionSecret: process.env.EDITION_SECRET,
});

if (prod) {
  const missing = [];
  if (!CONNECTION) missing.push('DATABASE_URL');
  if (!process.env.ALLOWED_ORIGINS) missing.push('ALLOWED_ORIGINS');
  if (!process.env.EDITION_SECRET) missing.push('EDITION_SECRET');
  if (missing.length) {
    console.error(`refusing to start in production without: ${missing.join(', ')}`);
    process.exit(1);
  }
}

const http = srv.listen(port);
console.log(`clues server on http://localhost:${port} (${prod ? 'production' : dev ? 'development' : 'non-dev'}, ${store ? 'postgres' : 'sqlite'})`);
if (dev) console.log('  dev login: the six-digit code comes back in the sign-in response');
else console.log('  sign-in: codes are emailed, and this script wires no sender — use --dev (npm run serve) locally');
console.log(process.env.ADMIN_TOKEN
  ? '  admin: /#admin, unlocked with ADMIN_TOKEN'
  : '  admin: disabled (set ADMIN_TOKEN to enable /api/admin/*)');

// finish in-flight requests before dying, or a player loses the move they just made
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`${sig} — draining`);
    http.close(async () => { await srv.store.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
