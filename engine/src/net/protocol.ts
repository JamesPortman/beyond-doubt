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
export interface TodayResult { editions: EditionInfo[]; weekId: string; serverNow: number; }

export interface ApiErrorBody { error: string; detail?: string; }
