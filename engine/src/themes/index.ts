import { LocaleCode, ThemeLocale, LabelSpec, Locale, RenderContext } from '../i18n/index.js';
import { Clue } from '../core/clue.js';
import { PuzzleView } from '../core/generate.js';
import { Rng, makeRng } from '../core/rng.js';
import { dealFor } from '../render/deal.js';

export interface Palette {
  mood: 'light' | 'dark';
  /** page + panel chrome */
  bg: string; surface: string; surfaceAlt: string;
  ink: string; inkSoft: string; line: string;
  /** the tile object itself — often a different material from the page
   *  (a dark painting on a pale gallery wall, a pale headshot on a black board) */
  tile: string; tileInk: string; tileLine: string;
  accent: string; stateA: string; stateB: string;
  glow?: string;
}

export interface Fonts { display: string; body: string; mono: string; }

export type LabelMode = 'name' | 'coord' | 'numbered' | 'title' | 'artwork';
export type ArtKind = 'portrait' | 'tree' | 'painting' | 'dossier' | 'starfield' | 'frame';

export interface ThemeImages {
  /** how many files the set contains */
  count: number;
  /** file for image n (0-based), e.g. n => `/assets/wall/${String(n + 1).padStart(2, '0')}.webp` */
  src: (n: number) => string;
  /** optional per-image credit line, shown in Inspect */
  credit?: (n: number) => string;
  /** how the marked state is shown over a photograph, since it cannot be redrawn */
  mark: 'cross' | 'fade' | 'crack' | 'stamp' | 'ring' | 'dot';
  /** the work's real title, for themes that label tiles with what the picture is */
  title?: (n: number) => string;
  /** true when the set is a fixed cast that may repeat across boards */
  fixedCast?: boolean;
}

export interface Theme {
  id: string;
  labelMode: LabelMode;
  /** relational attributes this theme exposes to the clue generator */
  tagSchema: Record<string, string[]>;
  palette: Palette;
  fonts: Fonts;
  /** which procedural illustration this theme's tiles use */
  artKind: ArtKind;
  /** Real artwork for this theme's tiles. When present it replaces the drawing entirely
   *  and the procedural version becomes the fallback for anything the set does not cover. */
  images?: ThemeImages;
  /** portraits only: render as a high-contrast photocopy rather than in colour */
  artMono?: boolean;
  /** extra class hook for skin CSS */
  skinClass: string;
  strings: Record<LocaleCode, ThemeLocale & { labelPrefix?: string }>;
}

const registry = new Map<string, Theme>();
export function registerTheme(t: Theme): void { registry.set(t.id, t); }
export function getTheme(id: string): Theme {
  const t = registry.get(id);
  if (!t) throw new Error(`unknown theme: ${id}`);
  return t;
}
export function themeIds(): string[] { return [...registry.keys()]; }
export function allThemes(): Theme[] { return [...registry.values()]; }

const COLS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Tile labels are per-theme AND per-language: the callboard needs Brazilian names in pt,
 *  Cold Open needs Spanish scene titles in es, and the orchard just needs coordinates. */
export function resolveLabels(theme: Theme, locale: LocaleCode, puzzle: PuzzleView): LabelSpec[] {
  const s = theme.strings[locale];
  const tileG = s.tile.g;
  const out: LabelSpec[] = [];
  switch (theme.labelMode) {
    case 'coord':
      for (let i = 0; i < puzzle.n; i++) {
        const x = i % puzzle.w, y = Math.floor(i / puzzle.w);
        out.push({ text: `${COLS[x]}${y + 1}`, g: tileG });
      }
      return out;
    case 'numbered':
      for (let i = 0; i < puzzle.n; i++) {
        out.push({ text: `${s.labelPrefix ?? ''}${s.labelPrefix ? ' ' : ''}${i + 1}`, g: tileG });
      }
      return out;
    // The picture on the tile has a name of its own. Take it from the same deal the
    // art layer used, so the label under a painting is that painting's title.
    case 'artwork': {
      const set = theme.images;
      if (!set?.title) return resolveLabels({ ...theme, labelMode: 'numbered' }, locale, puzzle);
      const order = dealFor(puzzle.labelSeed, set.count);
      for (let i = 0; i < puzzle.n; i++) {
        out.push({ text: set.title(order[i % set.count]), g: tileG });
      }
      return out;
    }
    case 'name':
    case 'title': {
      // deterministic per (puzzle, locale) so two players on the same board see the same names
      const rng: Rng = makeRng(`${puzzle.labelSeed}|${locale}`);
      const pool = rng.shuffle(s.labels);
      for (let i = 0; i < puzzle.n; i++) out.push(pool[i % pool.length]);
      return out;
    }
  }
}

export function renderContext(theme: Theme, locale: LocaleCode, puzzle: PuzzleView): RenderContext {
  return { theme: theme.strings[locale], labels: resolveLabels(theme, locale, puzzle), w: puzzle.w, h: puzzle.h };
}

/** Applies the theme's voice on top of the neutral sentence the locale produced. */
export function renderClue(loc: Locale, theme: Theme, ctx: RenderContext, clue: Clue, index = 0): string {
  const base = loc.clue(clue, ctx);
  const f = theme.strings[loc.code].flourishes;
  if (!f || f.length === 0) return base;
  return f[index % f.length].replace('{s}', base);
}

/** Human-readable tag value, for tile chrome ("Wardrobe", "Ato II"). */
export function tagLabel(theme: Theme, locale: LocaleCode, key: string, value: string): string {
  return theme.strings[locale].tags[key]?.values[value]?.s ?? value;
}
