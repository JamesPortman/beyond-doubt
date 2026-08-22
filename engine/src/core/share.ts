/** The result grid.
 *
 *  A puzzle board is not shareable — nobody has ever posted one. A *result* is: it is
 *  small, it is about the person posting, and it says nothing that spoils the puzzle for
 *  the reader. Every square becomes one glyph, and the glyph records how the square was
 *  won rather than what the answer was. */

export interface RunMarks {
  w: number;
  h: number;
  /** how many wrong answers each square took */
  missesByCell?: number[];
  /** 0 none, 1 a hint named it, 2 a hint named it after a clue hint */
  hintedByCell?: number[];
}

export const GLYPH = {
  clean: '🟩',
  missed: '🟨',
  hinted: '🟡',
  doubleHinted: '🟠',
} as const;

/** A square that was both missed and hinted shows the hint: conceding the square is a
 *  larger admission than getting it wrong on the way to working it out yourself. */
export function glyphFor(misses: number, hint: number): string {
  if (hint >= 2) return GLYPH.doubleHinted;
  if (hint === 1) return GLYPH.hinted;
  if (misses > 0) return GLYPH.missed;
  return GLYPH.clean;
}

export function resultGrid(m: RunMarks): string {
  const rows: string[] = [];
  for (let y = 0; y < m.h; y++) {
    let row = '';
    for (let x = 0; x < m.w; x++) {
      const i = y * m.w + x;
      row += glyphFor(m.missesByCell?.[i] ?? 0, m.hintedByCell?.[i] ?? 0);
    }
    rows.push(row);
  }
  return rows.join('\n');
}

export interface ShareInput extends RunMarks {
  title: string;
  /** the edition a reader could go and play, e.g. "21 Aug 2026" */
  edition: string;
  elapsedMs: number;
  addedMs: number;
  url?: string;
}

/** mm:ss, and h:mm:ss once it has gone on that long. */
export function shareTime(ms: number): string {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

export function shareText(input: ShareInput): string {
  const lines = [`${input.title} — ${input.edition}`];
  // The penalty is stated rather than folded in, so the raw solve stays legible and the
  // cost of the mistakes is still owned in public.
  lines.push(input.addedMs > 0
    ? `${shareTime(input.elapsedMs)} (+${shareTime(input.addedMs)})`
    : shareTime(input.elapsedMs));
  lines.push('');
  lines.push(resultGrid(input));
  if (input.url) { lines.push(''); lines.push(input.url); }
  return lines.join('\n');
}
