/** Vercel serverless entry point. One function handles every /api/* route by reusing the
 *  exact same GameServer used by `npm run serve` — there is no second implementation of
 *  the rules to keep in sync. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Pool } from 'pg';
import { GameServer } from '../src/net/server.js';
import { PostgresStore } from '../src/net/store-pg.js';

const CONNECTION = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!CONNECTION) {
  // Failing loudly at cold start beats silently writing accounts to /tmp, which is
  // per-instance and wiped without warning.
  throw new Error('DATABASE_URL is required — serverless has no persistent disk');
}

// One pool per warm instance; `max: 2` because a serverless platform runs many of them
// and a hosted Postgres has a connection ceiling. Use a pooler (pgBouncer/Neon) in front.
const pool = new Pool({ connectionString: CONNECTION, max: 2 });
const store = new PostgresStore(pool);
const migrated = store.migrate();

const server = new GameServer({
  store,
  dev: process.env.NODE_ENV !== 'production',
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  // sendEmail: wire Resend / Postmark / SES here before going live
});

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await migrated;
  await server.handler(req, res);
}
