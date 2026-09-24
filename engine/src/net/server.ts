import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { Store, SqliteStore, newId, roomCode, UserRow } from './store.js';
import * as P from './protocol.js';
import { Session } from '../core/session.js';
import { Puzzle, PlacedClue, PuzzleView, generate } from '../core/generate.js';
import { State } from '../core/clue.js';
import { scoreRun } from '../core/scoring.js';
import { dailyEdition, weeklyEdition, archiveEdition, weekId, isoDate, weekdayDifficulty, EditionRef, GAME_TZ, civilDate, gameToday } from '../core/edition.js';
import { streakStats } from '../core/streak.js';
import { getTheme, themeIds } from '../themes/index.js';
import '../themes/all.js';
import { Flags, FLAGS_KEY, sanitizeFlags } from './flags.js';

export interface ServerOptions {
  dbPath?: string;
  /** inject a different backend — Postgres in production, SQLite locally */
  store?: Store;
  /** The first day this game existed. The archive walks back to it and refuses anything
   *  earlier, so it is a real product decision rather than a constant: set it early and
   *  the archive has depth on day one, set it to the day you shipped and it fills up one
   *  board at a time. Must be YYYY-MM-DD — the comparisons are string comparisons, so an
   *  unpadded month would fail silently and in a way nobody would think to look for. */
  launchDate?: string;
  /** dev returns the login code in the response instead of emailing it */
  dev?: boolean;
  /** Keys the seeds of ranked boards dated SECRET_SEEDS_FROM or later (EDITION_SECRET).
   *  Production MUST set it: without it those boards refuse to start, rather than fall
   *  back to a seed anyone with the code can derive. Dev and tests use a placeholder. */
  editionSecret?: string;
  staticDir?: string;
  now?: () => number;
  hintBudget?: number;
  /** minimum ms between moves on one play, as a bot guard */
  minMoveIntervalMs?: number;
  /** Origins allowed to call the API. Production MUST set this: the API is bearer-token
   *  authenticated, and a wildcard invites any page to spend a signed-in user's session. */
  allowedOrigins?: string[];
  /** how login codes reach the player. Dev returns them in the response instead. */
  sendEmail?: (to: string, subject: string, body: string) => Promise<void>;
  /** The zone the calendar runs in. A daily that rolls over in UTC arrives at 8pm the
   *  night before for anyone in Eastern time, which is nobody's idea of a new day. */
  timezone?: string;
  /** Shared secret for /api/admin/*. Absent or short and the admin surface does not
   *  exist at all — there is no default, and no password to guess. */
  adminToken?: string;
}

const HINT_BUDGET = 3;
const TOKEN_TTL = 30 * 86400_000;
const CODE_TTL = 10 * 60_000;
/** Long enough that guessing is hopeless; short enough to type once into a phone. */
const ADMIN_TOKEN_MIN = 24;
/** Flags are read on nearly every request, so they are cached — but an operator turning
 *  something off is usually doing it because something is wrong, and should not have to
 *  wait. Five seconds is the compromise. */
const FLAGS_TTL_MS = 5_000;
/** Sign-in throttle. A code request costs us an email and costs the recipient an
 *  interruption, so both the sender's address and the address being mailed are capped.
 *  Generous enough that a person who mistypes their address twice never notices. */
const SIGNIN_WINDOW_MS = 15 * 60_000;
const SIGNIN_PER_IP = 12;
const SIGNIN_PER_EMAIL = 5;

/** Until someone chooses one, the game has always existed since the day it is asked. */
/** A launch date only works as a plain ISO day, because every check against it is a string
 *  comparison. Anything else is refused loudly here rather than quietly skewing the archive.
 *
 *  The default reads the clock it is handed, not the wall clock. Everywhere else in this
 *  server "now" is injectable, and a single place that reaches for the real time makes a
 *  server with a frozen clock disagree with itself about which days ever existed. */
export function isoLaunch(v: string | undefined, at: number = Date.now(), tz: string = GAME_TZ): string {
  if (v === undefined || v === '') return civilDate(new Date(at), tz);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(new Date(`${v}T12:00:00Z`).getTime())) {
    throw new Error(`launchDate must be YYYY-MM-DD, got ${JSON.stringify(v)}`);
  }
  return v;
}

/** The player-facing view of the flags. Deliberately the same shape minus `signups`,
 *  which is nobody's business but the operator's. */
export function publicFlags(f: Flags): P.PublicFlags {
  return { themes: f.themes, archive: f.archive, weekly: f.weekly, free: f.free, rooms: f.rooms, notice: f.notice };
}

