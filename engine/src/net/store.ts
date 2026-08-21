import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

/** Storage is an interface, not a class, because production needs Postgres and local
 *  development wants a file. Every method is async so the two are interchangeable —
 *  SQLite answers immediately, Postgres awaits, and nothing above here can tell. */

export interface UserRow { id: string; email: string; display_name: string; created_at: number; }
export interface PlayRow {
  id: string; user_id: string; edition_id: string; week_id: string | null; theme_id: string;
  difficulty: number; seed: string; ranked: number; iso_date: string | null;
  started_at: number; finished_at: number | null;
  hints: number; mistakes: number; refusals: number; moves: string; status: string;
  last_move_at: number;
}
export interface ResultRow {
  edition_id: string; week_id: string | null; user_id: string; theme_id: string;
  time_ms: number; hints: number; mistakes: number; score: number; perfect: number;
  submitted_at: number; play_id: string; iso_date: string | null;
  /** solved from the archive rather than on the day — ranks on that day's board,
   *  but must not manufacture a streak or rewrite a finished week */
  late: number;
}

export interface RoomRow {
  id: string; code: string; edition_id: string; mode: string;
  theme_id: string; day_index: number | null; host_id: string; created_at: number;
}
export interface RoomMemberRow {
  user_id: string; play_id: string; focus_cell: number | null; last_seen: number;
  display_name: string; moves: string; mistakes: number; hints: number;
  status: string; started_at: number; finished_at: number | null;
}

export const newId = (p: string) => `${p}_${randomBytes(9).toString('hex')}`;

