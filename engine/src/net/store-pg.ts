import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import {
  Store, UserRow, PlayRow, ResultRow, RoomRow, RoomMemberRow, NewPlay, WeekRow, newId,
} from './store.js';

/** Postgres backend. Same queries as the SQLite store, same semantics, same tests —
 *  `npm run test:pg` runs the entire server suite against this class.
 *
 *  Three real differences from SQLite, all of them handled here rather than upstream:
 *   1. No implicit `rowid`, so auth_codes carries its own id.
 *   2. `count()` and `sum()` come back as strings, because bigint does not fit a JS number.
 *      Every aggregate is coerced, otherwise "days completed" would concatenate.
 *   3. Placeholders are $1..$n rather than ?.
 */
export class PostgresStore implements Store {
  constructor(private pool: Pool) {}

  private async q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.pool.query(text, params as any[]);
    return res.rows as T[];
  }
  private async one<T = any>(text: string, params: unknown[] = []): Promise<T | undefined> {
    return (await this.q<T>(text, params))[0];
  }

  async migrate(): Promise<void> {
    try {
      await this.runMigration();
    } catch (e) {
      // Several serverless instances cold-start at once on the first request, so they all
      // race this. CREATE ... IF NOT EXISTS still raises duplicate_table / duplicate_object
      // when two transactions create the same object concurrently; losing that race is fine.
      const code = (e as { code?: string }).code;
      if (code !== '42P07' && code !== '42710' && code !== '23505') throw e;
    }
  }

  private async runMigration(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL, created_at BIGINT NOT NULL);
      CREATE TABLE IF NOT EXISTS auth_codes (
        id BIGSERIAL PRIMARY KEY, email TEXT NOT NULL, code_hash TEXT NOT NULL,
        expires_at BIGINT NOT NULL, attempts INT NOT NULL DEFAULT 0, used INT NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS auth_codes_email ON auth_codes(email);
      CREATE TABLE IF NOT EXISTS tokens (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at BIGINT NOT NULL);
      CREATE TABLE IF NOT EXISTS plays (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, edition_id TEXT NOT NULL,
        week_id TEXT, theme_id TEXT NOT NULL, difficulty INT NOT NULL,
        seed TEXT NOT NULL, ranked INT NOT NULL, iso_date TEXT,
        started_at BIGINT NOT NULL, finished_at BIGINT,
        hints INT NOT NULL DEFAULT 0, mistakes INT NOT NULL DEFAULT 0,
        refusals INT NOT NULL DEFAULT 0, moves TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'open', last_move_at BIGINT NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS plays_user ON plays(user_id, edition_id);
      CREATE TABLE IF NOT EXISTS results (
        edition_id TEXT NOT NULL, week_id TEXT, user_id TEXT NOT NULL, theme_id TEXT NOT NULL,
        time_ms BIGINT NOT NULL, hints INT NOT NULL, mistakes INT NOT NULL,
        score INT NOT NULL, perfect INT NOT NULL, submitted_at BIGINT NOT NULL,
        play_id TEXT NOT NULL, iso_date TEXT, late INT NOT NULL DEFAULT 0,
        PRIMARY KEY (edition_id, user_id));
      CREATE INDEX IF NOT EXISTS results_week ON results(week_id);
      CREATE INDEX IF NOT EXISTS results_user ON results(user_id);
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, edition_id TEXT NOT NULL,
        mode TEXT NOT NULL, theme_id TEXT NOT NULL, day_index INT,
        host_id TEXT NOT NULL, created_at BIGINT NOT NULL);
      CREATE TABLE IF NOT EXISTS room_members (
        room_id TEXT NOT NULL, user_id TEXT NOT NULL, play_id TEXT NOT NULL,
        focus_cell INT, joined_at BIGINT NOT NULL, last_seen BIGINT NOT NULL,
        PRIMARY KEY (room_id, user_id));
      CREATE INDEX IF NOT EXISTS room_members_room ON room_members(room_id);
    `);
  }

  /* ---------- users + auth ---------- */

  async userByEmail(email: string): Promise<UserRow | undefined> {
    return user(await this.one('SELECT * FROM users WHERE email = $1', [email]));
  }
  async userById(id: string): Promise<UserRow | undefined> {
    return user(await this.one('SELECT * FROM users WHERE id = $1', [id]));
  }
  async createUser(email: string, displayName: string, now: number): Promise<UserRow> {
    const id = newId('usr');
    await this.q('INSERT INTO users (id,email,display_name,created_at) VALUES ($1,$2,$3,$4)',
      [id, email, displayName, now]);
    return (await this.userById(id))!;
  }
  async setDisplayName(userId: string, name: string): Promise<void> {
    await this.q('UPDATE users SET display_name = $1 WHERE id = $2', [name, userId]);
  }

  async putAuthCode(email: string, code: string, expiresAt: number): Promise<void> {
    await this.q('UPDATE auth_codes SET used = 1 WHERE email = $1', [email]);
    await this.q('INSERT INTO auth_codes (email,code_hash,expires_at) VALUES ($1,$2,$3)',
      [email, sha(code), expiresAt]);
  }

  async checkAuthCode(email: string, code: string, now: number): Promise<boolean> {
    const row = await this.one<any>(
      'SELECT id, code_hash, expires_at, attempts FROM auth_codes WHERE email = $1 AND used = 0 ORDER BY id DESC LIMIT 1',
      [email]);
    if (!row) return false;
    await this.q('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    if (Number(row.attempts) >= 5 || Number(row.expires_at) < now) return false;
    const a = Buffer.from(sha(code), 'hex'), b = Buffer.from(String(row.code_hash), 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    await this.q('UPDATE auth_codes SET used = 1 WHERE id = $1', [row.id]);
    return true;
  }

  async issueToken(userId: string, expiresAt: number): Promise<string> {
    const token = randomBytes(24).toString('hex');
    await this.q('INSERT INTO tokens (token_hash,user_id,expires_at) VALUES ($1,$2,$3)',
      [sha(token), userId, expiresAt]);
    return token;
  }
  async userForToken(token: string, now: number): Promise<UserRow | undefined> {
    const row = await this.one<any>('SELECT user_id, expires_at FROM tokens WHERE token_hash = $1', [sha(token)]);
    if (!row || Number(row.expires_at) < now) return undefined;
    return this.userById(String(row.user_id));
  }

  /* ---------- plays ---------- */

  async createPlay(p: NewPlay): Promise<PlayRow> {
    await this.q(`INSERT INTO plays (id,user_id,edition_id,week_id,theme_id,difficulty,seed,ranked,iso_date,started_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [p.id, p.user_id, p.edition_id, p.week_id, p.theme_id, p.difficulty, p.seed, p.ranked, p.iso_date, p.started_at]);
    return (await this.play(p.id))!;
  }
  async play(id: string): Promise<PlayRow | undefined> {
    return playRow(await this.one('SELECT * FROM plays WHERE id = $1', [id]));
  }
  async updatePlay(id: string, patch: Partial<PlayRow>): Promise<void> {
    const keys = Object.keys(patch);
    if (!keys.length) return;
    const set = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    await this.q(`UPDATE plays SET ${set} WHERE id = $${keys.length + 1}`,
      [...keys.map((k) => (patch as any)[k]), id]);
  }

  /* ---------- results ---------- */

  async recordResult(r: ResultRow): Promise<'recorded' | 'already-ranked'> {
    // ON CONFLICT DO NOTHING makes "first attempt wins" atomic even under a double-submit
    const res = await this.pool.query(`INSERT INTO results
      (edition_id,week_id,user_id,theme_id,time_ms,hints,mistakes,score,perfect,submitted_at,play_id,iso_date,late)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (edition_id, user_id) DO NOTHING`,
      [r.edition_id, r.week_id, r.user_id, r.theme_id, r.time_ms, r.hints, r.mistakes,
       r.score, r.perfect, r.submitted_at, r.play_id, r.iso_date, r.late]);
    return res.rowCount ? 'recorded' : 'already-ranked';
  }

  async resultFor(editionId: string, userId: string): Promise<ResultRow | undefined> {
    return resultRow(await this.one('SELECT * FROM results WHERE edition_id = $1 AND user_id = $2', [editionId, userId]));
  }

  async board(editionId: string, limit: number): Promise<(ResultRow & { display_name: string })[]> {
    const rows = await this.q(`SELECT r.*, u.display_name FROM results r JOIN users u ON u.id = r.user_id
      WHERE r.edition_id = $1 ORDER BY r.score DESC, r.time_ms ASC, r.submitted_at ASC LIMIT $2`,
      [editionId, limit]);
    return rows.map((r) => ({ ...resultRow(r)!, display_name: String(r.display_name) }));
  }

  async weekBoard(weekId: string, limit: number): Promise<WeekRow[]> {
    const rows = await this.q(`SELECT x.user_id, u.display_name,
        COUNT(*) AS days, SUM(x.best) AS total, SUM(x.fastest) AS time, SUM(x.perfect) AS perfects
      FROM (
        SELECT r.user_id, r.iso_date,
               MAX(r.score) AS best, MIN(r.time_ms) AS fastest, MAX(r.perfect) AS perfect
        FROM results r
        WHERE r.week_id = $1 AND r.late = 0 AND r.iso_date IS NOT NULL
        GROUP BY r.user_id, r.iso_date
      ) x JOIN users u ON u.id = x.user_id
      GROUP BY x.user_id, u.display_name
      ORDER BY days DESC, total DESC, time ASC LIMIT $2`, [weekId, limit]);
    return rows.map((r) => ({
      user_id: String(r.user_id), display_name: String(r.display_name),
      days: Number(r.days), total: Number(r.total), time: Number(r.time), perfects: Number(r.perfects),
    }));
  }

  async rankOf(editionId: string, userId: string): Promise<number | null> {
    const rows = await this.board(editionId, 10000);
    const i = rows.findIndex((r) => r.user_id === userId);
    return i === -1 ? null : i + 1;
  }

  async streak(userId: string, isoDates: string[]): Promise<number> {
    const rows = await this.q<{ iso_date: string }>(
      'SELECT DISTINCT iso_date FROM results WHERE user_id = $1 AND iso_date IS NOT NULL AND late = 0', [userId]);
    const done = new Set(rows.map((r) => r.iso_date));
    let n = 0;
    for (const d of isoDates) { if (!done.has(d)) break; n++; }
    return n;
  }

  async resultsByEdition(userId: string, editionIds: string[]): Promise<Map<string, ResultRow>> {
    if (!editionIds.length) return new Map();
    const rows = await this.q('SELECT * FROM results WHERE user_id = $1 AND edition_id = ANY($2)',
      [userId, editionIds]);
    return new Map(rows.map((r) => [String(r.edition_id), resultRow(r)!]));
  }

  /* ---------- rooms ---------- */

  async createRoom(r: RoomRow): Promise<void> {
    await this.q(`INSERT INTO rooms (id,code,edition_id,mode,theme_id,day_index,host_id,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [r.id, r.code, r.edition_id, r.mode, r.theme_id, r.day_index, r.host_id, r.created_at]);
  }
  async roomByCode(code: string): Promise<RoomRow | undefined> {
    return roomRow(await this.one('SELECT * FROM rooms WHERE code = $1', [code]));
  }
  async roomById(id: string): Promise<RoomRow | undefined> {
    return roomRow(await this.one('SELECT * FROM rooms WHERE id = $1', [id]));
  }
  async joinRoom(roomId: string, userId: string, playId: string, now: number): Promise<void> {
    await this.q(`INSERT INTO room_members (room_id,user_id,play_id,joined_at,last_seen)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (room_id,user_id) DO UPDATE SET play_id = excluded.play_id, last_seen = excluded.last_seen`,
      [roomId, userId, playId, now, now]);
  }
  async touchMember(roomId: string, userId: string, focusCell: number | null, now: number): Promise<void> {
    await this.q('UPDATE room_members SET last_seen = $1, focus_cell = $2 WHERE room_id = $3 AND user_id = $4',
      [now, focusCell, roomId, userId]);
  }
  async roomPresence(roomId: string): Promise<RoomMemberRow[]> {
    const rows = await this.q(`SELECT m.user_id, m.play_id, m.focus_cell, m.last_seen, u.display_name,
        p.moves, p.mistakes, p.hints, p.status, p.started_at, p.finished_at
      FROM room_members m
      JOIN users u ON u.id = m.user_id
      JOIN plays p ON p.id = m.play_id
      WHERE m.room_id = $1 ORDER BY m.joined_at ASC`, [roomId]);
    return rows.map((r) => ({
      user_id: String(r.user_id), play_id: String(r.play_id),
      focus_cell: r.focus_cell === null ? null : Number(r.focus_cell),
      last_seen: Number(r.last_seen), display_name: String(r.display_name),
      moves: String(r.moves), mistakes: Number(r.mistakes), hints: Number(r.hints),
      status: String(r.status), started_at: Number(r.started_at),
      finished_at: r.finished_at === null ? null : Number(r.finished_at),
    }));
  }

  async close(): Promise<void> { await this.pool.end(); }
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/* Postgres returns BIGINT as a string. Coerce at the boundary so no arithmetic upstream
 * ever sees one — this is the class of bug that silently turns 1 + 1 into "11". */
function user(r: any): UserRow | undefined {
  return r && { id: String(r.id), email: String(r.email), display_name: String(r.display_name), created_at: Number(r.created_at) };
}
function playRow(r: any): PlayRow | undefined {
  return r && {
    id: String(r.id), user_id: String(r.user_id), edition_id: String(r.edition_id),
    week_id: r.week_id === null ? null : String(r.week_id), theme_id: String(r.theme_id),
    difficulty: Number(r.difficulty), seed: String(r.seed), ranked: Number(r.ranked),
    iso_date: r.iso_date === null ? null : String(r.iso_date),
    started_at: Number(r.started_at), finished_at: r.finished_at === null ? null : Number(r.finished_at),
    hints: Number(r.hints), mistakes: Number(r.mistakes), refusals: Number(r.refusals),
    moves: String(r.moves), status: String(r.status), last_move_at: Number(r.last_move_at),
  };
}
function resultRow(r: any): ResultRow | undefined {
  return r && {
    edition_id: String(r.edition_id), week_id: r.week_id === null ? null : String(r.week_id),
    user_id: String(r.user_id), theme_id: String(r.theme_id),
    time_ms: Number(r.time_ms), hints: Number(r.hints), mistakes: Number(r.mistakes),
    score: Number(r.score), perfect: Number(r.perfect), submitted_at: Number(r.submitted_at),
    play_id: String(r.play_id), iso_date: r.iso_date === null ? null : String(r.iso_date),
    late: Number(r.late),
  };
}
function roomRow(r: any): RoomRow | undefined {
  return r && {
    id: String(r.id), code: String(r.code), edition_id: String(r.edition_id),
    mode: String(r.mode), theme_id: String(r.theme_id),
    day_index: r.day_index === null ? null : Number(r.day_index),
    host_id: String(r.host_id), created_at: Number(r.created_at),
  };
}