/** Turn a raw standing into the two numbers a player is told.
 *
 *  Bands rather than an exact rank, for two reasons: an exact position is noise when
 *  four people have played, and a band is the thing worth posting. Both come back null
 *  until enough people have finished for the number to mean anything — a "top 1%" out
 *  of three solvers is a lie told with arithmetic. */
const MIN_FINISHERS = 20;
export function bands(st: { ahead: number; total: number; perfect: number }): { percentile: number | null; perfectRate: number | null } {
  if (st.total < MIN_FINISHERS) return { percentile: null, perfectRate: null };
  const pct = (st.ahead / st.total) * 100;
  const band = [1, 5, 10, 25, 50].find((b) => pct <= b) ?? null;
  return { percentile: band, perfectRate: Math.round((st.perfect / st.total) * 100) };
}

export class GameServer {
  store: Store;
  private opts: Required<Omit<ServerOptions, 'staticDir' | 'store'>> & { staticDir?: string };
  readonly startedAt = Date.now();
  private puzzles = new Map<string, Puzzle>();
  /** Caches only. Everything here can be rebuilt from the database, because on a
   *  serverless host the next request may land on a process that has never seen this
   *  play before — nothing correctness-bearing is allowed to live in memory. */
  private live = new Map<string, Session>();

  constructor(o: ServerOptions = {}) {
    this.store = o.store ?? new SqliteStore(o.dbPath ?? ':memory:');
    // resolved before the option block, because the launch-date default reads both
    const now = o.now ?? (() => Date.now());
    const timezone = o.timezone ?? GAME_TZ;
    this.opts = {
      dbPath: o.dbPath ?? ':memory:',
      dev: o.dev ?? true,
      now,
      hintBudget: o.hintBudget ?? HINT_BUDGET,
      minMoveIntervalMs: o.minMoveIntervalMs ?? 40,
      launchDate: isoLaunch(o.launchDate, now(), timezone),
      allowedOrigins: o.allowedOrigins ?? (o.dev === false ? [] : ['*']),
      sendEmail: o.sendEmail ?? (async () => { /* dev: the code comes back in the response */ }),
      timezone,
      adminToken: o.adminToken ?? '',
      editionSecret: o.editionSecret ?? '',
      staticDir: o.staticDir,
    };
  }

  /** The board a player should be handed right now, resolved in the game's own zone. */
  private today_(): Date { return gameToday(new Date(this.now()), this.opts.timezone); }

  /* ---------------------------- operator flags ---------------------------- */

  private flagCache: { at: number; flags: Flags } | null = null;

  async flags(): Promise<Flags> {
    const now = this.opts.now();
    if (this.flagCache && now - this.flagCache.at < FLAGS_TTL_MS) return this.flagCache.flags;
    let raw: unknown;
    try { raw = JSON.parse((await this.store.getSetting(FLAGS_KEY)) ?? '{}'); } catch { raw = {}; }
    const flags = sanitizeFlags(raw);
    this.flagCache = { at: now, flags };
    return flags;
  }

  /** Every mode gate lives here, so there is exactly one place to read to know what an
   *  operator can switch off and what it costs the player who is mid-game. */
  private gate(f: Flags, mode: P.StartBody['mode'], themeId: string): void {
    if (!f.themes.includes(themeId)) throw new HttpError(403, 'theme-disabled');
    if (mode === 'archive' && !f.archive) throw new HttpError(403, 'archive-disabled');
    if (mode === 'weekly' && !f.weekly) throw new HttpError(403, 'weekly-disabled');
    if (mode === 'free' && !f.free) throw new HttpError(403, 'free-disabled');
  }

  private assertAdmin(req: IncomingMessage): void {
    const secret = this.opts.adminToken;
    // No token configured means no admin surface. Not a 401 with a hint — a 404, the
    // same answer an unknown path gets, so probing tells an attacker nothing.
    if (!secret || secret.length < ADMIN_TOKEN_MIN) throw new HttpError(404, 'no-such-route');
    const given = String(req.headers['x-admin-token'] ?? '');
    const a = Buffer.from(given), b = Buffer.from(secret);
    // compare over equal lengths so the check cannot be timed for the secret's length
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(403, 'admin-denied');
  }

  async adminFlags(req: IncomingMessage): Promise<P.AdminFlagsResult> {
    this.assertAdmin(req);
    return {
      flags: await this.flags(),
      allThemes: themeIds(),
      updatedAt: await this.store.settingUpdatedAt(FLAGS_KEY),
    };
  }

  async adminSetFlags(req: IncomingMessage, body: { flags?: unknown }): Promise<P.AdminFlagsResult> {
    this.assertAdmin(req);
    const next = sanitizeFlags(body?.flags);
    const now = this.opts.now();
    await this.store.putSetting(FLAGS_KEY, JSON.stringify(next), now);
    this.flagCache = { at: now, flags: next };
    return { flags: next, allThemes: themeIds(), updatedAt: now };
  }

