/** Surviving a database that is waking up.
 *
 *  Neon suspends an idle database, and the first connection after that can be reset while
 *  it resumes. In production that landed on the one query every cold start makes — the
 *  schema migration — as `read ECONNRESET`, and the request failed. Nothing retried it, so
 *  every first visit after a quiet spell was an error page, and the next one was fine.
 *
 *  Only idempotent work belongs in here. The migration is: every statement is IF NOT EXISTS.
 *  An ordinary write is not — a reset can arrive after the COMMIT, and running it again
 *  would record the same play twice — so request queries are deliberately left alone. */

/** Errors that mean "the connection went away", not "the query was wrong". */
const TRANSIENT_SOCKET = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN']);
/** SQLSTATE: server shutting down or starting up (57P01–57P03, the last being Neon's
 *  "the database system is starting up"), and class 08, connection exceptions. */
const TRANSIENT_SQLSTATE = /^(57P0[123]|08\d{3})$/;

export function isTransientDbError(e: unknown): boolean {
  const err = e as { code?: unknown; message?: unknown } | null;
  const code = typeof err?.code === 'string' ? err.code : '';
  if (TRANSIENT_SOCKET.has(code) || TRANSIENT_SQLSTATE.test(code)) return true;
  // pg reports a dropped socket without a code
  return typeof err?.message === 'string' && /Connection terminated/i.test(err.message);
}

export interface RetryOptions {
  /** waits between attempts; one retry per entry */
  delaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

/** Long enough to ride out a resume (typically well under a second), short enough that a
 *  database that is really down still fails the request in about three seconds. */
const DEFAULT_DELAYS_MS = [250, 750, 2000];
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Run `fn`, retrying only transient database errors. Anything else — a bad query, a
 *  constraint — throws at once: retrying cannot fix it and would only hide it. */
export async function retryTransient<T>(fn: () => Promise<T>, o: RetryOptions = {}): Promise<T> {
  const delays = o.delaysMs ?? DEFAULT_DELAYS_MS;
  const sleep = o.sleep ?? realSleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= delays.length || !isTransientDbError(e)) throw e;
      await sleep(delays[attempt]);
    }
  }
}

/** Do `fn` once per instance, but only once it has SUCCEEDED. The first version cached the
 *  promise itself, so a single failure stuck to the instance and every later request on it
 *  failed too. Here a failure is forgotten, and the next caller simply tries again. */
export function onceSucceeded(fn: () => Promise<void>): () => Promise<void> {
  let inflight: Promise<void> | null = null;
  return () => {
    inflight ??= fn().catch((e) => {
      inflight = null;
      throw e;
    });
    return inflight;
  };
}
