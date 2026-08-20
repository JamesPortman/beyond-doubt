/** Deterministic PRNG. Every board in the game is a pure function of a seed string,
 *  which is what makes daily/weekly editions and leaderboards possible without a
 *  server ever shipping puzzle data. */

/** FNV-1a — stable across platforms and JS engines. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Rng {
  /** float in [0,1) */
  next(): number;
  /** integer in [0,n) */
  int(n: number): number;
  pick<T>(xs: readonly T[]): T;
  /** Fisher-Yates, returns a new array */
  shuffle<T>(xs: readonly T[]): T[];
  fork(tag: string): Rng;
}

export function makeRng(seed: string | number): Rng {
  let s = (typeof seed === 'string' ? hashSeed(seed) : seed >>> 0) || 0x9e3779b9;
  const next = (): number => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (n) => Math.floor(next() * n),
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    shuffle(xs) {
      const a = xs.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    fork: (tag) => makeRng(hashSeed(tag + ':' + s)),
  };
  return rng;
}
