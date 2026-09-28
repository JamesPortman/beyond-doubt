import test from 'node:test';
import assert from 'node:assert/strict';
import { isTransientDbError, retryTransient, onceSucceeded } from '../src/net/transient.js';

/* A database waking from suspend can reset the first connection. In production that hit
 * the cold-start migration as `read ECONNRESET` and failed the first request after every
 * quiet spell. These tests pin the three things the fix has to get right: ride out the
 * reset, never retry a real error, and never keep a failure. */

const err = (code: string, message = code) => Object.assign(new Error(message), { code });
const noWait = { sleep: async () => {} };

/** fails with each given error in turn, then succeeds */
function flaky(...errors: Error[]) {
  let calls = 0;
  const fn = async () => {
    calls++;
    if (calls <= errors.length) throw errors[calls - 1];
    return 'ok';
  };
  return { fn, calls: () => calls };
}

test('the production failure — a reset while the database wakes — is retried and succeeds', async () => {
  const f = flaky(err('ECONNRESET', 'read ECONNRESET'));
  assert.equal(await retryTransient(f.fn, noWait), 'ok');
  assert.equal(f.calls(), 2);
});

test("so is Neon's own 'starting up', and a socket pg drops without a code", async () => {
  const f = flaky(err('57P03', 'the database system is starting up'),
    new Error('Connection terminated unexpectedly'));
  assert.equal(await retryTransient(f.fn, noWait), 'ok');
  assert.equal(f.calls(), 3);
});

test('a real error is not retried: it throws at once', async () => {
  const f = flaky(err('42601', 'syntax error at or near "CREAT"'));
  await assert.rejects(retryTransient(f.fn, noWait), /syntax error/);
  assert.equal(f.calls(), 1, 'retrying a bad query only hides it');
});

test('a database that stays down still fails, after a bounded number of tries', async () => {
  const down = err('ECONNREFUSED');
  const f = flaky(down, down, down, down, down);
  await assert.rejects(retryTransient(f.fn, { ...noWait, delaysMs: [1, 1, 1] }), /ECONNREFUSED/);
  assert.equal(f.calls(), 4, 'one try plus one retry per delay');
});

test('the waits between tries are the ones configured', async () => {
  const waited: number[] = [];
  const f = flaky(err('ECONNRESET'), err('ETIMEDOUT'));
  await retryTransient(f.fn, { delaysMs: [10, 20, 30], sleep: async (ms) => { waited.push(ms); } });
  assert.deepEqual(waited, [10, 20]);
});

test('classification: connection trouble is transient, everything else is not', () => {
  for (const c of ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', '57P01', '57P03', '08006', '08001'])
    assert.equal(isTransientDbError(err(c)), true, c);
  for (const c of ['42601', '23505', '42P07', '28P01', 'ENOENT'])
    assert.equal(isTransientDbError(err(c)), false, c);
  assert.equal(isTransientDbError(null), false);
  assert.equal(isTransientDbError('ECONNRESET'), false, 'a bare string is not an error object');
});

test('once it has succeeded, the work is not repeated', async () => {
  let runs = 0;
  const migrate = onceSucceeded(async () => { runs++; });
  await migrate(); await migrate(); await migrate();
  assert.equal(runs, 1);
});

test('a failure is not kept: the next caller tries again', async () => {
  // The old code cached the promise, so one failure stuck to the instance and every later
  // request on it failed as well.
  let runs = 0;
  const migrate = onceSucceeded(async () => {
    runs++;
    if (runs === 1) throw err('ECONNREFUSED');
  });
  await assert.rejects(migrate(), /ECONNREFUSED/);
  await migrate();
  assert.equal(runs, 2);
});

test('callers arriving together share one attempt', async () => {
  let runs = 0;
  const migrate = onceSucceeded(async () => { runs++; await new Promise((r) => setTimeout(r, 5)); });
  await Promise.all([migrate(), migrate(), migrate()]);
  assert.equal(runs, 1, 'three cold requests must not run three migrations');
});