/** Room codes people read aloud: no 0/O/1/I, no vowels, so no accidental words. */
const CODE_ALPHABET = 'BCDFGHJKMNPQRSTVWXYZ23456789';
export function roomCode(): string {
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export interface Store {
  userByEmail(email: string): Promise<UserRow | undefined>;
  userById(id: string): Promise<UserRow | undefined>;
  createUser(email: string, displayName: string, now: number): Promise<UserRow>;
  setDisplayName(userId: string, name: string): Promise<void>;
  putAuthCode(email: string, code: string, expiresAt: number): Promise<void>;
  checkAuthCode(email: string, code: string, now: number): Promise<boolean>;
  issueToken(userId: string, expiresAt: number): Promise<string>;
  userForToken(token: string, now: number): Promise<UserRow | undefined>;
  createPlay(p: NewPlay): Promise<PlayRow>;
  play(id: string): Promise<PlayRow | undefined>;
  updatePlay(id: string, patch: Partial<PlayRow>): Promise<void>;
  recordResult(r: ResultRow): Promise<'recorded' | 'already-ranked'>;
  resultFor(editionId: string, userId: string): Promise<ResultRow | undefined>;
  board(editionId: string, limit: number): Promise<(ResultRow & { display_name: string })[]>;
  weekBoard(weekId: string, limit: number): Promise<WeekRow[]>;
  rankOf(editionId: string, userId: string): Promise<number | null>;
  streak(userId: string, isoDates: string[]): Promise<number>;
  resultsByEdition(userId: string, editionIds: string[]): Promise<Map<string, ResultRow>>;
  createRoom(r: RoomRow): Promise<void>;
  roomByCode(code: string): Promise<RoomRow | undefined>;
  roomById(id: string): Promise<RoomRow | undefined>;
  joinRoom(roomId: string, userId: string, playId: string, now: number): Promise<void>;
  touchMember(roomId: string, userId: string, focusCell: number | null, now: number): Promise<void>;
  roomPresence(roomId: string): Promise<RoomMemberRow[]>;
  /** operator settings, JSON-encoded. One row per key. */
  getSetting(key: string): Promise<string | undefined>;
  putSetting(key: string, value: string, now: number): Promise<void>;
  settingUpdatedAt(key: string): Promise<number | null>;
  /** create tables if they are missing */
  migrate(): Promise<void>;
  close(): Promise<void>;
}

export type NewPlay = Omit<PlayRow, 'hints' | 'mistakes' | 'refusals' | 'moves' | 'status' | 'finished_at' | 'last_move_at'>;
export interface WeekRow {
  user_id: string; display_name: string; days: number; total: number; time: number; perfects: number;
}

export class SqliteStore implements Store {
  db: DatabaseSync;

  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS auth_codes (
        email TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS auth_codes_email ON auth_codes(email);
      CREATE TABLE IF NOT EXISTS tokens (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS plays (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, edition_id TEXT NOT NULL,
        week_id TEXT, theme_id TEXT NOT NULL, difficulty INTEGER NOT NULL,
        seed TEXT NOT NULL, ranked INTEGER NOT NULL, iso_date TEXT,
        started_at INTEGER NOT NULL, finished_at INTEGER,
        hints INTEGER NOT NULL DEFAULT 0, mistakes INTEGER NOT NULL DEFAULT 0,
        refusals INTEGER NOT NULL DEFAULT 0, moves TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'open', last_move_at INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS plays_user ON plays(user_id, edition_id);
      CREATE TABLE IF NOT EXISTS results (
        edition_id TEXT NOT NULL, week_id TEXT, user_id TEXT NOT NULL, theme_id TEXT NOT NULL,
        time_ms INTEGER NOT NULL, hints INTEGER NOT NULL, mistakes INTEGER NOT NULL,
        score INTEGER NOT NULL, perfect INTEGER NOT NULL, submitted_at INTEGER NOT NULL,
        play_id TEXT NOT NULL, iso_date TEXT, late INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (edition_id, user_id));
      CREATE INDEX IF NOT EXISTS results_week ON results(week_id);
      CREATE INDEX IF NOT EXISTS results_user ON results(user_id);
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, edition_id TEXT NOT NULL,
        mode TEXT NOT NULL, theme_id TEXT NOT NULL, day_index INTEGER,
        host_id TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS room_members (
        room_id TEXT NOT NULL, user_id TEXT NOT NULL, play_id TEXT NOT NULL,
        focus_cell INTEGER, joined_at INTEGER NOT NULL, last_seen INTEGER NOT NULL,
        PRIMARY KEY (room_id, user_id));
      CREATE INDEX IF NOT EXISTS room_members_room ON room_members(room_id);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    `);
  }

  /* ---------- operator settings ---------- */

  async getSetting(key: string): Promise<string | undefined> {
    const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value?: string } | undefined;
    return r?.value;
  }
  async putSetting(key: string, value: string, now: number): Promise<void> {
    this.db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(key, value, now);
  }
  async settingUpdatedAt(key: string): Promise<number | null> {
    const r = this.db.prepare('SELECT updated_at FROM settings WHERE key = ?').get(key) as { updated_at?: number } | undefined;
    return r?.updated_at ?? null;
  }

  /* ---------- users + auth ---------- */

  async userByEmail(email: string): Promise<UserRow | undefined> {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  }
  async userById(id: string): Promise<UserRow | undefined> {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  }
  async createUser(email: string, displayName: string, now: number): Promise<UserRow> {
    const id = newId('usr');
    this.db.prepare('INSERT INTO users (id,email,display_name,created_at) VALUES (?,?,?,?)')
      .run(id, email, displayName, now);
    return (await this.userById(id))!;
  }
  async setDisplayName(userId: string, name: string): Promise<void> {
    this.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, userId);
  }

  async putAuthCode(email: string, code: string, expiresAt: number): Promise<void> {
    this.db.prepare('UPDATE auth_codes SET used = 1 WHERE email = ?').run(email);
    this.db.prepare('INSERT INTO auth_codes (email,code_hash,expires_at) VALUES (?,?,?)')
      .run(email, sha(code), expiresAt);
  }
  /** Constant-time compare, single-use, attempt-capped. */
  async checkAuthCode(email: string, code: string, now: number): Promise<boolean> {
    const row = this.db.prepare(
      'SELECT rowid, code_hash, expires_at, attempts, used FROM auth_codes WHERE email = ? AND used = 0 ORDER BY rowid DESC LIMIT 1',
    ).get(email) as any;
    if (!row) return false;
    this.db.prepare('UPDATE auth_codes SET attempts = attempts + 1 WHERE rowid = ?').run(row.rowid);
    if (row.attempts >= 5 || row.expires_at < now) return false;
    const a = Buffer.from(sha(code), 'hex'), b = Buffer.from(String(row.code_hash), 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    this.db.prepare('UPDATE auth_codes SET used = 1 WHERE rowid = ?').run(row.rowid);
    return true;
  }

  async issueToken(userId: string, expiresAt: number): Promise<string> {
    const token = randomBytes(24).toString('hex');
    this.db.prepare('INSERT INTO tokens (token_hash,user_id,expires_at) VALUES (?,?,?)')
      .run(sha(token), userId, expiresAt);
    return token;
  }
  async userForToken(token: string, now: number): Promise<UserRow | undefined> {
    const row = this.db.prepare('SELECT user_id, expires_at FROM tokens WHERE token_hash = ?')
      .get(sha(token)) as any;
    if (!row || row.expires_at < now) return undefined;
    return this.userById(String(row.user_id));
  }

  /* ---------- plays ---------- */

  async createPlay(p: NewPlay): Promise<PlayRow> {
    this.db.prepare(`INSERT INTO plays (id,user_id,edition_id,week_id,theme_id,difficulty,seed,ranked,iso_date,started_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(p.id, p.user_id, p.edition_id, p.week_id, p.theme_id, p.difficulty, p.seed, p.ranked, p.iso_date, p.started_at);
    return (await this.play(p.id))!;
  }
  async play(id: string): Promise<PlayRow | undefined> {
    return this.db.prepare('SELECT * FROM plays WHERE id = ?').get(id) as PlayRow | undefined;
  }
  async updatePlay(id: string, patch: Partial<PlayRow>): Promise<void> {
    const keys = Object.keys(patch);
    if (!keys.length) return;
    const set = keys.map((k) => `${k} = ?`).join(', ');
    this.db.prepare(`UPDATE plays SET ${set} WHERE id = ?`)
      .run(...keys.map((k) => (patch as any)[k]), id);
  }

  /* ---------- results ---------- */

  /** First completed attempt is the ranked one. Replaying a board you have already solved
   *  is practice — you cannot grind a known board for a better time. */
  async recordResult(r: ResultRow): Promise<'recorded' | 'already-ranked'> {
    const existing = this.db.prepare('SELECT 1 FROM results WHERE edition_id = ? AND user_id = ?')
      .get(r.edition_id, r.user_id);
    if (existing) return 'already-ranked';
    this.db.prepare(`INSERT INTO results
      (edition_id,week_id,user_id,theme_id,time_ms,hints,mistakes,score,perfect,submitted_at,play_id,iso_date,late)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(r.edition_id, r.week_id, r.user_id, r.theme_id, r.time_ms, r.hints, r.mistakes,
           r.score, r.perfect, r.submitted_at, r.play_id, r.iso_date, r.late);
    return 'recorded';
  }

  async resultFor(editionId: string, userId: string): Promise<ResultRow | undefined> {
    return this.db.prepare('SELECT * FROM results WHERE edition_id = ? AND user_id = ?')
      .get(editionId, userId) as ResultRow | undefined;
  }

  async board(editionId: string, limit: number): Promise<(ResultRow & { display_name: string })[]> {
    return this.db.prepare(`SELECT r.*, u.display_name FROM results r JOIN users u ON u.id = r.user_id
      WHERE r.edition_id = ? ORDER BY r.score DESC, r.time_ms ASC, r.submitted_at ASC LIMIT ?`)
      .all(editionId, limit) as any;
  }

  /** One row per player per WEEK. A day counts once no matter how many themes you played
   *  that day — otherwise "5/7 days" would mean "I played five boards on Tuesday". */
  async weekBoard(weekId: string, limit: number): Promise<WeekRow[]> {
    return this.db.prepare(`SELECT x.user_id, u.display_name,
        COUNT(*) AS days, SUM(x.best) AS total, SUM(x.fastest) AS time, SUM(x.perfect) AS perfects
      FROM (
        SELECT r.user_id, r.iso_date,
               MAX(r.score) AS best, MIN(r.time_ms) AS fastest, MAX(r.perfect) AS perfect
        FROM results r
        WHERE r.week_id = ? AND r.late = 0 AND r.iso_date IS NOT NULL
        GROUP BY r.user_id, r.iso_date
      ) x JOIN users u ON u.id = x.user_id
      GROUP BY x.user_id
      ORDER BY days DESC, total DESC, time ASC LIMIT ?`).all(weekId, limit) as any;
  }

  async rankOf(editionId: string, userId: string): Promise<number | null> {
    const rows = await this.board(editionId, 10000);
    const i = rows.findIndex((r) => r.user_id === userId);
    return i === -1 ? null : i + 1;
  }

  /** Consecutive daily editions completed, counting back from the given dates. */
  async streak(userId: string, isoDates: string[]): Promise<number> {
    const rows = this.db.prepare('SELECT DISTINCT iso_date FROM results WHERE user_id = ? AND iso_date IS NOT NULL AND late = 0')
      .all(userId) as { iso_date: string }[];
    const done = new Set(rows.map((r) => r.iso_date));
    let n = 0;
    for (const d of isoDates) { if (!done.has(d)) break; n++; }
    return n;
  }

  /* ---------- rooms ---------- */

  async createRoom(r: RoomRow): Promise<void> {
    this.db.prepare(`INSERT INTO rooms (id,code,edition_id,mode,theme_id,day_index,host_id,created_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(r.id, r.code, r.edition_id, r.mode, r.theme_id, r.day_index, r.host_id, r.created_at);
  }
  async roomByCode(code: string): Promise<RoomRow | undefined> {
    return this.db.prepare('SELECT * FROM rooms WHERE code = ?').get(code) as RoomRow | undefined;
  }
  async roomById(id: string): Promise<RoomRow | undefined> {
    return this.db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as RoomRow | undefined;
  }
  async joinRoom(roomId: string, userId: string, playId: string, now: number): Promise<void> {
    this.db.prepare(`INSERT INTO room_members (room_id,user_id,play_id,joined_at,last_seen)
      VALUES (?,?,?,?,?)
      ON CONFLICT(room_id,user_id) DO UPDATE SET play_id = excluded.play_id, last_seen = excluded.last_seen`)
      .run(roomId, userId, playId, now, now);
  }
  async touchMember(roomId: string, userId: string, focusCell: number | null, now: number): Promise<void> {
    this.db.prepare('UPDATE room_members SET last_seen = ?, focus_cell = ? WHERE room_id = ? AND user_id = ?')
      .run(now, focusCell, roomId, userId);
  }
  /** Presence for everyone in a room, joined to their live play state. */
  async roomPresence(roomId: string): Promise<RoomMemberRow[]> {
    return this.db.prepare(`SELECT m.user_id, m.play_id, m.focus_cell, m.last_seen, u.display_name,
        p.moves, p.mistakes, p.hints, p.status, p.started_at, p.finished_at
      FROM room_members m
      JOIN users u ON u.id = m.user_id
      JOIN plays p ON p.id = m.play_id
      WHERE m.room_id = ? ORDER BY m.joined_at ASC`).all(roomId) as any;
  }

  /** Every daily this user has finished, by edition id — powers the archive grid. */
  async resultsByEdition(userId: string, editionIds: string[]): Promise<Map<string, ResultRow>> {
    if (!editionIds.length) return new Map();
    const marks = editionIds.map(() => '?').join(',');
    const rows = this.db.prepare(`SELECT * FROM results WHERE user_id = ? AND edition_id IN (${marks})`)
      .all(userId, ...editionIds) as unknown as ResultRow[];
    return new Map(rows.map((r) => [r.edition_id, r]));
  }

  async migrate(): Promise<void> { /* the constructor already ran the DDL */ }

  async close(): Promise<void> { this.db.close(); }
}
