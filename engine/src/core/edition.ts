import { generate, Puzzle } from './generate.js';
import { Theme } from '../themes/index.js';

/** Editions are pure functions of the calendar. No puzzle data is ever shipped or stored:
 *  every player gets the identical board for a day, which is what makes a shared
 *  leaderboard meaningful.
 *
 *  The seeds below are the public basis. For ranked boards dated SECRET_SEEDS_FROM or later
 *  the server replaces them with a keyed seed (net/server.ts), so the calendar alone no
 *  longer tells you tomorrow's board. The browser builds boards from these only for practice;
 *  elsewhere it reads just their ids and difficulty, for the week strip and the archive. */

export interface EditionRef {
  /** stable id, e.g. "d:2026-08-20" or "w:2026-W34:3" */
  id: string;
  kind: 'daily' | 'weekly' | 'free';
  themeId: string;
  /** 1 = Monday .. 7 = Sunday */
  difficulty: number;
  /** ISO date for dailies, week id for weekly members */
  date?: string;
  weekId?: string;
  /** 0-6 index within a weekly edition */
  dayIndex?: number;
  seed: string;
}

/** The clock the game runs on. A daily puzzle has to roll over at a time that means
 *  something to the people playing it, and UTC means the "new" board arrived at 8pm the
 *  evening before. Everything a player experiences as "today" is resolved in this zone;
 *  stored timestamps stay absolute. */
export const GAME_TZ = 'America/Toronto';

/** The civil date in a zone — what the calendar on the wall says at that instant.
 *  en-CA formats as YYYY-MM-DD, which is the shape every comparison in this codebase
 *  already assumes. DST is the platform's problem, which is the point of using Intl. */
export function civilDate(at: Date, tz: string = GAME_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at);
}

/** A civil date as a Date fixed at midday UTC. Noon is deliberate: every existing helper
 *  reads UTC parts, and midday is far enough from either boundary that no offset can
 *  push it into the wrong day. */
export function civilNoon(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/** "Today" for the game: the board a player in the game's timezone should be handed. */
export function gameToday(at: Date, tz: string = GAME_TZ): Date {
  return civilNoon(civilDate(at, tz));
}

/** Civil-day arithmetic. Doing this by subtracting 86,400,000ms from an instant looks
 *  equivalent and is not: on the two days a year the clocks move, that lands in the same
 *  civil day twice and skips its neighbour — which, for a streak, silently invents a day
 *  the player never played. Anchoring at noon UTC and stepping in UTC has no such seam. */
export function shiftDays(iso: string, days: number): string {
  return isoDate(new Date(civilNoon(iso).getTime() + days * 86400_000));
}

/** The `n` civil days ending at `iso`, most recent first. */
export function daysBack(iso: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(shiftDays(iso, -i));
  return out;
}

export function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** ISO-8601 week: weeks start Monday, week 1 contains the first Thursday. */
export function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: t.getUTCFullYear(), week };
}

export function weekId(d: Date): string {
  const { year, week } = isoWeek(d);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Monday = 1 ... Sunday = 7. Difficulty climbs across the week, as it should. */
export function weekdayDifficulty(d: Date): number {
  return d.getUTCDay() === 0 ? 7 : d.getUTCDay();
}

/** Which theme this week belongs to. Rotating the skin weekly is the cheapest possible
 *  way to make a daily game feel like it has seasons. */
export function themeForWeek(themeIds: string[], d: Date): string {
  const { year, week } = isoWeek(d);
  return themeIds[(year * 53 + week) % themeIds.length];
}

export function dailyEdition(themeIds: string[], date: Date, themeId?: string): EditionRef {
  const day = isoDate(date);
  const theme = themeId ?? themeForWeek(themeIds, date);
  const difficulty = weekdayDifficulty(date);
  return {
    id: `d:${day}:${theme}`,
    kind: 'daily', themeId: theme, difficulty, date: day,
    weekId: weekId(date),
    seed: `daily|${day}|${theme}`,
  };
}

/** A weekly edition is seven boards in one skin, Monday through Sunday. */
export function weeklyEdition(themeIds: string[], date: Date, themeId?: string): EditionRef[] {
  const wid = weekId(date);
  const theme = themeId ?? themeForWeek(themeIds, date);
  // Monday of this ISO week
  const t = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() - (day - 1));
  const out: EditionRef[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(t.getTime() + i * 86400000);
    out.push({
      id: `w:${wid}:${theme}:${i}`,
      kind: 'weekly', themeId: theme, difficulty: i + 1,
      date: isoDate(d), weekId: wid, dayIndex: i,
      seed: `weekly|${wid}|${theme}|${i}`,
    });
  }
  return out;
}

/** A past daily, replayed from the archive. Same seed as the day it ran, so the board and
 *  its leaderboard are the ones that actually happened. */
export function archiveEdition(themeIds: string[], date: Date, themeId?: string): EditionRef {
  const ref = dailyEdition(themeIds, date, themeId);
  return { ...ref, kind: 'daily' };
}

export function freeEdition(themeId: string, difficulty: number, seed: string): EditionRef {
  return { id: `f:${seed}`, kind: 'free', themeId, difficulty, seed };
}

export function buildPuzzle(ref: EditionRef, theme: Theme): Puzzle {
  return generate({ seed: ref.seed, difficulty: ref.difficulty, tagSchema: theme.tagSchema });
}
