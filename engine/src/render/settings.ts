import { Theme, Palette } from '../themes/index.js';

/** Player settings. Every one of these either removes a barrier (legibility, colour
 *  vision, motion) or removes a pressure (the timer, the leaderboard) — which is the
 *  bar a setting has to clear to earn a row in the panel. */

export type FontChoice = 'theme' | 'sans' | 'serif' | 'mono' | 'readable';
export type Appearance = 'theme' | 'dark' | 'light';
export type ColorMode = 'normal' | 'contrast' | 'colorblind';
export type Visibility = 'always' | 'onSolve' | 'never';
export type UsedClues = 'normal' | 'dim' | 'hide';
export type FlavourMode = 'normal' | 'dimmed' | 'hidden';
/** Whether the board tells you which square is currently decidable. Advertising it for
 *  free removes a real part of the puzzle — working out WHERE to look — so the default
 *  is to reveal it only when a hint is spent on it. */
export type SolvableMode = 'never' | 'onHint' | 'always';
export type HintMode = 'enabled' | 'confirm' | 'disabled';
export type Side = 'right' | 'left';

export interface Settings {
  font: FontChoice;
  /** which corner the resolved-state chip sits in */
  tagSide: Side;
  /** clear pencil marks on a tile as soon as it is resolved */
  autoClearPencil: boolean;
  /** what happens to a clue you have ticked off */
  usedClues: UsedClues;
  showFlavour: FlavourMode;
  showSolvable: SolvableMode;
  hintButton: HintMode;
  appearance: Appearance;
  colorMode: ColorMode;
  showTimer: Visibility;
  showLeaderboard: Visibility;
  tileArt: boolean;
  reduceMotion: boolean;
  /** restore every dimmed clue once the board is finished */
  undimAtEnd: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  font: 'theme',
  tagSide: 'right',
  autoClearPencil: true,
  usedClues: 'dim',
  showFlavour: 'normal',
  showSolvable: 'onHint',
  hintButton: 'enabled',
  appearance: 'theme',
  colorMode: 'normal',
  showTimer: 'onSolve',
  showLeaderboard: 'always',
  tileArt: true,
  reduceMotion: false,
  undimAtEnd: true,
};

const KEY = 'clues.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? sanitize({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) }) : { ...DEFAULT_SETTINGS };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(s: Settings): void {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** Never trust what came out of storage — an old build, a hand-edited value or a
 *  half-written record must not be able to produce an unreadable board. */
export function sanitize(s: Partial<Settings>): Settings {
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    (allowed as readonly unknown[]).includes(v) ? (v as T) : fallback;
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  return {
    font: pick(s.font, ['theme', 'sans', 'serif', 'mono', 'readable'] as const, 'theme'),
    tagSide: pick(s.tagSide, ['right', 'left'] as const, 'right'),
    autoClearPencil: bool(s.autoClearPencil, true),
    usedClues: pick(s.usedClues, ['normal', 'dim', 'hide'] as const, 'dim'),
    showFlavour: pick(s.showFlavour, ['normal', 'dimmed', 'hidden'] as const, 'normal'),
    showSolvable: pick(s.showSolvable, ['never', 'onHint', 'always'] as const, 'onHint'),
    hintButton: pick(s.hintButton, ['enabled', 'confirm', 'disabled'] as const, 'enabled'),
    appearance: pick(s.appearance, ['theme', 'dark', 'light'] as const, 'theme'),
    colorMode: pick(s.colorMode, ['normal', 'contrast', 'colorblind'] as const, 'normal'),
    showTimer: pick(s.showTimer, ['always', 'onSolve', 'never'] as const, 'onSolve'),
    showLeaderboard: pick(s.showLeaderboard, ['always', 'onSolve', 'never'] as const, 'always'),
    tileArt: bool(s.tileArt, true),
    reduceMotion: bool(s.reduceMotion, false),
    undimAtEnd: bool(s.undimAtEnd, true),
  };
}

/* ------------------------------------------------------------------ */

export const FONT_STACKS: Record<Exclude<FontChoice, 'theme'>, { display: string; body: string; mono: string }> = {
  sans: {
    display: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    body: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: 'ui-monospace, Menlo, monospace',
  },
  serif: {
    display: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
    body: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
    mono: 'ui-monospace, Menlo, monospace',
  },
  mono: {
    display: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    body: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    mono: 'ui-monospace, Menlo, monospace',
  },
  readable: {
    // wide apertures, unambiguous letterforms, generous spacing
    display: '"Atkinson Hyperlegible", Verdana, Tahoma, system-ui, sans-serif',
    body: '"Atkinson Hyperlegible", Verdana, Tahoma, system-ui, sans-serif',
    mono: '"Atkinson Hyperlegible Mono", ui-monospace, Menlo, monospace',
  },
};

/** Okabe-Ito: distinguishable under every common form of colour blindness. */
const CB_A = '#0072b2';
const CB_B = '#e69f00';

/** Appearance and colour mode are DERIVED from each theme rather than hand-authored
 *  per theme, so a new theme inherits every accessibility mode for free. Only the page
 *  chrome is recoloured — the tile stays as designed, because the artwork is what
 *  carries the theme's identity. */
