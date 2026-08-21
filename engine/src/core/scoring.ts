/** Scoring exists so a leaderboard can rank people who all reached the same correct
 *  answer. Time dominates, hints and mistakes are flat deductions, and difficulty
 *  multiplies — so a clean Sunday outranks a fast Monday. */

export const PAR_SECONDS = [0, 90, 120, 165, 225, 300, 390, 480];

export interface ScoreInput {
  difficulty: number;
  elapsedMs: number;
  hintsUsed: number;
  mistakes: number;
}

export interface ScoreResult {
  score: number;
  base: number;
  hintPenalty: number;
  /** milliseconds added to the clock by mistakes */
  timeAddedMs: number;
  /** the clock the score was actually computed from */
  effectiveMs: number;
  multiplier: number;
  perfect: boolean;
  underPar: boolean;
}

/** A wrong flip costs you a minute. This reads better than an abstract points deduction:
 *  it is the same currency as everything else on the board, it shows up in the time you
 *  compare with other players, and it scales — a minute matters more on a fast Monday
 *  than on a long Sunday, which is exactly right. */
export const MISTAKE_PENALTY_MS = 60_000;

export function scoreRun(input: ScoreInput): ScoreResult {
  const d = Math.min(7, Math.max(1, Math.round(input.difficulty)));
  const par = PAR_SECONDS[d];
  const timeAddedMs = input.mistakes * MISTAKE_PENALTY_MS;
  const effectiveMs = input.elapsedMs + timeAddedMs;
  const t = Math.max(1, effectiveMs / 1000);
  // capped so an impossibly fast solve cannot run away with the board
  const ratio = Math.min(2.5, par / Math.max(t, par * 0.4));
  const base = Math.round(1000 * ratio);
  const multiplier = 1 + (d - 1) * 0.15;
  const hintPenalty = input.hintsUsed * 60;
  const score = Math.max(0, Math.round(base * multiplier) - hintPenalty);
  return {
    score, base, hintPenalty, timeAddedMs, effectiveMs, multiplier,
    perfect: input.hintsUsed === 0 && input.mistakes === 0,
    underPar: t <= par,
  };
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
