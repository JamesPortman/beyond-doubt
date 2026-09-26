/** Vercel serverless entry point. One function handles every /api/* route by reusing the
 *  exact same GameServer used by `npm run serve` — there is no second implementation of
 *  the rules to keep in sync. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Pool } from 'pg';
import { GameServer, devModeFromEnv } from '../src/net/server.js';
import { PostgresStore } from '../src/net/store-pg.js';

const CONNECTION = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!CONNECTION) {
  // Failing loudly at cold start beats silently writing accounts to /tmp, which is
  // per-instance and wiped without warning.
  throw new Error('DATABASE_URL is required — serverless has no persistent disk');
}

// Never dev on a deployment: devModeFromEnv needs BD_DEV=1 and refuses Vercel's production
// and preview environments whatever else is set.
const DEV = devModeFromEnv(process.env);

if (!DEV && !process.env.EDITION_SECRET) {
  // Without it every ranked board answers 503. Better to fail the deploy's first request
  // loudly than to ship a game whose daily cannot be played.
  throw new Error('EDITION_SECRET is required — ranked boards are keyed with it');
}

// One pool per warm instance; `max: 2` because a serverless platform runs many of them
// and a hosted Postgres has a connection ceiling. Use a pooler (pgBouncer/Neon) in front.
const pool = new Pool({ connectionString: CONNECTION, max: 2 });
const store = new PostgresStore(pool);
const migrated = store.migrate();

/** Login codes by email. Deliberately throws rather than resolving quietly: a sign-in code
 *  that was never sent must surface as a failed request, not as a player waiting forever for
 *  a message that is not coming. */
async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set — cannot deliver sign-in codes');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MAIL_FROM ?? 'Beyond Doubt <onboarding@resend.dev>',
      to,
      subject,
      text: body,
    }),
  });
  if (!res.ok) {
    // 403 here almost always means the unverified resend.dev sender is being used to reach
    // someone other than the account owner. Keep the provider's message; it is a good one.
    throw new Error(`email send failed (${res.status}): ${await res.text()}`);
  }
}

const server = new GameServer({
  store,
  dev: DEV,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  sendEmail,
  // Leave ADMIN_TOKEN unset and /api/admin/* answers 404 like any unknown path: no admin
  // surface exists until someone deliberately creates one.
  adminToken: process.env.ADMIN_TOKEN,
  // The first day the archive will offer. Unset means "today", so a fresh deploy never
  // claims to have boards from before it existed.
  launchDate: process.env.LAUNCH_DATE,
  // Keys ranked boards' seeds so they cannot be computed ahead of time from the public
  // code. Unset in production and ranked boards refuse to start — see SECRET_SEEDS_FROM.
  editionSecret: process.env.EDITION_SECRET,
});

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await migrated;
  await server.handler(req, res);
}
