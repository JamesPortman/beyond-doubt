import { generate, Puzzle } from './generate.js';
import { Theme } from '../themes/index.js';

/** Editions are pure functions of the calendar. No puzzle data is ever shipped or stored:
 *  two players on opposite sides of the world derive the identical board from the date,
 *  which is what makes a shared leaderboard meaningful. */

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
