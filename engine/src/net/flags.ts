import { themeIds } from '../themes/index.js';

/** What an operator can turn on and off without a deploy.
 *
 *  These are enforced on the SERVER, not just hidden in the client. A flag that only
 *  greys out a button is decoration: anyone can still call the API. Every one of these
 *  is checked where the work actually happens. */
export interface Flags {
  /** theme ids a player may start. Never empty — an empty list is an outage, not a config */
  themes: string[];
  archive: boolean;
  weekly: boolean;
  free: boolean;
  rooms: boolean;
  /** new accounts. Existing players can always still sign in */
  signups: boolean;
  /** shown to every player, in every language, verbatim. '' = nothing shown */
  notice: string;
}

export const FLAGS_KEY = 'flags';
export const NOTICE_MAX = 240;

export function defaultFlags(): Flags {
  return { themes: themeIds(), archive: true, weekly: true, free: true, rooms: true, signups: true, notice: '' };
}

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Anything stored or posted goes through here. Two jobs: never trust the input, and
 *  never let a saved config outlive the code — a theme deleted in a deploy has to drop
 *  out of the enabled list rather than 400 every player who picks it. */
export function sanitizeFlags(input: unknown): Flags {
  const d = defaultFlags();
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const known = new Set(themeIds());

  let themes = Array.isArray(o.themes)
    ? o.themes.filter((t): t is string => typeof t === 'string' && known.has(t))
    : d.themes;
  themes = [...new Set(themes)];
  // Locking every theme would take the game off the air with no way back except a
  // database edit, so the last one cannot be turned off.
  if (themes.length === 0) themes = d.themes;

  const notice = typeof o.notice === 'string' ? o.notice.slice(0, NOTICE_MAX).trim() : '';

  return {
    themes: themeIds().filter((t) => themes.includes(t)),   // keep the registry's order
    archive: bool(o.archive, d.archive),
    weekly: bool(o.weekly, d.weekly),
    free: bool(o.free, d.free),
    rooms: bool(o.rooms, d.rooms),
    signups: bool(o.signups, d.signups),
    notice,
  };
}
