import { Grid, popcount } from './grid.js';
import { CompiledClue } from './clue.js';

/** The whole solver is "enumerate every world still consistent with what the player
 *  knows, then see which cells agree across all of them". Cells that agree are FORCED —
 *  the player may flip those and nothing else. That single rule is what guarantees
 *  no-guess play, and it is also what makes the game safe to race: nobody can gamble ahead. */

export const MAX_SOLVER_CELLS = 21;

export interface ModelSet {
  /** consistent worlds, as bitmasks */
  models: Int32Array;
  count: number;
  /** bits set in every model */
  alwaysB: number;
  /** bits clear in every model */
  alwaysA: number;
  truncated: boolean;
}

const EMPTY = new Int32Array(0);

export function enumerateModels(
  grid: Grid,
  clues: readonly CompiledClue[],
  knownB: number,
  knownA: number,
  cap = 1 << 21,
): ModelSet {
  const free = grid.full & ~knownB & ~knownA;
  const f = popcount(free);
  if (f > MAX_SOLVER_CELLS) {
    throw new Error(`solver refuses ${f} free cells (limit ${MAX_SOLVER_CELLS}); constrain the board first`);
  }
  const total = 1 << f;
  const out = new Int32Array(Math.min(total, cap));
  let count = 0;
  let alwaysB = grid.full, alwaysA = grid.full;
  let truncated = false;

  let sub = free;
  for (;;) {
    const m = knownB | sub;
    let ok = true;
    for (let c = 0; c < clues.length; c++) {
      if (!clues[c].test(m)) { ok = false; break; }
    }
    if (ok) {
      if (count < out.length) out[count] = m; else truncated = true;
      count++;
      alwaysB &= m;
      alwaysA &= ~m & grid.full;
    }
    if (sub === 0) break;
    sub = (sub - 1) & free;
  }
  return { models: count ? out.subarray(0, Math.min(count, out.length)) : EMPTY, count, alwaysB, alwaysA, truncated };
}

/** Recompute forced cells over an already-filtered model list. */
export function forcedFrom(grid: Grid, models: Int32Array, len: number): { alwaysB: number; alwaysA: number } {
  let alwaysB = grid.full, alwaysA = grid.full;
  for (let i = 0; i < len; i++) {
    alwaysB &= models[i];
    alwaysA &= ~models[i] & grid.full;
  }
  return { alwaysB, alwaysA };
}

export function filterModels(models: Int32Array, len: number, clue: CompiledClue): Int32Array {
  const out = new Int32Array(len);
  let k = 0;
  for (let i = 0; i < len; i++) if (clue.test(models[i])) out[k++] = models[i];
  return out.subarray(0, k);
}

export interface Deduction {
  /** cells the player is allowed to flip right now, and to what */
  forcedB: number;
  forcedA: number;
  /** cells not yet known and not forced */
  undetermined: number;
  modelCount: number;
  solved: boolean;
  contradiction: boolean;
}

export function deduce(
  grid: Grid,
  clues: readonly CompiledClue[],
  knownB: number,
  knownA: number,
): Deduction {
  const ms = enumerateModels(grid, clues, knownB, knownA);
  const known = knownB | knownA;
  const forcedB = ms.alwaysB & ~known;
  const forcedA = ms.alwaysA & ~known;
  return {
    forcedB: ms.count ? forcedB : 0,
    forcedA: ms.count ? forcedA : 0,
    undetermined: grid.full & ~known & ~forcedB & ~forcedA,
    modelCount: ms.count,
    solved: known === grid.full,
    contradiction: ms.count === 0,
  };
}
