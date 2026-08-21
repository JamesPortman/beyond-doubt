import { EditionRef } from './edition.js';
import { ScoreResult } from './scoring.js';

export interface LeaderboardEntry {
  editionId: string;
  weekId?: string;
  themeId: string;
  playerId: string;
  displayName: string;
  locale: string;
  timeMs: number;
  hintsUsed: number;
  mistakes: number;
  score: number;
  perfect: boolean;
  /** epoch ms */
  submittedAt: number;
}

export interface WeeklyStanding {
  playerId: string;
  displayName: string;
  daysCompleted: number;
  totalScore: number;
  totalTimeMs: number;
  perfectDays: number;
}

export interface LeaderboardStore {
  submit(entry: LeaderboardEntry): Promise<LeaderboardEntry>;
  top(editionId: string, limit?: number): Promise<LeaderboardEntry[]>;
  weekly(weekId: string, limit?: number): Promise<WeeklyStanding[]>;
  best(editionId: string, playerId: string): Promise<LeaderboardEntry | null>;
  streak(playerId: string, isoDates: string[]): Promise<number>;
}

/** Keeps only each player's best run per edition, so a leaderboard cannot be farmed
 *  by replaying the same board. */
export class MemoryLeaderboard implements LeaderboardStore {
  protected rows: LeaderboardEntry[] = [];

  async submit(entry: LeaderboardEntry): Promise<LeaderboardEntry> {
    const i = this.rows.findIndex((r) => r.editionId === entry.editionId && r.playerId === entry.playerId);
    if (i === -1) this.rows.push(entry);
    else if (entry.score > this.rows[i].score) this.rows[i] = entry;
    this.persist();
    return entry;
  }

  async top(editionId: string, limit = 25): Promise<LeaderboardEntry[]> {
    return this.rows
      .filter((r) => r.editionId === editionId)
      .sort((a, b) => b.score - a.score || a.timeMs - b.timeMs || a.submittedAt - b.submittedAt)
      .slice(0, limit);
  }

  async weekly(wid: string, limit = 25): Promise<WeeklyStanding[]> {
    const byPlayer = new Map<string, WeeklyStanding>();
    for (const r of this.rows) {
      if (r.weekId !== wid) continue;
      const s = byPlayer.get(r.playerId) ?? {
        playerId: r.playerId, displayName: r.displayName,
        daysCompleted: 0, totalScore: 0, totalTimeMs: 0, perfectDays: 0,
      };
      s.daysCompleted++;
      s.totalScore += r.score;
      s.totalTimeMs += r.timeMs;
      if (r.perfect) s.perfectDays++;
      s.displayName = r.displayName;
      byPlayer.set(r.playerId, s);
    }
    // finishing more days always beats a high score on fewer days
    return [...byPlayer.values()]
      .sort((a, b) => b.daysCompleted - a.daysCompleted || b.totalScore - a.totalScore || a.totalTimeMs - b.totalTimeMs)
      .slice(0, limit);
  }

  async best(editionId: string, playerId: string): Promise<LeaderboardEntry | null> {
    return this.rows.find((r) => r.editionId === editionId && r.playerId === playerId) ?? null;
  }

  /** Consecutive completed days, counting back from the most recent date given. */
  async streak(playerId: string, isoDates: string[]): Promise<number> {
    const done = new Set(this.rows.filter((r) => r.playerId === playerId).map((r) => r.editionId));
    let n = 0;
    for (const d of isoDates) {
      const hit = [...done].some((id) => id.startsWith(`d:${d}:`));
      if (!hit) break;
      n++;
    }
    return n;
  }

  all(): LeaderboardEntry[] { return this.rows.slice(); }
  load(rows: LeaderboardEntry[]): void { this.rows = rows.slice(); }
  protected persist(): void { /* memory store: nothing to do */ }
}

/** Browser-local board. Storage can be unavailable or wiped, so every access is guarded
 *  and failure degrades to an in-memory board rather than breaking play. */
export class LocalLeaderboard extends MemoryLeaderboard {
  constructor(private key = 'clues.leaderboard.v2') {
    super();
    try {
      const raw = globalThis.localStorage?.getItem(key);
      if (raw) this.load(JSON.parse(raw));
    } catch { /* start empty */ }
  }
  protected persist(): void {
    try { globalThis.localStorage?.setItem(this.key, JSON.stringify(this.all())); } catch { /* ignore */ }
  }
}

export function entryFrom(
  ref: EditionRef, playerId: string, displayName: string, locale: string,
  timeMs: number, hintsUsed: number, mistakes: number, s: ScoreResult, now = Date.now(),
): LeaderboardEntry {
  return {
    editionId: ref.id, weekId: ref.weekId, themeId: ref.themeId,
    playerId, displayName, locale,
    timeMs, hintsUsed, mistakes, score: s.score, perfect: s.perfect, submittedAt: now,
  };
}
