/** Streaks, computed from the bare list of days a player finished.
 *
 *  Kept as a pure function over dates rather than a SQL window, because the rule — what
 *  counts as still-alive, what breaks it — is a product decision that will change, and
 *  a decision that will change should live somewhere you can read it. */
import { shiftDays } from './edition.js';

export interface StreakStats {
  /** consecutive days ending today, or ending yesterday if today is still unplayed */
  current: number;
  /** the longest run the player has ever put together */
  best: number;
  playedToday: boolean;
  /** true when today is unplayed but yesterday was: the streak is alive and at risk */
  atRisk: boolean;
}

export function streakStats(playedIso: Iterable<string>, todayIso: string): StreakStats {
  const done = new Set(playedIso);
  const playedToday = done.has(todayIso);
  // A day is not lost until it is over. Counting from yesterday when today is unplayed is
  // what makes the number people carry around ("I'm on 40") survive until midnight.
  const anchor = playedToday ? todayIso : shiftDays(todayIso, -1);
  let current = 0;
  for (let d = anchor; done.has(d); d = shiftDays(d, -1)) current++;

  let best = 0;
  const sorted = [...done].sort();
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && sorted[i] === shiftDays(sorted[i - 1], 1) ? run + 1 : 1;
    if (run > best) best = run;
  }
  return { current, best, playedToday, atRisk: !playedToday && current > 0 };
}
