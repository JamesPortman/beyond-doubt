import { Grid, popcount, isConnected } from './grid.js';

/** Cell state. A = the benign state, B = the marked state.
 *  Themes name them (innocent/criminal, clean/blighted, canon/cut) — the engine never does. */
export const A = 0 as const;
export const B = 1 as const;
export type State = 0 | 1;

export type Selector =
  | { k: 'all' }
  | { k: 'cell'; i: number }
  | { k: 'neighbors'; i: number }
  | { k: 'ortho'; i: number }
  | { k: 'row'; r: number }
  | { k: 'col'; c: number }
  | { k: 'corners' }
  | { k: 'edges' }
  | { k: 'interior' }
  | { k: 'between'; i: number; j: number }
  | { k: 'tag'; key: string; value: string };

export type Comparison = 'eq' | 'atLeast' | 'atMost' | 'none' | 'all';

export type Clue =
  | { k: 'count'; sel: Selector; state: State; cmp: Comparison; n: number }
  | { k: 'compare'; a: Selector; b: Selector; state: State }
  | { k: 'implies'; i: number; si: State; j: number; sj: State }
  | { k: 'exactlyOneOf'; i: number; j: number; state: State }
  | { k: 'sameState'; i: number; j: number }
  | { k: 'differentState'; i: number; j: number }
  | { k: 'nearest'; i: number; state: State; d: number }
  | { k: 'connected'; state: State }
  | { k: 'uniqueMost'; key: string; value: string; state: State };

export type TagMasks = Record<string, Record<string, number>>;

export interface ClueContext {
  grid: Grid;
  tagMasks: TagMasks;
}

export function selectorMask(ctx: ClueContext, s: Selector): number {
  const g = ctx.grid;
  switch (s.k) {
    case 'all': return g.full;
    case 'cell': return 1 << s.i;
    case 'neighbors': return g.neigh[s.i];
    case 'ortho': return g.ortho[s.i];
    case 'row': return g.rows[s.r];
    case 'col': return g.cols[s.c];
    case 'corners': return g.corners;
    case 'edges': return g.edges;
    case 'interior': return g.interior;
    case 'between': return g.between[s.i][s.j];
    case 'tag': return ctx.tagMasks[s.key]?.[s.value] ?? 0;
  }
}

/** Cells of `sel` that are in `state`, given world `m` (bit set = B). */
function inState(sel: number, state: State, m: number): number {
  return state === B ? sel & m : sel & ~m;
}

export interface CompiledClue {
  clue: Clue;
  /** relative evaluation cost; the solver runs cheap tests first so expensive
   *  ones (connectivity) only see candidates that already survived everything else */
  cost: number;
  test(m: number): boolean;
}

export function compile(ctx: ClueContext, clue: Clue): CompiledClue {
  const g = ctx.grid;
  switch (clue.k) {
    case 'count': {
      const sel = selectorMask(ctx, clue.sel);
      const size = popcount(sel);
      const st = clue.state, n = clue.n;
      let test: (m: number) => boolean;
      switch (clue.cmp) {
        case 'eq':      test = (m) => popcount(inState(sel, st, m)) === n; break;
        case 'atLeast': test = (m) => popcount(inState(sel, st, m)) >= n; break;
        case 'atMost':  test = (m) => popcount(inState(sel, st, m)) <= n; break;
        case 'none':    test = (m) => inState(sel, st, m) === 0; break;
        case 'all':     test = (m) => popcount(inState(sel, st, m)) === size; break;
      }
      return { clue, cost: 1, test };
    }
    case 'compare': {
      const a = selectorMask(ctx, clue.a), b = selectorMask(ctx, clue.b), st = clue.state;
      return { clue, cost: 2, test: (m) => popcount(inState(a, st, m)) > popcount(inState(b, st, m)) };
    }
    case 'implies': {
      const bi = 1 << clue.i, bj = 1 << clue.j;
      const si = clue.si, sj = clue.sj;
      return {
        clue, cost: 1,
        test: (m) => {
          const ante = si === B ? (m & bi) !== 0 : (m & bi) === 0;
          if (!ante) return true;
          return sj === B ? (m & bj) !== 0 : (m & bj) === 0;
        },
      };
    }
    case 'exactlyOneOf': {
      const bi = 1 << clue.i, bj = 1 << clue.j, st = clue.state;
      return {
        clue, cost: 1,
        test: (m) => {
          const ci = st === B ? (m & bi) !== 0 : (m & bi) === 0;
          const cj = st === B ? (m & bj) !== 0 : (m & bj) === 0;
          return ci !== cj;
        },
      };
    }
    case 'sameState': {
      const bi = 1 << clue.i, bj = 1 << clue.j;
      return { clue, cost: 1, test: (m) => ((m & bi) !== 0) === ((m & bj) !== 0) };
    }
    case 'differentState': {
      const bi = 1 << clue.i, bj = 1 << clue.j;
      return { clue, cost: 1, test: (m) => ((m & bi) !== 0) !== ((m & bj) !== 0) };
    }
    case 'nearest': {
      const i = clue.i, d = clue.d, st = clue.state;
      const inner = d > 1 ? g.ringWithin[i][d - 1] & ~(1 << i) : 0;
      const at = g.ring[i][d];
      return {
        clue, cost: 2,
        test: (m) => inState(inner, st, m) === 0 && inState(at, st, m) !== 0,
      };
    }
    case 'connected': {
      const st = clue.state;
      return { clue, cost: 20, test: (m) => isConnected(g, inState(g.full, st, m)) };
    }
    case 'uniqueMost': {
      const groups = Object.entries(ctx.tagMasks[clue.key] ?? {});
      const target = ctx.tagMasks[clue.key]?.[clue.value] ?? 0;
      const others = groups.filter(([v]) => v !== clue.value).map(([, msk]) => msk);
      const st = clue.state;
      return {
        clue, cost: 4,
        test: (m) => {
          const c = popcount(inState(target, st, m));
          for (const o of others) if (popcount(inState(o, st, m)) >= c) return false;
          return true;
        },
      };
    }
  }
}

export function compileAll(ctx: ClueContext, clues: readonly Clue[]): CompiledClue[] {
  return clues.map((c) => compile(ctx, c)).sort((x, y) => x.cost - y.cost);
}

/** Which cells a clue talks about — used to gate clue release behind a revealed cell
 *  and to power the "highlight what this clue touches" affordance. */
export function clueTouches(ctx: ClueContext, clue: Clue): number {
  switch (clue.k) {
    case 'count': return selectorMask(ctx, clue.sel);
    case 'compare': return selectorMask(ctx, clue.a) | selectorMask(ctx, clue.b);
    case 'implies':
    case 'exactlyOneOf':
    case 'sameState':
    case 'differentState': return (1 << clue.i) | (1 << clue.j);
    case 'nearest': return ctx.grid.ringWithin[clue.i][ctx.grid.maxDist];
    case 'connected': return ctx.grid.full;
    case 'uniqueMost': return ctx.tagMasks[clue.key]?.[clue.value] ?? 0;
  }
}
