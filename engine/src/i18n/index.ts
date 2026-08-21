/** Localisation is not string substitution here. Portuguese and Spanish force adjective
 *  agreement with the gender and number of whatever the clue is talking about, and that
 *  gender comes from the THEME ("a árvore" is feminine, "o quadro" is masculine), not from
 *  the engine. So themes declare gendered nouns and full predicate forms, and clue rendering
 *  composes them. Nothing anywhere concatenates an adjective onto an unknown noun. */

export type LocaleCode = 'en' | 'pt' | 'es';
export type Gender = 'm' | 'f';

/** A noun with the forms a Romance language needs. */
export interface Noun {
  s: string;
  p: string;
  g: Gender;
}
export const noun = (s: string, p: string, g: Gender = 'm'): Noun => ({ s, p, g });

/** A complete third-person predicate for a state, in all four agreement slots.
 *  Themes write these out longhand on purpose: it lets each theme pick its own copula
 *  (pt "está doente" vs "é culpado") instead of the engine guessing. */
export interface Predicate {
  sm: string; sf: string; pm: string; pf: string;
}
export const pred = (sm: string, sf: string, pm: string, pf: string): Predicate => ({ sm, sf, pm, pf });
/** Invariant predicate — same in all four slots (all of English, and words like "inocente"). */
export const predInv = (s: string, p: string): Predicate => ({ sm: s, sf: s, pm: p, pf: p });

export function agree(p: Predicate, g: Gender, plural: boolean): string {
  return plural ? (g === 'f' ? p.pf : p.pm) : (g === 'f' ? p.sf : p.sm);
}

export interface StateStrings {
  /** short label for chips, buttons, results */
  name: string;
  /** the group as a noun: "guilty people" / "os culpados" / "los culpables" */
  collective: Noun;
  /** attributive adjective, all four agreement slots: "doente/doente/doentes/doentes" */
  adj: Predicate;
  /** full copular predicate, all four slots: "está doente" / "estão doentes" */
  pred: Predicate;
}

/** A tile's display label. Person names carry grammatical gender because
 *  "Nadia e culpada" and "Owen e culpado" are different words. */
export interface LabelSpec {
  text: string;
  g: Gender;
}

export interface ThemeLocale {
  title: string;
  tagline: string;
  /** what one tile is called */
  tile: Noun;
  states: { a: StateStrings; b: StateStrings };
  tags: Record<string, { label: Noun; values: Record<string, Noun> }>;
  /** proper names / titles used on tiles, in this language */
  labels: LabelSpec[];
  /** optional voice prefixes applied deterministically, e.g. "Pursuant to §4.2," */
  flourishes?: string[];
}

/** A localized noun phrase for a selector, carrying what agreement needs. */
export interface Phrase {
  /** e.g. "In row 3" — sentence-initial, already capitalised */
  lead: string;
  /** e.g. "row 3" — usable mid-sentence */
  bare: string;
  /** gender that adjectives about members of this set must agree with */
  g: Gender;
  /** if true, render "N of them" instead of repeating the tile noun */
  pronominal: boolean;
}

export interface RenderContext {
  theme: ThemeLocale;
  /** display label per cell, already localized */
  labels: LabelSpec[];
  w: number;
  h: number;
}

/** Terms a clue can lean on. Inspect exists because "all", "both", "most", "between"
 *  and "connected" have exact meanings here that everyday usage does not carry — and a
 *  no-guess puzzle is only fair if the player can look them up mid-board. */
export type TermId =
  | 'neighbours' | 'ortho' | 'row' | 'col' | 'corners' | 'edges' | 'interior'
  | 'between' | 'connected' | 'exactly' | 'atLeast' | 'atMost' | 'none' | 'every'
  | 'most' | 'ifThen' | 'exactlyOne' | 'sameSide' | 'oppositeSides' | 'steps' | 'group'
  | 'truth';

export interface Term { term: string; def: string; }

export interface SettingsStrings {
  title: string; done: string; reset: string;
  game: string; language: string;
  font: string; fontTheme: string; fontSans: string; fontSerif: string; fontMono: string; fontReadable: string;
  tagSide: string; left: string; right: string;
  autoClearPencil: string;
  usedClues: string; normal: string; dim: string; hide: string;
  hintButton: string; enabled: string; confirm: string; disabled: string;
  appearance: string; followTheme: string; dark: string; light: string;
  colorMode: string; highContrast: string; colorblind: string;
  showTimer: string; showLeaderboard: string; always: string; onSolve: string; never: string;
  tileArt: string; reduceMotion: string; undimAtEnd: string; on: string; off: string;
}

export interface ActionStrings {
  clearTags: string; inspect: string; showHint: string; settings: string;
  playTutorial: string; shareScenario: string; noTags: string; linkCopied: string;
  shareBody: string;
}

export interface TutorialStrings {
  title: string; next: string; skip: string; done: string;
  steps: string[];
}

export interface ArchiveStrings {
  title: string; subtitle: string; played: string; open: string; back: string;
  completed: string; of: string; today: string; locked: string; loading: string;
}

export interface RoomStrings {
  title: string; create: string; join: string; code: string; codeHint: string;
  players: string; you: string; finished: string; idle: string; copyInvite: string;
  looking: string; leave: string;
}

export interface InspectStrings {
  title: string;
  help: string;
  meaning: string;
  terms: string;
  covers: string;
  mentions: string;
  nothing: string;
  whole: string;
  close: string;
}

export interface Locale {
  code: LocaleCode;
  /** BCP-47 tag for Intl */
  bcp47: string;
  dir: 'ltr';
  /** number word with gender agreement where the language needs it (pt "uma", es "una") */
  num(n: number, g: Gender): string;
  /** "A".."D" column naming, localized if needed */
  colName(c: number): string;
  clue(clue: import('../core/clue.js').Clue, ctx: RenderContext): string;
  /** plain-language meaning of the clue, for Inspect — what it says, not how it reads */
  explain(clue: import('../core/clue.js').Clue, ctx: RenderContext): string;
  glossary: Record<TermId, Term>;
  ui: UiStrings;
}

export interface UiStrings {
  play: string; solo: string; daily: string; weekly: string; leaderboard: string;
  hint: string; hintClue: string; hintCell: string; noHints: string;
  solved: string; timeLabel: string; scoreLabel: string; streak: string;
  illegalMove: string; notDeducible: string; share: string; copied: string;
  markAs: string; clues: string; openingClues: string; unlockedBy: string;
  difficulty: string; days: [string, string, string, string, string, string, string];
  edition: string; rank: string; player: string; you: string; hintsUsed: string;
  mistakes: string; noEntries: string; thisWeek: string; allTime: string;
  theme: string; language: string; newGame: string; restart: string;
  splitClues: string; yourClues: string; playerN: string;
  perfect: string; solvedIn: string; weeklyTotal: string; complete: string;
  timePenalty: string;
  mistakeCost: string; adjustedTime: string;
  settings: SettingsStrings;
  inspect: InspectStrings;
  actions: ActionStrings;
  tutorial: TutorialStrings;
  room: RoomStrings;
  archive: ArchiveStrings;
}

const registry = new Map<LocaleCode, Locale>();
export function registerLocale(l: Locale): void { registry.set(l.code, l); }
export function getLocale(code: LocaleCode): Locale {
  const l = registry.get(code);
  if (!l) throw new Error(`locale not registered: ${code}`);
  return l;
}
export function locales(): LocaleCode[] { return [...registry.keys()]; }

export function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
