import { Grid, makeGrid, popcount, bits, isConnected } from './grid.js';
import { A, B, Clue, ClueContext, Selector, State, TagMasks, compile, CompiledClue, compileAll } from './clue.js';
import { enumerateModels, filterModels, forcedFrom } from './solver.js';
import { Rng, makeRng, hashSeed } from './rng.js';

export interface PlacedClue {
  id: string;
  clue: Clue;
  /** cell whose reveal unlocks this clue; null = visible from the start */
  gate: number | null;
  /** index in the intended solve order — used for hint ordering */
  order: number;
}

/** What a CLIENT is allowed to know. Notably absent: the solution, the seed that would
 *  let it regenerate the solution, and any clue it has not yet unlocked. Everything the
 *  board needs to render and to deduce legal moves is here and nothing else is. */
export interface PuzzleView {
  w: number;
  h: number;
  n: number;
  /** tag values per cell — visible on the tiles anyway */
  tags: Record<string, string>[];
  /** seeds only the shuffling of display names; reveals nothing about the solution */
  labelSeed: string;
  /** clues currently in play. Online, the server adds to this as cells are revealed. */
  clues: PlacedClue[];
  difficulty: number;
  /** present only in offline/solo play */
  solution?: number;
}

export interface Puzzle extends PuzzleView {
  seed: string;
  w: number;
  h: number;
  n: number;
  /** bitmask: set bit === cell is in state B */
  solution: number;
  labelSeed: string;
  /** tag values per cell, e.g. {role:'wardrobe'} — the theme layer turns these into names */
  tags: Record<string, string>[];
  clues: PlacedClue[];
  /** the forced solve order the generator proved exists */
  path: number[];
  difficulty: number;
  /** how many clues are visible before the first flip */
  openingClues: number;
}

export interface GenerateOptions {
  seed: string;
  w?: number;
  h?: number;
  /** 1..7 — Monday through Sunday */
  difficulty?: number;
  /** tag schema the theme wants available for relational clues */
  tagSchema?: Record<string, string[]>;
  maxAttempts?: number;
}

const KEY = (c: Clue) => JSON.stringify(c);

interface DifficultyProfile {
  w: number; h: number;
  bRatio: [number, number];
  /** prefer clues that unlock this many cells at once */
  unlockPreference: 'many' | 'few';
  /** how many extra opening clues beyond the total count */
  extraOpening: number;
  /** allow the harder clue shapes */
  advanced: boolean;
}

export function profileFor(difficulty: number): DifficultyProfile {
  const d = Math.min(7, Math.max(1, Math.round(difficulty)));
  const table: Record<number, DifficultyProfile> = {
    1: { w: 4, h: 4, bRatio: [0.30, 0.45], unlockPreference: 'many', extraOpening: 2, advanced: false },
    2: { w: 4, h: 4, bRatio: [0.30, 0.50], unlockPreference: 'many', extraOpening: 2, advanced: false },
    3: { w: 4, h: 4, bRatio: [0.35, 0.55], unlockPreference: 'many', extraOpening: 1, advanced: true },
    4: { w: 4, h: 5, bRatio: [0.35, 0.55], unlockPreference: 'few',  extraOpening: 1, advanced: true },
    5: { w: 4, h: 5, bRatio: [0.35, 0.55], unlockPreference: 'few',  extraOpening: 1, advanced: true },
    6: { w: 4, h: 5, bRatio: [0.40, 0.60], unlockPreference: 'few',  extraOpening: 0, advanced: true },
    7: { w: 4, h: 5, bRatio: [0.40, 0.60], unlockPreference: 'few',  extraOpening: 0, advanced: true },
  };
  return table[d];
}

function assignTags(grid: Grid, schema: Record<string, string[]>, rng: Rng): Record<string, string>[] {
  const tags: Record<string, string>[] = [];
  for (let i = 0; i < grid.n; i++) tags.push({});
  for (const [key, values] of Object.entries(schema)) {
    // deal values round-robin then shuffle, so every group is non-empty and roughly balanced
    const deck: string[] = [];
    for (let i = 0; i < grid.n; i++) deck.push(values[i % values.length]);
    const shuffled = rng.shuffle(deck);
    for (let i = 0; i < grid.n; i++) tags[i][key] = shuffled[i];
  }
  return tags;
}

