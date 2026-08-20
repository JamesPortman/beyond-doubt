/** Grid geometry as bitmasks. A whole board state is a single 32-bit integer:
 *  bit i set === cell i is in state B. Every clue then compiles to a couple of
 *  bit operations, which is what lets the solver enumerate a million candidate
 *  worlds in a few milliseconds. Hard cap of 25 cells. */

export interface Grid {
  w: number;
  h: number;
  n: number;
  /** all cells */
  full: number;
  /** 8-way neighbour mask per cell */
  neigh: number[];
  /** 4-way neighbour mask per cell */
  ortho: number[];
  rows: number[];
  cols: number[];
  corners: number;
  edges: number;
  /** interior = not on any edge */
  interior: number;
  /** cells strictly between a and b when collinear (row/col/diagonal); else 0 */
  between: number[][];
  /** ring[i][d] = cells at chebyshev distance exactly d from i */
  ring: number[][];
  /** ring at distance <= d */
  ringWithin: number[][];
  maxDist: number;
}

export const MAX_CELLS = 25;

export function xy(g: Grid, i: number): [number, number] {
  return [i % g.w, Math.floor(i / g.w)];
}
export function idx(g: { w: number }, x: number, y: number): number {
  return y * g.w + x;
}

export function popcount(m: number): number {
  m = m - ((m >> 1) & 0x55555555);
  m = (m & 0x33333333) + ((m >> 2) & 0x33333333);
  m = (m + (m >> 4)) & 0x0f0f0f0f;
  return (m * 0x01010101) >> 24;
}

export function bits(m: number): number[] {
  const out: number[] = [];
  while (m) {
    const lsb = m & -m;
    out.push(31 - Math.clz32(lsb));
    m ^= lsb;
  }
  return out;
}

export function makeGrid(w: number, h: number): Grid {
  const n = w * h;
  if (n > MAX_CELLS) throw new Error(`grid too large: ${w}x${h} exceeds ${MAX_CELLS} cells`);
  const full = n === 32 ? -1 : (1 << n) - 1;
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

  const neigh: number[] = [], ortho: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i / w) | 0;
    let a = 0, o = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (!inb(x + dx, y + dy)) continue;
        const j = 1 << ((y + dy) * w + (x + dx));
        a |= j;
        if (dx === 0 || dy === 0) o |= j;
      }
    neigh.push(a); ortho.push(o);
  }

  const rows: number[] = [], cols: number[] = [];
  for (let y = 0; y < h; y++) { let m = 0; for (let x = 0; x < w; x++) m |= 1 << (y * w + x); rows.push(m); }
  for (let x = 0; x < w; x++) { let m = 0; for (let y = 0; y < h; y++) m |= 1 << (y * w + x); cols.push(m); }

  const corners = (1 << 0) | (1 << (w - 1)) | (1 << ((h - 1) * w)) | (1 << ((h - 1) * w + w - 1));
  let edges = 0;
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i / w) | 0;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edges |= 1 << i;
  }
  const interior = full & ~edges;

  const between: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    const [xi, yi] = [i % w, (i / w) | 0];
    for (let j = 0; j < n; j++) {
      const [xj, yj] = [j % w, (j / w) | 0];
      const dx = Math.sign(xj - xi), dy = Math.sign(yj - yi);
      const adx = Math.abs(xj - xi), ady = Math.abs(yj - yi);
      const collinear = (dx === 0 && ady > 1) || (dy === 0 && adx > 1) || (adx === ady && adx > 1);
      if (!collinear) { row.push(0); continue; }
      let m = 0, x = xi + dx, y = yi + dy;
      while (x !== xj || y !== yj) { m |= 1 << (y * w + x); x += dx; y += dy; }
      row.push(m);
    }
    between.push(row);
  }

  const maxDist = Math.max(w, h) - 1;
  const ring: number[][] = [], ringWithin: number[][] = [];
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i / w) | 0;
    const r: number[] = [], rw: number[] = [];
    for (let d = 0; d <= maxDist; d++) {
      let m = 0;
      for (let j = 0; j < n; j++) {
        const dj = Math.max(Math.abs((j % w) - x), Math.abs(((j / w) | 0) - y));
        if (dj === d) m |= 1 << j;
      }
      r.push(m);
      rw.push((d > 0 ? rw[d - 1] : 0) | m);
    }
    ring.push(r); ringWithin.push(rw);
  }

  return { w, h, n, full, neigh, ortho, rows, cols, corners, edges, interior, between, ring, ringWithin, maxDist };
}

/** Are all set bits of `m` connected under 4-way adjacency? Empty and singletons count as connected. */
export function isConnected(g: Grid, m: number): boolean {
  if (m === 0) return true;
  const start = m & -m;
  let seen = start, frontier = start;
  while (frontier) {
    let nextF = 0;
    let f = frontier;
    while (f) {
      const lsb = f & -f;
      f ^= lsb;
      nextF |= g.ortho[31 - Math.clz32(lsb)] & m & ~seen;
    }
    seen |= nextF;
    frontier = nextF;
  }
  return seen === m;
}