  private now() { return this.opts.now(); }

  /* ------------------------------------------------------------------ *
   * Editions. The client sends a MODE, never a seed or a date — so it
   * cannot request tomorrow's board, an easier weekday, or a seed it has
   * already solved offline.
   * ------------------------------------------------------------------ */

  private async refFor(body: P.StartBody): Promise<{ ref: EditionRef; ranked: boolean }> {
    const flags = await this.flags();
    const today = this.today_();
    const ids = themeIds();
    if (!ids.includes(body.themeId)) throw new HttpError(400, 'unknown-theme');
    this.gate(flags, body.mode, body.themeId);
    // A ranked result means the board could not be built in advance. Replays of days from
    // before keyed seeds fail that — anyone can rebuild those boards from the code — so
    // they are not ranked; the leaderboard from the day itself stands. Today's board keeps
    // its ranking until midnight, so switching this on never takes a live board away.
    const rankable = (ref: EditionRef) => keyedDate(ref) || ref.date === isoDate(today);
    if (body.mode === 'daily') {
      return { ref: this.keyed(dailyEdition(ids, today, body.themeId)), ranked: true };
    }
    if (body.mode === 'archive') {
      const iso = String(body.date ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new HttpError(400, 'bad-date');
      const when = new Date(`${iso}T12:00:00Z`);
      if (Number.isNaN(when.getTime())) throw new HttpError(400, 'bad-date');
      if (iso > isoDate(today)) throw new HttpError(403, 'future-edition');
      if (iso < this.opts.launchDate) throw new HttpError(403, 'before-launch');
      const ref = archiveEdition(ids, when, body.themeId);
      return { ref: this.keyed(ref), ranked: rankable(ref) };
    }
    if (body.mode === 'weekly') {
      const week = weeklyEdition(ids, today, body.themeId);
      const todayIdx = (today.getUTCDay() || 7) - 1;
      const idx = Math.max(0, Math.min(6, body.dayIndex ?? todayIdx));
      if (idx > todayIdx) throw new HttpError(403, 'future-edition');
      return { ref: this.keyed(week[idx]), ranked: rankable(week[idx]) };
    }
    // free play: the SERVER picks the seed, and the result is never ranked
    const seed = `free|${body.themeId}|${randomInt(2 ** 31)}`;
    const difficulty = weekdayDifficulty(today);
    return {
      ref: { id: `f:${seed}`, kind: 'free', themeId: body.themeId, difficulty, seed },
      ranked: false,
    };
  }

  /** A ranked board's seed, keyed so it cannot be derived from the date. Only the seed
   *  changes — id, date and difficulty stay as they were — and it never leaves the server
   *  (protocol.ts), so a player learns today's board by playing it and no sooner. */
  private keyed(ref: EditionRef): EditionRef {
    if (!keyedDate(ref)) return ref;
    const secret = this.opts.editionSecret || (this.opts.dev ? DEV_EDITION_SECRET : '');
    if (!secret) throw new HttpError(503, 'edition-secret-missing');
    const mac = createHmac('sha256', secret).update(ref.seed).digest('base64url');
    return { ...ref, seed: `k1|${mac}` };
  }

  puzzleFor(ref: EditionRef): Puzzle {
    const hit = this.puzzles.get(ref.seed);
    if (hit) return hit;
    const p = generate({ seed: ref.seed, difficulty: ref.difficulty, tagSchema: getTheme(ref.themeId).tagSchema });
    this.puzzles.set(ref.seed, p);
    return p;
  }

  /** Exactly what the client is allowed to see: no solution, no seed, no locked clues. */
  private viewOf(p: Puzzle, visible: PlacedClue[]): PuzzleView {
    return {
      w: p.w, h: p.h, n: p.n,
      tags: p.tags,
      labelSeed: p.labelSeed,
      difficulty: p.difficulty,
      clues: visible.map((c) => ({ ...c })),
    };
  }

  /** Rebuild authoritative play state from the stored move list. */
  private async sessionFor(playId: string): Promise<{ session: Session; puzzle: Puzzle }> {
    const row = await this.store.play(playId);
    if (!row) throw new HttpError(404, 'no-such-play');
    const puzzle = this.puzzleFor({
      id: row.edition_id, kind: row.ranked ? 'daily' : 'free',
      themeId: row.theme_id, difficulty: row.difficulty, seed: row.seed,
    });
    let session = this.live.get(playId);
    if (!session) {
      session = new Session({ puzzle, hintBudget: this.opts.hintBudget, now: () => 0 });
      for (const m of JSON.parse(row.moves) as { c: number; s: State }[]) session.mark(m.c, m.s);
      session.mistakes = row.mistakes;
      session.hintsUsed = row.hints;
      this.live.set(playId, session);
    }
    return { session, puzzle };
  }

  /* ------------------------------- API ------------------------------- */

  /** Vercel and every other proxy in front of this put the caller first in
   *  x-forwarded-for. Behind no proxy the socket address is the truth. Either way it is
   *  a hint, not an identity — which is why the email key below exists as well. */
  private clientIp(req?: IncomingMessage): string {
    const fwd = String(req?.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    return fwd || req?.socket?.remoteAddress || 'unknown';
  }

  private async throttle(key: string, limit: number): Promise<void> {
    const n = await this.store.hitRateLimit(key, SIGNIN_WINDOW_MS, this.now());
    if (n > limit) throw new HttpError(429, 'too-many-requests');
  }

  async authRequest(b: P.AuthRequestBody, req?: IncomingMessage): Promise<P.AuthRequestResult> {
    const email = String(b.email ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'bad-email');
    // The IP cap first: it is the one an attacker cannot vary by editing the form.
    await this.throttle(`ip:${this.clientIp(req)}`, SIGNIN_PER_IP);
    await this.throttle(`email:${email}`, SIGNIN_PER_EMAIL);
    const code = String(randomInt(100000, 1000000));
    await this.store.putAuthCode(email, code, this.now() + CODE_TTL);
    if (!this.opts.dev) {
      await this.opts.sendEmail(email, 'Your Beyond Doubt sign-in code',
        `Your code is ${code}. It expires in ten minutes.`);
      return { sent: true };
    }
    // development only: the code comes straight back so there is no mail server to run
    return { sent: true, devCode: code };
  }

  async authVerify(b: P.AuthVerifyBody, req?: IncomingMessage): Promise<P.AuthVerifyResult> {
    const email = String(b.email ?? '').trim().toLowerCase();
    // Six digits is a million guesses, which is nothing at HTTP speed if nobody counts.
    await this.throttle(`vip:${this.clientIp(req)}`, SIGNIN_PER_IP);
    await this.throttle(`vemail:${email}`, SIGNIN_PER_EMAIL * 2);
    if (!await this.store.checkAuthCode(email, String(b.code ?? ''), this.now())) {
      throw new HttpError(401, 'bad-code');
    }
    let user = await this.store.userByEmail(email);
    if (!user) {
      // Closing signups must never lock out someone who already has an account, so the
      // gate sits here — after the code checks out, where we know which case this is.
      if (!(await this.flags()).signups) throw new HttpError(403, 'signups-closed');
      const name = (b.displayName ?? email.split('@')[0]).slice(0, 24);
      user = await this.store.createUser(email, name, this.now());
    } else if (b.displayName) {
      await this.store.setDisplayName(user.id, b.displayName.slice(0, 24));
      user = (await this.store.userById(user.id))!;
    }
    if (!user) throw new HttpError(500, 'user-missing');
    const token = await this.store.issueToken(user.id, this.now() + TOKEN_TTL);
    return { token, user: { id: user.id, displayName: user.display_name, email: user.email } };
  }

  async start(user: UserRow, b: P.StartBody): Promise<P.StartResult> {
    const { ref, ranked } = await this.refFor(b);
    const puzzle = this.puzzleFor(ref);
    const playId = newId('ply');
    await this.store.createPlay({
      id: playId, user_id: user.id, edition_id: ref.id, week_id: ref.weekId ?? null,
      theme_id: ref.themeId, difficulty: ref.difficulty, seed: ref.seed, ranked: ranked ? 1 : 0,
      iso_date: ref.date ?? null,
      started_at: this.now(),
    });
    const prior = await this.store.resultFor(ref.id, user.id);
    return {
      playId,
      edition: {
        id: ref.id, kind: ref.kind === 'weekly' ? 'weekly' : ref.kind === 'daily' ? 'daily' : 'free',
        themeId: ref.themeId, difficulty: ref.difficulty,
        date: ref.date, weekId: ref.weekId, dayIndex: ref.dayIndex, ranked,
      },
      view: this.viewOf(puzzle, puzzle.clues.filter((c) => c.gate === null)),
      serverNow: this.now(),
      hintBudget: this.opts.hintBudget,
      shareSeed: ranked ? undefined : ref.seed,
      previousResult: prior ? {
        editionId: prior.edition_id, timeMs: prior.time_ms, timeAddedMs: prior.mistakes * 60_000, hintsUsed: prior.hints,
        mistakes: prior.mistakes, score: prior.score, perfect: !!prior.perfect,
        ranked: true, rank: await this.store.rankOf(ref.id, user.id),
        // the streak as it stands now, not as it stood when they finished that run
        ...(({ current, best }) => ({ streak: current, bestStreak: best }))(
          streakStats(await this.store.playedDates(user.id), civilDate(this.today_(), 'UTC'))),
      } : null,
    };
  }

  async move(user: UserRow, b: P.MoveBody): Promise<P.MoveAck> {
    const row = await this.store.play(b.playId);
    if (!row) throw new HttpError(404, 'no-such-play');
    if (row.user_id !== user.id) throw new HttpError(403, 'not-your-play');
    if (row.status !== 'open') throw new HttpError(409, 'play-finished');

    const t = this.now();
    if (t - (row.last_move_at ?? 0) < this.opts.minMoveIntervalMs) throw new HttpError(429, 'too-fast');
    await this.store.updatePlay(b.playId, { last_move_at: t } as any);

    const { session, puzzle } = await this.sessionFor(b.playId);
    const cell = Number(b.cell);
    if (!Number.isInteger(cell) || cell < 0 || cell >= puzzle.n) throw new HttpError(400, 'bad-cell');
    const state = (b.state === 1 ? 1 : 0) as State;

    const r = session.mark(cell, state);
    const moves = JSON.parse(row.moves) as { c: number; s: State }[];
    if (r.outcome === 'ok') moves.push({ c: cell, s: state });

    const patch: Record<string, unknown> = {
      last_move_at: t,
      moves: JSON.stringify(moves),
      mistakes: session.mistakes,
      refusals: row.refusals + (r.outcome === 'not-deducible' ? 1 : 0),
    };

    let result: P.RunResult | undefined;
    if (r.solved) {
      // the clock is the SERVER's, start to finish. A client cannot report a time.
      const finished = t;
      const elapsed = finished - row.started_at;
      const s = scoreRun({
        difficulty: row.difficulty, elapsedMs: elapsed,
        hintsUsed: session.hintsUsed, mistakes: session.mistakes,
      });
      patch.status = 'solved';
      patch.finished_at = finished;
      // the date the board BELONGS to — for a daily that is the day it ran, for a weekly
      // member the day it represents, and for free play nothing at all
      const playedDate = row.iso_date;
      let ranked = false;
      if (row.ranked) {
        const outcome = await this.store.recordResult({
          edition_id: row.edition_id, week_id: row.week_id, user_id: user.id, theme_id: row.theme_id,
          time_ms: elapsed, hints: session.hintsUsed, mistakes: session.mistakes,
          score: s.score, perfect: s.perfect ? 1 : 0, submitted_at: finished,
          play_id: row.id, iso_date: playedDate,
          late: playedDate && playedDate !== civilDate(new Date(finished), this.opts.timezone) ? 1 : 0,
        });
        ranked = outcome === 'recorded';
      }
      const stats = streakStats(await this.store.playedDates(user.id),
        civilDate(new Date(finished), this.opts.timezone));
      result = {
        editionId: row.edition_id, timeMs: elapsed, timeAddedMs: s.timeAddedMs, hintsUsed: session.hintsUsed,
        mistakes: session.mistakes, score: s.score, perfect: s.perfect, ranked,
        rank: ranked ? await this.store.rankOf(row.edition_id, user.id) : null,
        streak: stats.current,
        bestStreak: stats.best,
        ...bands(await this.store.standing(row.edition_id, user.id)),
      };
      this.live.delete(b.playId);
    }
    await this.store.updatePlay(b.playId, patch as any);

    return {
      outcome: r.outcome,
      unlocked: r.unlocked.map((c) => ({ ...c })),
      solved: r.solved,
      revealed: session.snapshot().revealed,
      mistakes: session.mistakes,
      hintsUsed: session.hintsUsed,
      elapsedMs: (r.solved ? t : this.now()) - row.started_at,
      result,
    };
  }

  async hint(user: UserRow, b: P.HintBody): Promise<P.HintResult> {
    const row = await this.store.play(b.playId);
    if (!row) throw new HttpError(404, 'no-such-play');
    if (row.user_id !== user.id) throw new HttpError(403, 'not-your-play');
    const { session } = await this.sessionFor(b.playId);
    const hint = session.hint();
    await this.store.updatePlay(b.playId, { hints: session.hintsUsed } as any);
    return { hint, hintsUsed: session.hintsUsed, remaining: this.opts.hintBudget - session.hintsUsed };
  }

  /* -------------------------------- rooms -------------------------------- */

  /** A room is several players racing the SAME edition on their OWN boards. Presence is
   *  therefore honest by construction: a player's progress is derived from the moves the
   *  server already validated, not from anything their client claims. */
  async roomJoin(user: UserRow, b: P.RoomJoinBody): Promise<P.RoomJoinResult> {
    const flags = await this.flags();
    if (!flags.rooms) throw new HttpError(403, 'rooms-disabled');
    const now = this.now();
    let room = b.code ? await this.store.roomByCode(String(b.code).toUpperCase().trim()) : undefined;
    if (b.code && !room) throw new HttpError(404, 'no-such-room');

    if (!room) {
      const start: P.StartBody = {
        mode: b.mode ?? 'daily',
        themeId: b.themeId ?? themeIds()[0],
        dayIndex: b.dayIndex,
      };
      const { ref } = await this.refFor(start);
      const id = newId('rm');
      let code = roomCode();
      for (let i = 0; i < 5 && await this.store.roomByCode(code); i++) code = roomCode();
      await this.store.createRoom({
        id, code, edition_id: ref.id, mode: start.mode, theme_id: start.themeId,
        day_index: b.dayIndex ?? null, host_id: user.id, created_at: now,
      });
      room = (await this.store.roomByCode(code))!;
    }
    if (!room) throw new HttpError(500, 'room-missing');

    const start = await this.start(user, {
      mode: room.mode as P.PlayMode,
      themeId: room.theme_id,
      dayIndex: room.day_index ?? undefined,
    });
    await this.store.joinRoom(room.id, user.id, start.playId, now);

    return {
      roomId: room.id, code: room.code, playId: start.playId,
      edition: start.edition, view: start.view,
      serverNow: now, hintBudget: start.hintBudget,
      players: await this.presence(room.id, user.id),
    };
  }

  async roomHeartbeat(user: UserRow, b: P.RoomHeartbeatBody): Promise<P.RoomHeartbeatResult> {
    const room = await this.store.roomById(String(b.roomId));
    if (!room) throw new HttpError(404, 'no-such-room');
    const focus = b.focusCell === null || b.focusCell === undefined ? null : Number(b.focusCell);
    await this.store.touchMember(room.id, user.id, Number.isInteger(focus) ? focus : null, this.now());
    return { players: await this.presence(room.id, user.id), serverNow: this.now() };
  }

  private async presence(roomId: string, meId: string): Promise<P.RoomPlayer[]> {
    const now = this.now();
    const room = await this.store.roomById(roomId);
    if (!room) throw new HttpError(404, 'no-such-room');
    const members = await this.store.roomPresence(roomId);
    const anyPlay = members.length ? await this.store.play(members[0].play_id) : undefined;
    const total = anyPlay
      ? this.puzzleFor({
          id: anyPlay.edition_id, kind: 'daily', themeId: anyPlay.theme_id,
          difficulty: anyPlay.difficulty, seed: anyPlay.seed,
        }).n
      : 0;
    return members.map((m) => ({
      userId: m.user_id,
      displayName: m.display_name,
      revealed: (JSON.parse(m.moves) as unknown[]).length,
      total,
      mistakes: m.mistakes,
      hintsUsed: m.hints,
      focusCell: m.focus_cell,
      finished: m.status === 'solved',
      elapsedMs: (m.finished_at ?? now) - m.started_at,
      idleSeconds: Math.max(0, Math.round((now - m.last_seen) / 1000)),
      you: m.user_id === meId,
    }));
  }

  /** The back catalogue. Dates come from the server's calendar, so a client cannot
   *  invent a day that never ran or reach past the launch date. */
  async archive(user: UserRow, b: P.ArchiveBody): Promise<P.ArchiveResult> {
    if (!(await this.flags()).archive) throw new HttpError(403, 'archive-disabled');
    const ids = themeIds();
    const themeId = ids.includes(b.themeId) ? b.themeId : ids[0];
    const today = this.today_();
    const todayIso = isoDate(today);
    const beforeIso = b.before && /^\d{4}-\d{2}-\d{2}$/.test(b.before) && b.before <= todayIso
      ? b.before : todayIso;
    const span = Math.min(92, Math.max(1, Math.round(b.days ?? 35)));

    const end = new Date(`${beforeIso}T12:00:00Z`);
    const days: P.ArchiveDay[] = [];
    for (let i = 0; i < span; i++) {
      const d = new Date(end.getTime() - i * 86400_000);
      const iso = isoDate(d);
      if (iso < this.opts.launchDate) break;
      const ref = dailyEdition(ids, d, themeId);
      days.push({
        date: iso, editionId: ref.id, themeId,
        difficulty: ref.difficulty, weekday: (d.getUTCDay() || 7) - 1,
        played: false, score: null, timeMs: null, perfect: false, late: false,
      });
    }
    const mine = await this.store.resultsByEdition(user.id, days.map((d) => d.editionId));
    for (const d of days) {
      const r = mine.get(d.editionId);
      if (!r) continue;
      d.played = true; d.score = r.score; d.timeMs = r.time_ms;
      d.perfect = !!r.perfect; d.late = !!r.late;
    }
    return {
      themeId, from: days.length ? days[days.length - 1].date : beforeIso, to: beforeIso,
      today: todayIso, launch: this.opts.launchDate, days,
      completed: days.filter((d) => d.played).length,
    };
  }

  async board(editionId: string, user: UserRow | null): Promise<P.BoardResult> {
    const rows = await this.store.board(editionId, 25);
    const map = (r: (typeof rows)[number]) => ({
      editionId: r.edition_id, weekId: r.week_id ?? undefined, themeId: r.theme_id,
      playerId: r.user_id, displayName: r.display_name, locale: 'en',
      timeMs: r.time_ms, hintsUsed: r.hints, mistakes: r.mistakes,
      score: r.score, perfect: !!r.perfect, submittedAt: r.submitted_at,
    });
    return {
      entries: rows.map(map),
      you: user ? (rows.filter((r) => r.user_id === user.id).map(map)[0] ?? null) : null,
    };
  }

  async week(wid: string): Promise<P.WeekResult> {
    return {
      weekId: wid,
      standings: (await this.store.weekBoard(wid, 25)).map((r) => ({
        playerId: r.user_id, displayName: r.display_name,
        daysCompleted: r.days, totalScore: r.total, totalTimeMs: r.time, perfectDays: r.perfects,
      })),
    };
  }

  /** Liveness plus the two things that actually break in production: the database and
   *  the board generator. A health check that only says "the process is up" is theatre. */
  async health(): Promise<{ ok: boolean; uptimeMs: number; db: boolean; generator: boolean; version: string }> {
    let db = false, generator = false;
    try { await this.store.userById('healthcheck'); db = true; } catch { /* reported below */ }
    try { generator = this.puzzleFor(dailyEdition(themeIds(), this.today_())).n > 0; } catch { /* ditto */ }
    return { ok: db && generator, uptimeMs: Date.now() - this.startedAt, db, generator, version: '0.1.0' };
  }

  async today(): Promise<P.TodayResult> {
    const today = this.today_();
    const ids = themeIds();
    const flags = await this.flags();
    return {
      weekId: weekId(today),
      serverNow: this.now(),
      flags: publicFlags(flags),
      editions: ids.filter((id) => flags.themes.includes(id)).map((id) => {
        const ref = dailyEdition(ids, today, id);
        return {
          id: ref.id, kind: 'daily' as const, themeId: id, difficulty: ref.difficulty,
          date: ref.date, weekId: ref.weekId, ranked: true,
        };
      }),
    };
  }

  /** Everything the home screen needs to greet a returning player: who they are, and
   *  the streak they are protecting. Cheap enough to call on every load. */
  async me(user: UserRow): Promise<P.MeResult> {
    const played = await this.store.playedDates(user.id);
    const st = streakStats(played, civilDate(this.today_(), 'UTC'));
    return {
      user: { id: user.id, displayName: user.display_name, email: user.email },
      streak: st.current, bestStreak: st.best, playedToday: st.playedToday, atRisk: st.atRisk,
      daysPlayed: played.length,
    };
  }

  /* ------------------------- account controls ------------------------- */

  /** A copy of everything, in the only format that is honestly complete: the rows
   *  themselves. No summary, because a summary is us deciding what they get to see. */
  async accountExport(user: UserRow): Promise<P.ExportResult> {
    const raw = await this.store.exportUser(user.id);
    return {
      exportedAt: this.now(),
      account: {
        id: raw.user.id, email: raw.user.email,
        displayName: raw.user.display_name, createdAt: raw.user.created_at,
      },
      plays: raw.plays.map((p) => ({
        editionId: p.edition_id, themeId: p.theme_id, mode: p.week_id ? 'weekly' : 'daily',
        date: p.iso_date, ranked: !!p.ranked, startedAt: p.started_at, finishedAt: p.finished_at,
        hints: p.hints, mistakes: p.mistakes, refusals: p.refusals, status: p.status,
      })),
      results: raw.results.map((r) => ({
        editionId: r.edition_id, themeId: r.theme_id, date: r.iso_date, weekId: r.week_id,
        timeMs: r.time_ms, hints: r.hints, mistakes: r.mistakes, score: r.score,
        perfect: !!r.perfect, late: !!r.late, submittedAt: r.submitted_at,
      })),
    };
  }

  /** Deleting an account is irreversible, so it takes more than a live session: the
   *  player proves the address still theirs with a fresh emailed code. A stolen phone
   *  should not be able to erase someone's five-year streak. */
  async accountDelete(user: UserRow, b: { code?: string; confirm?: string }): Promise<P.DeleteResult> {
    if (String(b?.confirm ?? '').trim().toUpperCase() !== 'DELETE') {
      throw new HttpError(400, 'confirm-required');
    }
    if (!await this.store.checkAuthCode(user.email, String(b?.code ?? ''), this.now())) {
      throw new HttpError(401, 'bad-code');
    }
    const removed = await this.store.deleteUser(user.id);
    return { deleted: true, removed };
  }

  /* ---------------------------- transport ---------------------------- */

  private async auth(req: IncomingMessage): Promise<UserRow> {
    const h = req.headers.authorization ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    const user = token ? await this.store.userForToken(token, this.now()) : undefined;
    if (!user) throw new HttpError(401, 'sign-in-required');
    return user;
  }

  handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const origin = String(req.headers.origin ?? '');
    const allow = this.opts.allowedOrigins;
    if (allow.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
    else if (origin && allow.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Headers', 'content-type,authorization,x-admin-token');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }

    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        const body = req.method === 'POST' ? await readJson(req) : {};
        const out = await this.route(url.pathname, body, req);
        json(res, 200, out);
        return;
      }
      await this.serveStatic(url.pathname, res);
    } catch (e) {
      const err = e as HttpError;
      const code = err.status ?? 500;
      json(res, code, { error: err.code ?? 'server-error', detail: code === 500 ? String(err.message) : undefined });
    }
  };

  private async route(path: string, body: any, req: IncomingMessage): Promise<unknown> {
    switch (path) {
      case '/api/auth/request': return this.authRequest(body, req);
      case '/api/auth/verify': return this.authVerify(body, req);
      case '/api/me': return this.me(await this.auth(req));
      case '/api/account/export': return this.accountExport(await this.auth(req));
      case '/api/account/delete': return this.accountDelete(await this.auth(req), body);
      case '/api/play/start': return this.start(await this.auth(req), body);
      case '/api/play/move': return this.move(await this.auth(req), body);
      case '/api/play/hint': return this.hint(await this.auth(req), body);
      case '/api/archive': return this.archive(await this.auth(req), body);
      case '/api/room/join': return this.roomJoin(await this.auth(req), body);
      case '/api/room/heartbeat': return this.roomHeartbeat(await this.auth(req), body);
      case '/api/today': return this.today();
      case '/api/flags': return { flags: publicFlags(await this.flags()) };
      case '/api/admin/flags': return this.adminFlags(req);
      case '/api/admin/flags/set': return this.adminSetFlags(req, body);
      case '/api/health': return this.health();
      case '/api/board': {
        const u = new URL(req.url ?? '/', 'http://localhost');
        let me: UserRow | null = null;
        try { me = await this.auth(req); } catch { me = null; }
        return this.board(u.searchParams.get('editionId') ?? '', me);
      }
      case '/api/week': {
        const u = new URL(req.url ?? '/', 'http://localhost');
        return this.week(u.searchParams.get('weekId') ?? '');
      }
      default: throw new HttpError(404, 'no-such-route');
    }
  }

  private async serveStatic(pathname: string, res: ServerResponse): Promise<void> {
    if (!this.opts.staticDir) throw new HttpError(404, 'not-found');
    const rel = pathname === '/' ? '/clues-demo.html' : pathname;
    const safe = normalize(rel).replace(/^(\.\.[/\\])+/, '');
    const file = join(this.opts.staticDir, safe);
    if (!file.startsWith(normalize(this.opts.staticDir))) throw new HttpError(403, 'forbidden');
    let buf: Buffer;
    try { buf = await readFile(file); } catch { throw new HttpError(404, 'not-found'); }
    const types: Record<string, string> = {
      '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
      '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    };
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(buf);
  }

  listen(port: number): ReturnType<typeof createServer> {
    const srv = createServer((req, res) => void this.handler(req, res));
    srv.listen(port);
    return srv;
  }
}

/** Ranked boards dated on or after this day take a seed keyed with EDITION_SECRET.
 *
 *  Before it, a board's seed was `daily|<date>|<theme>` (weekly likewise), and boards are
 *  pure functions of their seed — so anyone with the code could build tomorrow's ranked
 *  board tonight and solve it offline with the engine's own solver. The server already
 *  refused to HAND OUT a future board; nothing stopped anyone computing one.
 *
 *  Earlier boards keep their original seeds: they have been played and ranked, and the
 *  archive promises the board that actually ran. What changes for them is that a replay
 *  is no longer ranked — see refFor. */
export const SECRET_SEEDS_FROM = '2026-09-25';
const DEV_EDITION_SECRET = 'dev-only-edition-secret';
const keyedDate = (ref: EditionRef) => !!ref.date && ref.date >= SECRET_SEEDS_FROM;

export class HttpError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

function json(res: ServerResponse, code: number, body: unknown): void {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 64 * 1024) throw new HttpError(413, 'body-too-large');
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'bad-json'); }
}