export function buildTagMasks(tags: Record<string, string>[]): TagMasks {
  const masks: TagMasks = {};
  tags.forEach((t, i) => {
    for (const [k, v] of Object.entries(t)) {
      (masks[k] ??= {});
      masks[k][v] = (masks[k][v] ?? 0) | (1 << i);
    }
  });
  return masks;
}

/** Every clue in the pool is TRUE of `sol` by construction, so the intended solution
 *  can never be eliminated no matter which subset we end up using. */
function candidatePool(ctx: ClueContext, sol: number, rng: Rng, prof: DifficultyProfile): Clue[] {
  const g = ctx.grid;
  const out: Clue[] = [];
  const countIn = (sel: number, st: State) => popcount(st === B ? sel & sol : sel & ~sol);
  const push = (c: Clue) => out.push(c);

  const selectors: Selector[] = [];
  for (let r = 0; r < g.h; r++) selectors.push({ k: 'row', r });
  for (let c = 0; c < g.w; c++) selectors.push({ k: 'col', c });
  selectors.push({ k: 'corners' }, { k: 'edges' }, { k: 'interior' });
  for (let i = 0; i < g.n; i++) selectors.push({ k: 'neighbors', i }, { k: 'ortho', i });
  for (const [key, vals] of Object.entries(ctx.tagMasks)) {
    for (const v of Object.keys(vals)) selectors.push({ k: 'tag', key, value: v });
  }
  for (let i = 0; i < g.n; i++)
    for (let j = i + 1; j < g.n; j++)
      if (g.between[i][j]) selectors.push({ k: 'between', i, j });

  for (const sel of selectors) {
    const mask = sel.k === 'neighbors' ? g.neigh[(sel as any).i]
      : sel.k === 'ortho' ? g.ortho[(sel as any).i]
      : sel.k === 'row' ? g.rows[(sel as any).r]
      : sel.k === 'col' ? g.cols[(sel as any).c]
      : sel.k === 'corners' ? g.corners
      : sel.k === 'edges' ? g.edges
      : sel.k === 'interior' ? g.interior
      : sel.k === 'between' ? g.between[(sel as any).i][(sel as any).j]
      : ctx.tagMasks[(sel as any).key][(sel as any).value];
    if (!mask) continue;
    const size = popcount(mask);
    for (const st of [A, B] as State[]) {
      const c = countIn(mask, st);
      // "none" and "every" say it better than "exactly zero" and "at most zero" ever will,
      // in any of the three languages — so the zero cases only ever produce those forms
      if (c === 0) { push({ k: 'count', sel, state: st, cmp: 'none', n: 0 }); continue; }
      if (c === size) push({ k: 'count', sel, state: st, cmp: 'all', n: size });
      push({ k: 'count', sel, state: st, cmp: 'eq', n: c });
      push({ k: 'count', sel, state: st, cmp: 'atLeast', n: c });
      if (c < size) push({ k: 'count', sel, state: st, cmp: 'atMost', n: c });
    }
  }

  // pairwise relations
  const pairs: [number, number][] = [];
  for (let i = 0; i < g.n; i++) for (let j = i + 1; j < g.n; j++) pairs.push([i, j]);
  for (const [i, j] of rng.shuffle(pairs).slice(0, Math.min(pairs.length, 140))) {
    const si: State = (sol >> i) & 1 ? B : A;
    const sj: State = (sol >> j) & 1 ? B : A;
    if (si === sj) push({ k: 'sameState', i, j });
    else push({ k: 'differentState', i, j });
    // contrapositive-safe implication: true whenever antecedent false or consequent true
    push({ k: 'implies', i, si, j, sj });
    if (prof.advanced) push({ k: 'implies', i, si: si === A ? B : A, j, sj: sj === A ? B : A });
    for (const st of [A, B] as State[]) {
      const ci = si === st, cj = sj === st;
      if (ci !== cj) push({ k: 'exactlyOneOf', i, j, state: st });
    }
  }

  if (prof.advanced) {
    for (let i = 0; i < g.n; i++) {
      for (const st of [A, B] as State[]) {
        for (let d = 1; d <= g.maxDist; d++) {
          const inner = d > 1 ? g.ringWithin[i][d - 1] & ~(1 << i) : 0;
          const at = g.ring[i][d];
          const innerHas = (st === B ? inner & sol : inner & ~sol) !== 0;
          const atHas = (st === B ? at & sol : at & ~sol) !== 0;
          if (!innerHas && atHas) { push({ k: 'nearest', i, state: st, d }); break; }
        }
      }
    }
    for (const st of [A, B] as State[]) {
      const m = st === B ? sol : g.full & ~sol;
      if (m && isConnected(g, m)) push({ k: 'connected', state: st });
    }
    for (const [key, vals] of Object.entries(ctx.tagMasks)) {
      for (const st of [A, B] as State[]) {
        let best = -1, bestVal = '', tie = false;
        for (const [v, msk] of Object.entries(vals)) {
          const c = popcount(st === B ? msk & sol : msk & ~sol);
          if (c > best) { best = c; bestVal = v; tie = false; }
          else if (c === best) tie = true;
        }
        if (!tie && best > 0) push({ k: 'uniqueMost', key, value: bestVal, state: st });
      }
    }
  }

  // dedupe, keep deterministic order, then shuffle
  const seen = new Set<string>();
  const uniq: Clue[] = [];
  for (const c of out) { const k = KEY(c); if (!seen.has(k)) { seen.add(k); uniq.push(c); } }
  return rng.shuffle(uniq);
}

