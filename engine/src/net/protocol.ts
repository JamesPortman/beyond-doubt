import { PlacedClue, PuzzleView } from '../core/generate.js';
import { State } from '../core/clue.js';
import { LeaderboardEntry, WeeklyStanding } from '../core/leaderboard.js';
import { MoveOutcome, Hint } from '../core/session.js';

/** The wire format. Note what a client can ask for: a MODE, not a seed. The server
 *  derives the edition from its own clock, so nobody can request tomorrow's board,
 *  yesterday's easy board, or a hand-picked seed. */

export interface AuthRequestBody { email: string; }
export interface AuthRequestResult { sent: true; /** dev only */ devCode?: string; }
export interface AuthVerifyBody { email: string; code: string; displayName?: string; }
export interface AuthVerifyResult { token: string; user: PublicUser; }
export interface PublicUser { id: string; displayName: string; email: string; }

export type PlayMode = 'daily' | 'weekly' | 'free' | 'archive';

export interface StartBody {
  mode: PlayMode;
  themeId: string;
  /** archive only: the ISO date of the daily you want to replay */
  date?: string;
  /** weekly only: 0 = Monday .. 6 = Sunday, and never past today */
  dayIndex?: number;
  players?: number;
}

export interface EditionInfo {
  id: string;
  kind: PlayMode;
  themeId: string;
  difficulty: number;
  date?: string;
  weekId?: string;
  dayIndex?: number;
  /** false for free play — practice boards never touch the leaderboard */
  ranked: boolean;
}

export interface StartResult {
  playId: string;
  edition: EditionInfo;
  view: PuzzleView;
  serverNow: number;
  hintBudget: number;
  /** set when this user already has a ranked result for this edition */
  previousResult: RunResult | null;
  /** free play only — a shareable seed. Never sent for ranked boards, because the seed
   *  regenerates the solution and a ranked board must stay unforgeable. */
  shareSeed?: string;
  /** Set when this is a ranked attempt already under way. A ranked board is ranked on the
   *  FIRST play started, so starting it again resumes that play — its moves, mistakes,
   *  hints and clock — rather than dealing a clean one. `view.clues` already carries every
   *  clue those moves unlocked; the client replays `moves` onto its own session. */
  resume?: ResumeState;
}

export interface ResumeState {
  moves: { c: number; s: State }[];
  mistakes: number;
  hintsUsed: number;
  /** server time since the play started — the clock did not stop while you were away */
  elapsedMs: number;
}

export interface MoveBody { playId: string; cell: number; state: State; }
export interface MoveAck {
  outcome: MoveOutcome;
  unlocked: PlacedClue[];
  solved: boolean;
  revealed: number;
  mistakes: number;
  hintsUsed: number;
  elapsedMs: number;
  result?: RunResult;
}

export interface HintBody { playId: string; }
export interface HintResult { hint: Hint; hintsUsed: number; remaining: number; }

export interface RunResult {
  editionId: string;
  timeMs: number;
  /** milliseconds added by mistakes — shown to the player so the cost is visible */
  timeAddedMs: number;
  hintsUsed: number;
  mistakes: number;
  score: number;
  perfect: boolean;
  ranked: boolean;
  /** where this run placed on the edition board, 1-based; null if unranked */
  rank: number | null;
  streak: number;
  /** the longest run this player has ever assembled, so a broken streak still shows
   *  what it was worth */
  bestStreak?: number;
  /** Rounded percentile band by adjusted time — 1, 5, 10, 25 or 50 — or null when the
   *  edition has too few finishers for the number to mean anything. */
  percentile?: number | null;
  /** what share of finishers solved this edition with no mistakes and no hints */
  perfectRate?: number | null;
}

/* ------------------------------- rooms ------------------------------- */

export interface RoomJoinBody {
  /** omit to create a new room */
  code?: string;
  mode?: PlayMode;
  themeId?: string;
  dayIndex?: number;
}

export interface RoomPlayer {
  userId: string;
  displayName: string;
  /** tiles resolved out of the total */
  revealed: number;
  total: number;
  mistakes: number;
  hintsUsed: number;
  /** the tile they are looking at right now, or null */
  focusCell: number | null;
  finished: boolean;
  elapsedMs: number;
  /** seconds since their last heartbeat — the client greys out stale players */
  idleSeconds: number;
  you: boolean;
}

export interface RoomJoinResult {
  roomId: string;
  code: string;
  playId: string;
  edition: EditionInfo;
  view: PuzzleView;
  serverNow: number;
  hintBudget: number;
  players: RoomPlayer[];
  /** as StartResult.resume: joining a room mid-way through your ranked attempt continues it */
  resume?: ResumeState;
}

export interface RoomHeartbeatBody {
  roomId: string;
  /** the tile this player currently has selected or hovered */
  focusCell?: number | null;
}

export interface RoomHeartbeatResult {
  players: RoomPlayer[];
  serverNow: number;
}

/* ------------------------------ archive ------------------------------ */

export interface ArchiveBody {
  themeId: string;
  /** ISO date of the last day to include; defaults to today */
  before?: string;
  /** how many days back, max 92 */
  days?: number;
}

export interface ArchiveDay {
  date: string;
  editionId: string;
  themeId: string;
  difficulty: number;
  weekday: number;
  /** the player's own result, if they have one */
  played: boolean;
  score: number | null;
  timeMs: number | null;
  perfect: boolean;
  late: boolean;
}

export interface ArchiveResult {
  themeId: string;
  from: string;
  to: string;
  today: string;
  /** the first day this game existed — nothing before it is playable */
  launch: string;
  days: ArchiveDay[];
  /** how many of the listed days this player has finished */
  completed: number;
}

export interface BoardResult { entries: LeaderboardEntry[]; you: LeaderboardEntry | null; }
export interface WeekResult { standings: WeeklyStanding[]; weekId: string; }
/** What a player is told about the operator's switches. No `signups`: whether the doors
 *  are open to new accounts is the operator's business, and the sign-in flow says so at
 *  the point it matters. */
export interface PublicFlags {
  themes: string[];
  archive: boolean;
  weekly: boolean;
  free: boolean;
  rooms: boolean;
  notice: string;
}

export interface FlagsResult { flags: PublicFlags; }
export interface AdminFlagsResult {
  flags: import('./flags.js').Flags;
  allThemes: string[];
  updatedAt: number | null;
}

export interface TodayResult {
  editions: EditionInfo[];
  weekId: string;
  serverNow: number;
  flags: PublicFlags;
}

export interface MeResult {
  user: PublicUser;
  streak: number;
  bestStreak: number;
  playedToday: boolean;
  /** today is unplayed and a live streak is riding on it */
  atRisk: boolean;
  daysPlayed: number;
}

export interface ExportResult {
  exportedAt: number;
  account: { id: string; email: string; displayName: string; createdAt: number };
  plays: Record<string, unknown>[];
  results: Record<string, unknown>[];
}

export interface DeleteResult { deleted: true; removed: Record<string, number>; }

/** Just the code. Unexpected errors are logged server-side and never described to the caller. */
export interface ApiErrorBody { error: string; }