export function resolvePalette(theme: Theme, s: Settings): Palette {
  let p: Palette = { ...theme.palette };

  const wantDark = s.appearance === 'theme' ? p.mood === 'dark' : s.appearance === 'dark';
  if (wantDark !== (p.mood === 'dark')) {
    p = wantDark ? toDarkChrome(p) : toLightChrome(p);
    p.mood = wantDark ? 'dark' : 'light';
  }

  if (s.colorMode === 'contrast') {
    // High contrast has to move the BACKGROUND too. Cold Open's cork board is a mid-tone,
    // and black ink on cork is only 5.8:1 — nowhere near what this mode promises.
    p.bg = wantDark ? '#000000' : '#ffffff';
    p.surface = wantDark ? '#0b0e12' : '#f6f7f9';
    p.surfaceAlt = wantDark ? '#141920' : '#eceef2';
    p.ink = wantDark ? '#ffffff' : '#000000';
    p.inkSoft = wantDark ? '#d2d6dd' : '#33383f';
    p.line = wantDark ? '#7d838d' : '#5a6069';
    p.tileInk = luminance(p.tile) > 0.45 ? '#000000' : '#ffffff';
    p.tileLine = luminance(p.tile) > 0.45 ? '#000000' : '#ffffff';
    p.stateA = wantDark ? '#57e08a' : '#0a6b2e';
    p.stateB = wantDark ? '#ff8a7e' : '#a1121a';
    p.accent = wantDark ? '#ffd166' : '#8a4b00';
  } else if (s.colorMode === 'colorblind') {
    p.stateA = CB_A;
    p.stateB = CB_B;
    p.accent = wantDark ? '#56b4e9' : '#0072b2';
  }

  // Last line of defence. Whatever a theme author does above, text stays readable —
  // secondary text is walked back toward the primary ink until it clears 3:1 rather than
  // being nudged once and hoped over.
  if (contrast(p.ink, p.bg) < 4.5) p.ink = luminance(p.bg) > 0.45 ? '#111418' : '#f4f6f8';
  p.inkSoft = ensure(p.inkSoft, p.ink, p.bg, 3);
  if (contrast(p.tileInk, p.tile) < 4.5) p.tileInk = luminance(p.tile) > 0.45 ? '#14171b' : '#f2f4f6';
  if (contrast(p.ink, p.surface) < 4.5) p.surface = luminance(p.ink) > 0.45 ? mix(p.surface, '#000000', 0.55) : mix(p.surface, '#ffffff', 0.55);
  return p;
}

/** Walk `soft` back toward `strong` until it clears `target` against `bg`. */
function ensure(soft: string, strong: string, bg: string, target: number): string {
  if (contrast(soft, bg) >= target) return soft;
  for (let t = 0.35; t >= 0; t -= 0.05) {
    const c = mix(strong, bg, t);
    if (contrast(c, bg) >= target) return c;
  }
  return strong;
}

function toDarkChrome(p: Palette): Palette {
  const tint = p.accent;
  return {
    ...p,
    bg: mix('#0c0f14', tint, 0.06),
    surface: mix('#141922', tint, 0.06),
    surfaceAlt: mix('#1b212c', tint, 0.06),
    ink: '#eef1f5',
    inkSoft: mix('#eef1f5', '#141922', 0.42),
    line: mix('#2b323d', tint, 0.1),
  };
}

function toLightChrome(p: Palette): Palette {
  const tint = p.accent;
  return {
    ...p,
    bg: mix('#f4f2ed', tint, 0.07),
    surface: mix('#fbfaf7', tint, 0.04),
    surfaceAlt: mix('#efece5', tint, 0.06),
    ink: '#191c21',
    inkSoft: mix('#191c21', '#fbfaf7', 0.42),
    line: mix('#cfcabf', tint, 0.12),
  };
}

export function fontsFor(theme: Theme, s: Settings) {
  return s.font === 'theme' ? theme.fonts : FONT_STACKS[s.font];
}

/** Everything the page needs, as CSS custom properties. */
export function cssVars(theme: Theme, s: Settings): Record<string, string> {
  const p = resolvePalette(theme, s);
  const f = fontsFor(theme, s);
  return {
    '--bg': p.bg, '--surface': p.surface, '--surface-alt': p.surfaceAlt,
    '--ink': p.ink, '--ink-soft': p.inkSoft, '--line': p.line,
    '--accent': p.accent, '--state-a': p.stateA, '--state-b': p.stateB,
    '--glow': p.glow ?? 'transparent',
    '--tile': p.tile, '--tile-ink': p.tileInk, '--tile-line': p.tileLine,
    '--font-display': f.display, '--font-body': f.body, '--font-mono': f.mono,
    '--font-scale': s.font === 'readable' ? '1.08' : '1',
    '--motion': s.reduceMotion ? '0s' : '.15s',
    '--tag-left': s.tagSide === 'left' ? '6px' : 'auto',
    '--tag-right': s.tagSide === 'left' ? 'auto' : '6px',
  };
}

/* ---------------------- colour maths ---------------------- */

export function parseHex(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}
const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseHex(a), [r2, g2, b2] = parseHex(b);
  return toHex([r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t]);
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