export function generate(opts: GenerateOptions): Puzzle {
  const difficulty = opts.difficulty ?? 3;
  const prof = profileFor(difficulty);
  const w = opts.w ?? prof.w, h = opts.h ?? prof.h;
  const grid = makeGrid(w, h);
  const attempts = opts.maxAttempts ?? 24;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const rng = makeRng(`${opts.seed}#${attempt}`);
    const p = tryGenerate(grid, rng, prof, difficulty, opts, attempt);
    if (p) return p;
  }
  throw new Error(`generator failed for seed "${opts.seed}" after ${attempts} attempts`);
}

function tryGenerate(
  grid: Grid, rng: Rng, prof: DifficultyProfile, difficulty: number,
  opts: GenerateOptions, attempt: number,
): Puzzle | null {
  const n = grid.n;
  const lo = Math.round(prof.bRatio[0] * n), hi = Math.round(prof.bRatio[1] * n);
  const k = lo + rng.int(hi - lo + 1);
  const cells = rng.shuffle(Array.from({ length: n }, (_, i) => i));
  let sol = 0;
  for (const c of cells.slice(0, k)) sol |= 1 << c;

  const tags = assignTags(grid, opts.tagSchema ?? {}, rng);
  const ctx: ClueContext = { grid, tagMasks: buildTagMasks(tags) };

  const placed: PlacedClue[] = [];
  const used = new Set<string>();
  let order = 0;

  const addClue = (clue: Clue, gate: number | null) => {
    const key = KEY(clue);
    if (used.has(key)) return false;
    used.add(key);
    placed.push({ id: `c${placed.length}`, clue, gate, order: order++ });
    return true;
  };

  // Opening clue: the exact size of the marked set. Cheap for the player to hold in
  // their head, and it collapses the search space from 2^n to n-choose-k immediately.
  const totalClue: Clue = { k: 'count', sel: { k: 'all' }, state: B, cmp: 'eq', n: k };
  addClue(totalClue, null);

  const pool = candidatePool(ctx, sol, rng, prof);

  let active: CompiledClue[] = [compile(ctx, totalClue)];
  let ms = enumerateModels(grid, active, 0, 0);
  if (ms.truncated) return null;
  let models = Int32Array.from(ms.models);
  let len = ms.count;

  // A couple of extra opening clues so the board is readable before the first flip.
  for (let e = 0; e < prof.extraOpening; e++) {
    let bestIdx = -1, bestLen = len;
    for (let i = 0; i < pool.length; i++) {
      if (used.has(KEY(pool[i]))) continue;
      const f = filterModels(models, len, compile(ctx, pool[i]));
      if (f.length > 0 && f.length < bestLen) { bestLen = f.length; bestIdx = i; }
      if (bestLen <= len / 6) break;
    }
    if (bestIdx < 0) break;
    const c = pool[bestIdx];
    addClue(c, null);
    const f = filterModels(models, len, compile(ctx, c));
    models = Int32Array.from(f); len = f.length;
  }

  let knownB = 0, knownA = 0;
  const path: number[] = [];
  let lastRevealed: number | null = null;
  const cluesPerGate = new Map<number | null, number>();
  const gateBudget = 2;

  let guard = 0;
  while ((knownB | knownA) !== grid.full) {
    if (guard++ > n * 6) return null;

    let { alwaysB, alwaysA } = forcedFrom(grid, models, len);
    const known = knownB | knownA;
    let forcedB = alwaysB & ~known, forcedA = alwaysA & ~known;

    if (!(forcedB | forcedA)) {
      // Nothing is deducible: release a new clue from the person we just uncovered.
      const gate = lastRevealed;
      if ((cluesPerGate.get(gate) ?? 0) >= gateBudget && gate !== null) {
        // that informant is tapped out; fall back to an earlier one
        const alt = path.length > 1 ? path[path.length - 2] : null;
        if ((cluesPerGate.get(alt) ?? 0) >= gateBudget) return null;
        lastRevealed = alt;
      }
      const g2 = lastRevealed;
      let chosen = -1, chosenScore = -Infinity, chosenModels: Int32Array | null = null;
      for (let i = 0; i < pool.length; i++) {
        const cand = pool[i];
        if (used.has(KEY(cand))) continue;
        const f = filterModels(models, len, compile(ctx, cand));
        if (f.length === 0) continue;
        const ff = forcedFrom(grid, f, f.length);
        const gain = popcount((ff.alwaysB | ff.alwaysA) & ~known);
        if (gain === 0) continue;
        const score = prof.unlockPreference === 'few'
          ? -gain * 10 - f.length / Math.max(1, len)
          : gain * 10 - f.length / Math.max(1, len);
        if (score > chosenScore) { chosenScore = score; chosen = i; chosenModels = f; }
        if (prof.unlockPreference === 'few' && gain === 1) break;
        if (prof.unlockPreference === 'many' && gain >= 3) break;
      }
      if (chosen < 0 || !chosenModels) return null;
      addClue(pool[chosen], g2);
      cluesPerGate.set(g2, (cluesPerGate.get(g2) ?? 0) + 1);
      models = Int32Array.from(chosenModels); len = chosenModels.length;
      const ff = forcedFrom(grid, models, len);
      forcedB = ff.alwaysB & ~known; forcedA = ff.alwaysA & ~known;
      if (!(forcedB | forcedA)) return null;
    }

    // reveal exactly one forced cell, so each clue release feels earned
    const options = bits(forcedB | forcedA);
    const pick = options[rng.int(options.length)];
    if ((forcedB >> pick) & 1) knownB |= 1 << pick; else knownA |= 1 << pick;
    path.push(pick);
    lastRevealed = pick;
  }

  if (knownB !== sol) return null;

  return {
    seed: `${opts.seed}#${attempt}`,
    w: grid.w, h: grid.h, n,
    // deliberately a one-way hash of the real seed: the client can reproduce the name
    // shuffle in any language without being able to reproduce the board
    labelSeed: `L${hashSeed(`${opts.seed}#${attempt}|labels`).toString(36)}`,
    solution: sol,
    tags,
    clues: placed,
    path,
    difficulty,
    openingClues: placed.filter((c) => c.gate === null).length,
  };
}
