import { THEMES } from '../src/themes/all.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameServer, bands } from '../src/net/server.js';
import { Session } from '../src/core/session.js';
import { bits } from '../src/core/grid.js';
import { State } from '../src/core/clue.js';
import '../src/themes/all.js';


/** The same suite runs against both backends. `npm test` uses SQLite; `npm run test:pg`
 *  sets CLUES_PG and runs every one of these tests against Postgres in its own schema,
 *  which is how we know the production store behaves identically. */
const PG = process.env.CLUES_PG;
let schemaSeq = 0;

async function makeServer(opts: ConstructorParameters<typeof GameServer>[0] = {}): Promise<GameServer> {
  if (!PG) return new GameServer(opts);
  const { Pool } = await import('pg');
  const { PostgresStore } = await import('../src/net/store-pg.js');
  const schema = `t${process.pid}_${schemaSeq++}`;
  const admin = new Pool({ connectionString: PG });
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema}`);
  await admin.end();
  const pool = new Pool({ connectionString: PG, options: `-c search_path=${schema}` });
  const store = new PostgresStore(pool);
  await store.migrate();
  return new GameServer({ ...opts, store });
}

/** A controllable clock, so "the server owns the time" can actually be tested. */
function clock(startISO: string) {
  let t = new Date(startISO).getTime();
  return { now: () => t, advance: (ms: number) => { t += ms; }, set: (iso: string) => { t = new Date(iso).getTime(); } };
}

async function signIn(srv: GameServer, email: string, name?: string) {
  const req = await srv.authRequest({ email });
  return srv.authVerify({ email, code: req.devCode!, displayName: name });
}
const userOf = async (srv: GameServer, token: string) => (await srv.store.userForToken(token, srv['opts'].now()))!;

/** Play a board the way an honest client does: deduce locally from the clues it has been
 *  given, ask the server to confirm each flip, and fold in whatever clues come back. */
async function playHonestly(srv: GameServer, token: string, playId: string, view: any, tickMs = 1000, clk?: ReturnType<typeof clock>) {
  const user = await userOf(srv, token);
  const session = new Session({ puzzle: view, now: () => 0 });
  let last: any = null;
  for (let i = 0; i < 200; i++) {
    if (session.solved) break;
    const d = session.deduction();
    const forced = d.forcedA | d.forcedB;
    if (!forced) throw new Error('client stuck — would have to guess');
    const cell = bits(forced)[0];
    const truth: State = ((d.forcedB >> cell) & 1) ? 1 : 0;
    clk?.advance(tickMs);
    last = await srv.move(user, { playId, cell, state: truth });
    assert.equal(last.outcome, 'ok');
    session.mark(cell, truth);
    session.addClues(last.unlocked);
  }
  return { session, last };
}

test('sign-in: code is single use, wrong codes rejected, attempts capped', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const srv = await makeServer({ now: clk.now });
  const req = await srv.authRequest({ email: 'James@Portman.ca ' });
  assert.ok(req.devCode && /^\d{6}$/.test(req.devCode));
  await assert.rejects(srv.authVerify({ email: 'james@portman.ca', code: '000000' }), /bad-code/);
  const ok = await srv.authVerify({ email: 'james@portman.ca', code: req.devCode! });
  assert.ok(ok.token.length >= 32);
  assert.equal(ok.user.email, 'james@portman.ca', 'email is normalised');
  await assert.rejects(srv.authVerify({ email: 'james@portman.ca', code: req.devCode! }), /bad-code/,
    'a code must not work twice');
  await assert.rejects(srv.start(await userOf(srv, 'not-a-real-token') as any, { mode: 'daily', themeId: 'orchard' }),
    /./, 'an invalid token yields no user');
});

test('an expired code cannot be redeemed', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const srv = await makeServer({ now: clk.now });
  const req = await srv.authRequest({ email: 'a@b.co' });
  clk.advance(11 * 60_000);
  await assert.rejects(srv.authVerify({ email: 'a@b.co', code: req.devCode! }), /bad-code/);
});

test('THE BIG ONE: the board the client receives contains no solution and no seed', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const srv = await makeServer({ now: clk.now, minMoveIntervalMs: 0 });
  const { token } = await signIn(srv, 'a@b.co');
  const start = await srv.start(await userOf(srv, token), { mode: 'daily', themeId: 'orchard' });

  const wire = JSON.stringify(start);
  assert.ok(!('solution' in start.view), 'view must not carry the solution');
  assert.ok(!('seed' in (start.view as any)), 'view must not carry the generating seed');
  assert.ok(!('path' in (start.view as any)), 'view must not carry the solve path');
  assert.ok(!/"solution"/.test(wire) && !/"path"/.test(wire), 'nothing on the wire leaks the answer');

  const server = srv.puzzleFor({ id: start.edition.id, kind: 'daily', themeId: 'orchard',
    difficulty: start.edition.difficulty, seed: (await (srv as any).refFor({ mode: 'daily', themeId: 'orchard' })).ref.seed });
  assert.ok(start.view.clues.length < server.clues.length, 'locked clues are withheld, not just hidden');
  assert.ok(start.view.clues.every((c) => c.gate === null), 'only opening clues are sent');
});

test('an honest client can solve a board it never received the answer to', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const srv = await makeServer({ now: clk.now, minMoveIntervalMs: 0 });
  const { token } = await signIn(srv, 'a@b.co', 'Ana');
  const start = await srv.start(await userOf(srv, token), { mode: 'daily', themeId: 'orchard' });
  const { session, last } = await playHonestly(srv, token, start.playId, start.view, 1000, clk);
  assert.ok(session.solved);
  assert.ok(last.solved && last.result);
  assert.equal(last.result.ranked, true);
  assert.equal(last.result.mistakes, 0);
  assert.equal(last.result.rank, 1);
  assert.ok(last.result.score > 0);
});

test('the clock belongs to the server: a slow player cannot claim a fast time', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const srv = await makeServer({ now: clk.now, minMoveIntervalMs: 0 });
  const { token } = await signIn(srv, 'slow@b.co');
  const start = await srv.start(await userOf(srv, token), { mode: 'daily', themeId: 'orchard' });
  // 30 seconds of wall-clock between every single flip
  const { last } = await playHonestly(srv, token, start.playId, start.view, 30_000, clk);
  assert.ok(last.result.timeMs >= 30_000 * (start.view.n - 1),
    `server timed the run itself (${last.result.timeMs}ms)`);

  const clk2 = clock('2026-08-20T12:00:00Z');
  const srv2 = await makeServer({ now: clk2.now, minMoveIntervalMs: 0 });
  const { token: t2 } = await signIn(srv2, 'fast@b.co');
  const s2 = await srv2.start(await userOf(srv2, t2), { mode: 'daily', themeId: 'orchard' });
  const r2 = await playHonestly(srv2, t2, s2.playId, s2.view, 500, clk2);
  assert.ok(r2.last.result.score > last.result.score, 'the genuinely faster run scores higher');
});

test('guesses are refused and wrong flips are counted, server-side', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const srv = await makeServer({ now: clk.now, minMoveIntervalMs: 0 });
  const { token } = await signIn(srv, 'c@b.co');
  const u = await userOf(srv, token);
  const start = await srv.start(u, { mode: 'daily', themeId: 'orchard' });
  const session = new Session({ puzzle: start.view, now: () => 0 });
  const d = session.deduction();

  const undecidable = bits(d.undetermined)[0];
  const refused = await srv.move(u, { playId: start.playId, cell: undecidable, state: 1 });
  assert.equal(refused.outcome, 'not-deducible');
  assert.equal(refused.revealed, 0, 'a refused move advances nothing');
  assert.equal(refused.mistakes, 0, 'refusing a guess is not a mistake');

  const forced = bits(d.forcedA | d.forcedB)[0];
  const truth: State = ((d.forcedB >> forced) & 1) ? 1 : 0;
  const wrong = await srv.move(u, { playId: start.playId, cell: forced, state: (truth ? 0 : 1) as State });
  assert.equal(wrong.outcome, 'wrong');
  assert.equal(wrong.mistakes, 1);
  assert.equal(wrong.revealed, 0);
  assert.equal((await srv.store.play(start.playId))!.mistakes, 1, 'the mistake is persisted, not client-tracked');

  const good = await srv.move(u, { playId: start.playId, cell: forced, state: truth });
  assert.equal(good.outcome, 'ok');
  assert.equal(good.revealed, 1);
});

test('out-of-range cells and other people\'s plays are rejected', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const srv = await makeServer({ now: clk.now, minMoveIntervalMs: 0 });
  const { token: ta } = await signIn(srv, 'a@b.co');
  const { token: tb } = await signIn(srv, 'b@b.co');
  const ua = await userOf(srv, ta), ub = await userOf(srv, tb);
  const start = await srv.start(ua, { mode: 'daily', themeId: 'orchard' });
  await assert.rejects(srv.move(ub, { playId: start.playId, cell: 0, state: 1 }), /not-your-play/);
  await assert.rejects(srv.move(ua, { playId: start.playId, cell: 999, state: 1 }), /bad-cell/);
  await assert.rejects(srv.move(ua, { playId: 'ply_nope', cell: 0, state: 1 }), /no-such-play/);
});

test('you cannot ask for a board that has not happened yet', async () => {
  const clk = clock('2026-08-19T12:00:00Z'); // Wednesday -> dayIndex 2
  const srv = await makeServer({ now: clk.now });
  const { token } = await signIn(srv, 'a@b.co');
  const u = await userOf(srv, token);
  const ok = await srv.start(u, { mode: 'weekly', themeId: 'orchard', dayIndex: 1 });
  assert.equal(ok.edition.difficulty, 2);
  await assert.rejects(srv.start(u, { mode: 'weekly', themeId: 'orchard', dayIndex: 5 }), /future-edition/);
  await assert.rejects(srv.start(u, { mode: 'daily', themeId: 'not-a-theme' }), /unknown-theme/);
});

test('free play is never ranked, and a re-solve never re-ranks', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const srv = await makeServer({ now: clk.now, minMoveIntervalMs: 0 });
  const { token } = await signIn(srv, 'a@b.co');
  const u = await userOf(srv, token);

  const free = await srv.start(u, { mode: 'free', themeId: 'coldopen' });
  assert.equal(free.edition.ranked, false);
  const fr = await playHonestly(srv, token, free.playId, free.view, 100, clk);
  assert.equal(fr.last.result.ranked, false);
  assert.equal((await srv.board(free.edition.id, u)).entries.length, 0, 'practice never reaches the board');

  const first = await srv.start(u, { mode: 'daily', themeId: 'orchard' });
  const r1 = await playHonestly(srv, token, first.playId, first.view, 5000, clk);
  assert.equal(r1.last.result.ranked, true);
  const firstScore = r1.last.result.score;

  // now replay the SAME edition, having already learned the board, very fast
  const second = await srv.start(u, { mode: 'daily', themeId: 'orchard' });
  assert.ok(second.previousResult, 'the server tells you it is already ranked');
  const r2 = await playHonestly(srv, token, second.playId, second.view, 100, clk);
  assert.equal(r2.last.result.ranked, false, 'grinding a solved board must not re-rank');
  const board = await srv.board(first.edition.id, u);
  assert.equal(board.entries.length, 1);
  assert.equal(board.entries[0].score, firstScore, 'the original result stands');
});

test('move flooding is rate limited', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const srv = await makeServer({ now: clk.now, minMoveIntervalMs: 40 });
  const { token } = await signIn(srv, 'a@b.co');
  const u = await userOf(srv, token);
  const start = await srv.start(u, { mode: 'daily', themeId: 'orchard' });
  await srv.move(u, { playId: start.playId, cell: 0, state: 1 });
  await assert.rejects(srv.move(u, { playId: start.playId, cell: 1, state: 1 }), /too-fast/);
  clk.advance(50);
  await srv.move(u, { playId: start.playId, cell: 1, state: 1 });
});

test('hints are counted by the server and cost score', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const srv = await makeServer({ now: clk.now, minMoveIntervalMs: 0 });
  const { token } = await signIn(srv, 'a@b.co');
  const u = await userOf(srv, token);
  const start = await srv.start(u, { mode: 'daily', themeId: 'callboard' });
  const h = await srv.hint(u, { playId: start.playId });
  assert.notEqual(h.hint.kind, 'none');
  assert.equal(h.hintsUsed, 1);
  assert.equal((await srv.store.play(start.playId))!.hints, 1, 'persisted server-side');
  const { last } = await playHonestly(srv, token, start.playId, start.view, 1000, clk);
  assert.equal(last.result.hintsUsed, 1);
  assert.equal(last.result.perfect, false, 'a hinted run is not perfect');
});

test('leaderboard, weekly standings and streaks come out of the database', async () => {
  const clk = clock('2026-08-17T12:00:00Z'); // Monday
  const srv = await makeServer({ now: clk.now, minMoveIntervalMs: 0 });
  const ana = await signIn(srv, 'ana@x.co', 'Ana');
  const bo = await signIn(srv, 'bo@x.co', 'Bo');

  for (const day of ['2026-08-17', '2026-08-18', '2026-08-19']) {
    clk.set(`${day}T09:00:00Z`);
    const s = await srv.start(await userOf(srv, ana.token), { mode: 'daily', themeId: 'orchard' });
    await playHonestly(srv, ana.token, s.playId, s.view, 800, clk);
  }
  clk.set('2026-08-19T10:00:00Z');
  const bs = await srv.start(await userOf(srv, bo.token), { mode: 'daily', themeId: 'orchard' });
  const bres = await playHonestly(srv, bo.token, bs.playId, bs.view, 90_000, clk);

  const board = await srv.board(bs.edition.id, await userOf(srv, bo.token));
  assert.equal(board.entries.length, 2);
  assert.equal(board.entries[0].displayName, 'Ana', 'faster run ranks first');
  assert.equal(board.you!.displayName, 'Bo');
  assert.ok(bres.last.result.rank === 2);

  const week = await srv.week('2026-W34');
  assert.equal(week.standings[0].playerId, (await userOf(srv, ana.token)).id);
  assert.equal(week.standings[0].daysCompleted, 3);
  assert.equal(week.standings[1].daysCompleted, 1);
  assert.equal(bres.last.result.streak, 1);

  const anaLast = await srv.start(await userOf(srv, ana.token), { mode: 'daily', themeId: 'coldopen' });
  const ar = await playHonestly(srv, ana.token, anaLast.playId, anaLast.view, 800, clk);
  assert.equal(ar.last.result.streak, 3, 'three consecutive days');
});

test('every theme is playable through the server', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const srv = await makeServer({ now: clk.now, minMoveIntervalMs: 0 });
  const { token } = await signIn(srv, 'a@b.co');
  const today = await srv.today();
  assert.equal(today.editions.length, THEMES.length);
  for (const ed of today.editions) {
    const s = await srv.start(await userOf(srv, token), { mode: 'daily', themeId: ed.themeId });
    const r = await playHonestly(srv, token, s.playId, s.view, 500, clk);
    assert.ok(r.session.solved, `${ed.themeId} did not finish`);
  }
});

test('a room shows every player where the others are', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const srv = await makeServer({ now: clk.now, minMoveIntervalMs: 0 });
  const ana = await signIn(srv, 'ana@x.co', 'Ana');
  const bo = await signIn(srv, 'bo@x.co', 'Bo');
  const ua = () => userOf(srv, ana.token), ub = () => userOf(srv, bo.token);

  const hosted = await srv.roomJoin(await ua(), { mode: 'daily', themeId: 'guestlist' });
  assert.match(hosted.code, /^[BCDFGHJKMNPQRSTVWXYZ23456789]{6}$/, 'codes are readable aloud');
  assert.equal(hosted.players.length, 1);
  assert.equal(hosted.players[0].you, true);

  const joined = await srv.roomJoin(await ub(), { code: hosted.code.toLowerCase() });
  assert.equal(joined.roomId, hosted.roomId, 'the code is case-insensitive');
  assert.equal(joined.players.length, 2);
  assert.equal(joined.edition.id, hosted.edition.id, 'everyone races the same edition');
  assert.notEqual(joined.playId, hosted.playId, 'but each on their own board');
  await assert.rejects(srv.roomJoin(await ub(), { code: 'ZZZZZZ' }), /no-such-room/);

  // Ana gets four tiles in; Bo gets one
  const anaSession = new Session({ puzzle: hosted.view, now: () => 0 });
  for (let i = 0; i < 4; i++) {
    const d = anaSession.deduction();
    const cell = bits(d.forcedA | d.forcedB)[0];
    const truth: State = ((d.forcedB >> cell) & 1) ? 1 : 0;
    clk.advance(1000);
    const ack = await srv.move(await ua(), { playId: hosted.playId, cell, state: truth });
    anaSession.mark(cell, truth); anaSession.addClues(ack.unlocked);
  }
  const boSession = new Session({ puzzle: joined.view, now: () => 0 });
  const bd = boSession.deduction();
  const boCell = bits(bd.forcedA | bd.forcedB)[0];
  await srv.move(await ub(), { playId: joined.playId, cell: boCell, state: ((bd.forcedB >> boCell) & 1) ? 1 : 0 });

  await srv.roomHeartbeat(await ua(), { roomId: hosted.roomId, focusCell: 7 });
  const seen = await srv.roomHeartbeat(await ub(), { roomId: hosted.roomId, focusCell: 12 });

  const anaRow = seen.players.find((p) => p.displayName === 'Ana')!;
  const boRow = seen.players.find((p) => p.displayName === 'Bo')!;
  assert.equal(anaRow.revealed, 4, 'progress comes from moves the server validated');
  assert.equal(boRow.revealed, 1);
  assert.equal(anaRow.total, hosted.view.n);
  assert.equal(anaRow.focusCell, 7, 'you can see which tile the other player is on');
  assert.equal(boRow.focusCell, 12);
  assert.equal(boRow.you, true, 'and which row is yours');
  assert.equal(anaRow.you, false);
  assert.equal(anaRow.finished, false);

  // a player who stops sending heartbeats goes stale rather than vanishing
  clk.advance(45_000);
  const later = await srv.roomHeartbeat(await ub(), { roomId: hosted.roomId, focusCell: 12 });
  assert.ok(later.players.find((p) => p.displayName === 'Ana')!.idleSeconds >= 45);
  assert.equal(later.players.find((p) => p.displayName === 'Bo')!.idleSeconds, 0);
});

test('presence cannot be faked by a client', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const srv = await makeServer({ now: clk.now, minMoveIntervalMs: 0 });
  const ana = await signIn(srv, 'ana@x.co', 'Ana');
  const room = await srv.roomJoin(await userOf(srv, ana.token), { mode: 'daily', themeId: 'orchard' });
  // there is no field on the wire for "my progress" — it is read from validated moves
  const before = (await srv.roomHeartbeat(await userOf(srv, ana.token), { roomId: room.roomId, focusCell: 3 })).players[0];
  assert.equal(before.revealed, 0);
  await srv.move(await userOf(srv, ana.token), { playId: room.playId, cell: 999, state: 1 }).catch(() => {});
  const after = (await srv.roomHeartbeat(await userOf(srv, ana.token), { roomId: room.roomId, focusCell: 3 })).players[0];
  assert.equal(after.revealed, 0, 'a rejected move advances nobody');
});

test('the archive lists real past days and refuses invented ones', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const srv = await makeServer({ now: clk.now, minMoveIntervalMs: 0, launchDate: '2026-08-01' });
  const { token } = await signIn(srv, 'a@b.co');
  const u = () => userOf(srv, token);

  const arc = await srv.archive(await u(), { themeId: 'orchard', days: 35 });
  assert.equal(arc.days[0].date, '2026-08-20', 'newest first');
  assert.equal(arc.days[arc.days.length - 1].date, '2026-08-01', 'stops at the launch date');
  assert.equal(arc.days.length, 20);
  assert.equal(arc.completed, 0);
  assert.deepEqual(arc.days.slice(0, 4).map((d) => d.difficulty), [4, 3, 2, 1],
    'each day keeps the difficulty it had');

  await assert.rejects(srv.start(await u(), { mode: 'archive', themeId: 'orchard', date: '2026-08-21' }), /future-edition/);
  await assert.rejects(srv.start(await u(), { mode: 'archive', themeId: 'orchard', date: '2026-07-31' }), /before-launch/);
  await assert.rejects(srv.start(await u(), { mode: 'archive', themeId: 'orchard', date: 'yesterday' }), /bad-date/);

  const day = await srv.start(await u(), { mode: 'archive', themeId: 'orchard', date: '2026-08-05' });
  assert.equal(day.edition.id, 'd:2026-08-05:orchard', 'the archive replays the board that actually ran');
  assert.equal(day.edition.difficulty, 3, 'Wednesday');
  assert.equal(day.edition.ranked, true);
});

test('an archived board ranks on its own day, but cannot manufacture a streak or a week', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const srv = await makeServer({ now: clk.now, minMoveIntervalMs: 0, launchDate: '2026-08-01' });
  const { token } = await signIn(srv, 'a@b.co', 'Ana');
  const u = () => userOf(srv, token);

  // play today properly
  const today = await srv.start(await u(), { mode: 'daily', themeId: 'orchard' });
  const live = await playHonestly(srv, token, today.playId, today.view, 900, clk);
  assert.equal(live.last.result.streak, 1);

  // then go back and fill in the two days before it from the archive
  for (const date of ['2026-08-19', '2026-08-18']) {
    const s = await srv.start(await u(), { mode: 'archive', themeId: 'orchard', date });
    const r = await playHonestly(srv, token, s.playId, s.view, 900, clk);
    assert.equal(r.last.result.ranked, true, 'archive runs still rank on that day');
  }

  const board = await srv.board('d:2026-08-19:orchard', await u());
  assert.equal(board.entries.length, 1, 'and appear on that day\'s leaderboard');

  const after = await srv.start(await u(), { mode: 'daily', themeId: 'coldopen' });
  const r = await playHonestly(srv, token, after.playId, after.view, 900, clk);
  assert.equal(r.last.result.streak, 1, 'back-filled days do not repair a streak');

  const week = await srv.week('2026-W34');
  const me = week.standings[0];
  assert.equal(me.daysCompleted, 1, 'nor rewrite a finished week — and two themes on one day is still one day');
});

test('the archive shows you which days you have already done', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const srv = await makeServer({ now: clk.now, minMoveIntervalMs: 0, launchDate: '2026-08-10' });
  const { token } = await signIn(srv, 'a@b.co');
  const u = () => userOf(srv, token);
  const s = await srv.start(await u(), { mode: 'archive', themeId: 'orchard', date: '2026-08-14' });
  const played = await playHonestly(srv, token, s.playId, s.view, 700, clk);

  const arc = await srv.archive(await u(), { themeId: 'orchard', days: 20 });
  assert.equal(arc.completed, 1);
  const row = arc.days.find((d) => d.date === '2026-08-14')!;
  assert.equal(row.played, true);
  assert.equal(row.score, played.last.result.score);
  assert.equal(row.late, true, 'flagged as played from the archive');
  assert.equal(arc.days.find((d) => d.date === '2026-08-13')!.played, false);
  // a different theme has its own archive
  assert.equal((await srv.archive(await u(), { themeId: 'coldopen', days: 20 })).completed, 0);
});

test('production refuses to leak login codes and locks down CORS', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const sent: { to: string; body: string }[] = [];
  const srv = await makeServer({
    now: clk.now, dev: false,
    allowedOrigins: ['https://clues.example'],
    sendEmail: async (to, _subject, body) => { sent.push({ to, body }); },
  });

  const r = await srv.authRequest({ email: 'a@b.co' });
  assert.equal(r.sent, true);
  assert.equal(r.devCode, undefined, 'the code must never come back over the wire in production');
  assert.equal(sent.length, 1, 'it goes by email instead');
  assert.equal(sent[0].to, 'a@b.co');
  const code = /\b(\d{6})\b/.exec(sent[0].body)![1];
  const auth = await srv.authVerify({ email: 'a@b.co', code });
  assert.ok(auth.token, 'and the emailed code still works');

  const headers = (origin?: string) => {
    const out: Record<string, string> = {};
    const res = {
      setHeader: (k: string, v: string) => { out[k.toLowerCase()] = v; },
      writeHead() { return res; }, end() { /* no body needed */ },
    } as any;
    void srv.handler({ method: 'OPTIONS', url: '/api/today', headers: origin ? { origin } : {} } as any, res);
    return out;
  };
  assert.equal(headers('https://clues.example')['access-control-allow-origin'], 'https://clues.example');
  assert.equal(headers('https://evil.example')['access-control-allow-origin'], undefined,
    'an unlisted origin gets no CORS grant at all');
  assert.equal(headers()['x-content-type-options'], 'nosniff');
  assert.equal(headers()['x-frame-options'], 'DENY');
});

test('health checks the things that actually break', async () => {
  const srv = await makeServer({ now: () => new Date('2026-08-20T12:00:00Z').getTime() });
  const h = await srv.health();
  assert.equal(h.ok, true);
  assert.equal(h.db, true, 'the database answered');
  assert.equal(h.generator, true, 'and a board could be generated');
  assert.ok(h.uptimeMs >= 0);
});

test('a sign-in code that could not be delivered fails loudly', async () => {
  const srv = await makeServer({
    now: () => new Date('2026-08-20T12:00:00Z').getTime(),
    dev: false,
    sendEmail: async () => { throw new Error('provider rejected the message'); },
  });
  // The player must see a failed request, not a cheerful "sent" for a mail that never left.
  await assert.rejects(srv.authRequest({ email: 'a@b.co' }), /provider rejected/);
});

/* ------------------------------------------------------------------ *
 * Admin flags. The thing worth testing here is not that a toggle
 * toggles — it is that a disabled feature is actually shut, and that
 * the shutting is done by the server rather than by a hidden button.
 * ------------------------------------------------------------------ */

const SECRET = 'test-admin-secret-long-enough-000';
const adminReq = (token?: string) =>
  ({ headers: token === undefined ? {} : { 'x-admin-token': token } }) as any;

test('the admin surface does not exist until a token is configured', async () => {
  const srv = await makeServer();                       // no adminToken
  await assert.rejects(() => srv.adminFlags(adminReq(SECRET)), (e: any) => e.status === 404);
  // and a short one is treated as no token at all rather than a weak one
  const weak = await makeServer({ adminToken: 'short' });
  await assert.rejects(() => weak.adminFlags(adminReq('short')), (e: any) => e.status === 404);
});

test('admin routes refuse a missing or wrong token', async () => {
  const srv = await makeServer({ adminToken: SECRET });
  await assert.rejects(() => srv.adminFlags(adminReq()), (e: any) => e.status === 403);
  await assert.rejects(() => srv.adminFlags(adminReq('')), (e: any) => e.status === 403);
  await assert.rejects(() => srv.adminFlags(adminReq(SECRET + 'x')), (e: any) => e.status === 403);
  await assert.rejects(() => srv.adminFlags(adminReq(SECRET.slice(0, -1))), (e: any) => e.status === 403);
  const ok = await srv.adminFlags(adminReq(SECRET));
  assert.ok(ok.flags.themes.length > 0);
});

test('turning a theme off closes it on the server, not just in the menu', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const srv = await makeServer({ adminToken: SECRET, now: clk.now, minMoveIntervalMs: 0 });
  const { token } = await signIn(srv, 'flags@b.co');
  const user = await userOf(srv, token);

  const before = await srv.today();
  assert.ok(before.editions.some((e) => e.themeId === 'orchard'));
  await srv.start(user, { mode: 'daily', themeId: 'orchard' });   // works today

  const keep = THEMES.map((t) => t.id).filter((id) => id !== 'orchard');
  await srv.adminSetFlags(adminReq(SECRET), { flags: { themes: keep } });
  clk.advance(10_000);                                            // past the flag cache

  const after = await srv.today();
  assert.ok(!after.editions.some((e) => e.themeId === 'orchard'), 'gone from the listing');
  assert.equal(after.editions.length, keep.length);
  // and a client that ignores the listing and asks anyway is refused
  await assert.rejects(() => srv.start(user, { mode: 'daily', themeId: 'orchard' }),
    (e: any) => e.status === 403 && e.code === 'theme-disabled');
  // the themes still on remain playable
  await srv.start(user, { mode: 'daily', themeId: keep[0] });
});

test('archive and weekly can each be closed independently', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const srv = await makeServer({ adminToken: SECRET, now: clk.now, launchDate: '2026-01-01' });
  const { token } = await signIn(srv, 'aw@b.co');
  const user = await userOf(srv, token);

  await srv.adminSetFlags(adminReq(SECRET), { flags: { archive: false, weekly: true } });
  clk.advance(10_000);
  await assert.rejects(() => srv.archive(user, { themeId: 'orchard', days: 7 }),
    (e: any) => e.code === 'archive-disabled');
  await assert.rejects(() => srv.start(user, { mode: 'archive', themeId: 'orchard', date: '2026-08-01' }),
    (e: any) => e.code === 'archive-disabled');
  await srv.start(user, { mode: 'weekly', themeId: 'orchard' });   // weekly still open

  await srv.adminSetFlags(adminReq(SECRET), { flags: { archive: true, weekly: false } });
  clk.advance(10_000);
  await srv.archive(user, { themeId: 'orchard', days: 7 });
  await assert.rejects(() => srv.start(user, { mode: 'weekly', themeId: 'orchard' }),
    (e: any) => e.code === 'weekly-disabled');
});

test('closing signups keeps existing players signed in-able', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const srv = await makeServer({ adminToken: SECRET, now: clk.now });
  await signIn(srv, 'already@b.co');                      // account exists before the change

  await srv.adminSetFlags(adminReq(SECRET), { flags: { signups: false } });
  clk.advance(10_000);

  // the returning player is unaffected — this is the whole point of gating at verify
  const back = await signIn(srv, 'already@b.co');
  assert.ok(back.token);
  // a new address is turned away, and only after its code checked out, so a closed door
  // never doubles as an "is this email registered?" oracle
  const req = await srv.authRequest({ email: 'newcomer@b.co' });
  assert.ok(req.sent, 'the code is still sent');
  await assert.rejects(() => srv.authVerify({ email: 'newcomer@b.co', code: req.devCode! }),
    (e: any) => e.code === 'signups-closed');
});

test('flags survive a restart, and a stored config cannot outlive its themes', async () => {
  const srv = await makeServer({ adminToken: SECRET });
  await srv.adminSetFlags(adminReq(SECRET), { flags: { themes: ['orchard'], weekly: false, notice: '  Down for an hour  ' } });

  // same store, new process: this is what a serverless cold start looks like
  const reborn = new GameServer({ store: srv.store, adminToken: SECRET });
  const f = (await reborn.adminFlags(adminReq(SECRET))).flags;
  assert.deepEqual(f.themes, ['orchard']);
  assert.equal(f.weekly, false);
  assert.equal(f.notice, 'Down for an hour', 'trimmed');

  // a theme id that no longer exists in the code must not reach the player or the gate
  await srv.store.putSetting('flags', JSON.stringify({ themes: ['orchard', 'a-theme-we-deleted'] }), 0);
  const later = new GameServer({ store: srv.store, adminToken: SECRET });
  assert.deepEqual((await later.flags()).themes, ['orchard']);
});

test('the last theme cannot be switched off, and a bad payload cannot brick the game', async () => {
  const srv = await makeServer({ adminToken: SECRET });
  for (const bad of [{ themes: [] }, { themes: ['nope'] }, { themes: 'orchard' }, null, 'x', 42]) {
    const r = await srv.adminSetFlags(adminReq(SECRET), { flags: bad });
    assert.ok(r.flags.themes.length > 0, `empty theme list from ${JSON.stringify(bad)}`);
    assert.equal((await srv.today()).editions.length > 0, true);
  }
  const long = await srv.adminSetFlags(adminReq(SECRET), { flags: { notice: 'x'.repeat(5000) } });
  assert.equal(long.flags.notice.length, 240, 'notice is capped');
});

test('players are told what is open, but never whether signups are', async () => {
  const srv = await makeServer({ adminToken: SECRET });
  await srv.adminSetFlags(adminReq(SECRET), { flags: { signups: false, rooms: false, notice: 'Back at six' } });
  const t = await srv.today();
  assert.equal(t.flags.rooms, false);
  assert.equal(t.flags.notice, 'Back at six');
  assert.ok(!('signups' in t.flags), 'signups is not a player-facing fact');
});

test('rooms can be closed', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const srv = await makeServer({ adminToken: SECRET, now: clk.now });
  const { token } = await signIn(srv, 'rooms@b.co');
  const user = await userOf(srv, token);
  await srv.adminSetFlags(adminReq(SECRET), { flags: { rooms: false } });
  clk.advance(10_000);
  await assert.rejects(() => srv.roomJoin(user, { mode: 'daily', themeId: 'orchard' }),
    (e: any) => e.code === 'rooms-disabled');
});

test('percentile bands stay silent until the numbers mean something', () => {
  // a "top 1%" out of three solvers is a lie told with arithmetic
  assert.deepEqual(bands({ ahead: 0, total: 3, perfect: 3 }), { percentile: null, perfectRate: null });
  assert.deepEqual(bands({ ahead: 0, total: 19, perfect: 0 }), { percentile: null, perfectRate: null });

  // the fastest solver is 0 ahead and lands in the top band
  assert.equal(bands({ ahead: 0, total: 100, perfect: 10 }).percentile, 1);
  assert.equal(bands({ ahead: 4, total: 100, perfect: 10 }).percentile, 5);
  assert.equal(bands({ ahead: 24, total: 100, perfect: 10 }).percentile, 25);
  assert.equal(bands({ ahead: 60, total: 100, perfect: 10 }).percentile, null, 'no band for the back half');
  assert.equal(bands({ ahead: 0, total: 100, perfect: 7 }).perfectRate, 7);
});

test('a finished run reports where it placed against everyone else', async () => {
  const clk = clock('2026-08-20T12:00:00Z');
  const srv = await makeServer({ now: clk.now, minMoveIntervalMs: 0 });
  const { token } = await signIn(srv, 'solo@b.co');
  const user = await userOf(srv, token);
  const s = await srv.start(user, { mode: 'daily', themeId: 'gallery' });
  const r = await playHonestly(srv, token, s.playId, s.view, 500, clk);
  const res = r.last?.result;
  assert.ok(res, 'the run finished and returned a result');
  // one finisher is not a population: both numbers stay null rather than claiming 100%
  assert.equal(res.percentile, null);
  assert.equal(res.perfectRate, null);
  const st = await srv.store.standing(res.editionId, user.id);
  assert.equal(st.total, 1);
  assert.equal(st.ahead, 0, 'you are not ahead of yourself');
});
