import { Grid, makeGrid, bits, popcount } from './grid.js';
import { Clue, ClueContext, CompiledClue, State, compile, clueTouches, A, B } from './clue.js';
import { deduce, Deduction } from './solver.js';
import { Puzzle, PuzzleView, PlacedClue, buildTagMasks } from './generate.js';
import { makeRng } from './rng.js';

export type MoveOutcome = 'ok' | 'not-deducible' | 'wrong' | 'already-known' | 'finished';

export interface MoveResult {
  outcome: MoveOutcome;
  /** clues released by this reveal */
  unlocked: PlacedClue[];
  solved: boolean;
}

export interface SessionOptions {
  puzzle: PuzzleView;
  /** 1 = solo. >1 deals the clue set out; nobody can finish alone. */
  players?: number;
  hintBudget?: number;
  now?: () => number;
}

export interface Hint {
  kind: 'clue' | 'cell' | 'none';
  clueId?: string;
  cell?: number;
  state?: State;
}

export class Session {
  readonly puzzle: PuzzleView;
  readonly grid: Grid;
  readonly ctx: ClueContext;
  readonly players: number;
  readonly hintBudget: number;
  /** clueId -> player index; opening clues are dealt to everyone (-1) */
  readonly deal: Map<string, number>;

  knownB = 0;
  knownA = 0;
  mistakes = 0;
  hintsUsed = 0;
  startedAt: number;
  finishedAt: number | null = null;
  /** cells the player marked, in order — the replay */
  moves: { cell: number; state: State; at: number }[] = [];

  private now: () => number;
  protected compiled = new Map<string, CompiledClue>();

  constructor(opts: SessionOptions) {
    this.puzzle = opts.puzzle;
    this.grid = makeGrid(opts.puzzle.w, opts.puzzle.h);
    this.ctx = { grid: this.grid, tagMasks: buildTagMasks(opts.puzzle.tags) };
    this.players = Math.max(1, opts.players ?? 1);
    this.hintBudget = opts.hintBudget ?? 3;
    this.now = opts.now ?? (() => Date.now());
    this.startedAt = this.now();
    for (const c of this.puzzle.clues) this.compiled.set(c.id, compile(this.ctx, c.clue));
    this.deal = dealClues(this.puzzle, this.players);
  }

  get known(): number { return this.knownB | this.knownA; }
  get solved(): boolean { return this.known === this.grid.full; }
  get elapsedMs(): number { return (this.finishedAt ?? this.now()) - this.startedAt; }

  /** Clues currently in play: opening clues, plus those released by a revealed cell. */
  activeClues(): PlacedClue[] {
    return this.puzzle.clues.filter((c) => c.gate === null || ((this.known >> c.gate) & 1) === 1);
  }

  /** In split-clue mode, what this player can actually see. */
  cluesFor(player: number): PlacedClue[] {
    if (this.players === 1) return this.activeClues();
    return this.activeClues().filter((c) => {
      const owner = this.deal.get(c.id);
      return owner === undefined || owner === -1 || owner === player;
    });
  }

  private activeCompiled(exclude?: string): CompiledClue[] {
    const out: CompiledClue[] = [];
    for (const c of this.activeClues()) {
      if (c.id === exclude) continue;
      const cc = this.compiled.get(c.id);
      if (cc) out.push(cc);
    }
    return out.sort((a, b) => a.cost - b.cost);
  }

  /** The engine's core promise: these are the only legal moves right now. */
  deduction(): Deduction {
    return deduce(this.grid, this.activeCompiled(), this.knownB, this.knownA);
  }

  mark(cell: number, state: State): MoveResult {
    if (this.solved) return { outcome: 'finished', unlocked: [], solved: true };
    if ((this.known >> cell) & 1) return { outcome: 'already-known', unlocked: [], solved: false };

    const d = this.deduction();
    const forced = d.forcedA | d.forcedB;
    if (!((forced >> cell) & 1)) {
      // Not a mistake — the game simply refuses guesses. This is the rule that makes
      // racing fair and makes split-clue play cooperative rather than lucky.
      return { outcome: 'not-deducible', unlocked: [], solved: false };
    }
    // The forced set IS the answer: if every consistent world agrees on this cell, that
    // agreement is the solution. So a client can play a full board correctly while never
    // being sent the solution — which is what makes server-verified play possible without
    // a round trip on every tap.
    const truth: State = ((d.forcedB >> cell) & 1) ? B : A;
    if (state !== truth) {
      this.mistakes++;
      return { outcome: 'wrong', unlocked: [], solved: false };
    }
    if (truth === B) this.knownB |= 1 << cell; else this.knownA |= 1 << cell;
    this.moves.push({ cell, state: truth, at: this.now() });
    const unlocked = this.puzzle.clues.filter((c) => c.gate === cell);
    if (this.solved && this.finishedAt === null) this.finishedAt = this.now();
    return { outcome: 'ok', unlocked, solved: this.solved };
  }

  /** Two-step hint, same shape as the original: first point at a clue that is
   *  currently load-bearing, then name a square that is already decidable. */
  hint(): Hint {
    if (this.hintsUsed >= this.hintBudget || this.solved) return { kind: 'none' };
    const base = this.deduction();
    const baseForced = base.forcedA | base.forcedB;
    if (!baseForced) return { kind: 'none' };

    for (const c of this.activeClues()) {
      const without = deduce(this.grid, this.activeCompiled(c.id), this.knownB, this.knownA);
      if ((without.forcedA | without.forcedB) !== baseForced) {
        this.hintsUsed++;
        return { kind: 'clue', clueId: c.id };
      }
    }
    const cell = bits(baseForced)[0];
    this.hintsUsed++;
    return { kind: 'cell', cell, state: ((base.forcedB >> cell) & 1) ? B : A };
  }

  /** Clues released by the server mid-game (online play), or by a gate (offline). */
  addClues(clues: PlacedClue[]): void {
    for (const c of clues) {
      if (this.puzzle.clues.some((x) => x.id === c.id)) continue;
      this.puzzle.clues.push(c);
      this.compiled.set(c.id, compile(this.ctx, c.clue));
    }
  }

  /** Which cells a clue is about — for the "highlight this clue" affordance. */
  touches(clue: Clue): number[] { return bits(clueTouches(this.ctx, clue)); }

  snapshot() {
    return {
      knownB: this.knownB, knownA: this.knownA, mistakes: this.mistakes,
      hintsUsed: this.hintsUsed, elapsedMs: this.elapsedMs, solved: this.solved,
      revealed: popcount(this.known), total: this.grid.n,
    };
  }
}

/** Split clues: every opening clue is public, and the rest are dealt round-robin from a
 *  shuffled order. With >1 player the board is unsolvable from any single hand — which is
 *  the whole point; it forces people to talk. */
export function dealClues(puzzle: PuzzleView, players: number): Map<string, number> {
  const map = new Map<string, number>();
  if (players <= 1) {
    for (const c of puzzle.clues) map.set(c.id, -1);
    return map;
  }
  const rng = makeRng(`${puzzle.labelSeed}|deal|${players}`);
  const gated = puzzle.clues.filter((c) => c.gate !== null);
  for (const c of puzzle.clues) if (c.gate === null) map.set(c.id, -1);
  const order = rng.shuffle(gated);
  order.forEach((c, i) => map.set(c.id, i % players));
  return map;
}
