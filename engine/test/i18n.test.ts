import test from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../src/core/generate.js';
import { Clue, A, B } from '../src/core/clue.js';
import { THEMES } from '../src/themes/all.js';
import { renderContext, renderClue, resolveLabels } from '../src/themes/index.js';
import { dealFor } from '../src/render/deal.js';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The tests run from dist-test/, so walk up to whichever directory owns package.json
 *  rather than hard-coding how deep the compiled output happens to sit. */
const ROOT = (() => {
  let d = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(d, 'package.json'))) return d;
    d = dirname(d);
  }
  throw new Error('package.json not found above the test file');
})();
import { tileArt } from '../src/render/art.js';
import { resultGrid, glyphFor, shareText, shareTime } from '../src/core/share.js';
import { Session } from '../src/core/session.js';
import type { State } from '../src/core/clue.js';
import { getLocale } from '../src/i18n/index.js';
import { ALL_LOCALES } from '../src/i18n/locales.js';

const LOCALES = ALL_LOCALES;

/** Every clue kind, so no template can rot unnoticed. */
function allKinds(): Clue[] {
  return [
    { k: 'count', sel: { k: 'all' }, state: B, cmp: 'eq', n: 7 },
    { k: 'count', sel: { k: 'row', r: 2 }, state: B, cmp: 'eq', n: 2 },
    { k: 'count', sel: { k: 'row', r: 1 }, state: B, cmp: 'eq', n: 1 },
    { k: 'count', sel: { k: 'col', c: 1 }, state: A, cmp: 'atLeast', n: 2 },
    { k: 'count', sel: { k: 'col', c: 2 }, state: A, cmp: 'atMost', n: 3 },
    { k: 'count', sel: { k: 'row', r: 0 }, state: B, cmp: 'none', n: 0 },
    { k: 'count', sel: { k: 'row', r: 3 }, state: B, cmp: 'all', n: 4 },
    { k: 'count', sel: { k: 'corners' }, state: B, cmp: 'eq', n: 1 },
    { k: 'count', sel: { k: 'edges' }, state: A, cmp: 'eq', n: 5 },
    { k: 'count', sel: { k: 'interior' }, state: B, cmp: 'eq', n: 2 },
    { k: 'count', sel: { k: 'neighbors', i: 5 }, state: B, cmp: 'eq', n: 3 },
    { k: 'count', sel: { k: 'ortho', i: 6 }, state: A, cmp: 'eq', n: 2 },
    { k: 'count', sel: { k: 'between', i: 0, j: 3 }, state: B, cmp: 'none', n: 0 },
    { k: 'compare', a: { k: 'row', r: 0 }, b: { k: 'row', r: 2 }, state: B },
    { k: 'implies', i: 1, si: B, j: 9, sj: A },
    { k: 'exactlyOneOf', i: 2, j: 8, state: B },
    { k: 'sameState', i: 3, j: 7 },
    { k: 'differentState', i: 4, j: 11 },
    { k: 'nearest', i: 6, state: B, d: 2 },
    { k: 'nearest', i: 6, state: B, d: 1 },
    { k: 'connected', state: B },
  ];
}

test('every clue kind renders cleanly in every theme and every language', () => {
  for (const theme of THEMES) {
    const puzzle = generate({ seed: `i18n-${theme.id}`, difficulty: 4, tagSchema: theme.tagSchema });
    const tagKey = Object.keys(theme.tagSchema)[0];
    const tagVal = theme.tagSchema[tagKey][0];
    const clues: Clue[] = [
      ...allKinds(),
      { k: 'count', sel: { k: 'tag', key: tagKey, value: tagVal }, state: B, cmp: 'eq', n: 1 },
      { k: 'count', sel: { k: 'tag', key: tagKey, value: tagVal }, state: B, cmp: 'none', n: 0 },
      { k: 'count', sel: { k: 'tag', key: tagKey, value: tagVal }, state: A, cmp: 'all', n: 4 },
      { k: 'uniqueMost', key: tagKey, value: tagVal, state: B },
    ];
    for (const code of LOCALES) {
      const loc = getLocale(code);
      const ctx = renderContext(theme, code, puzzle);
      clues.forEach((c, i) => {
        const s = renderClue(loc, theme, ctx, c, i);
        const where = `${theme.id}/${code}/${c.k}`;
        assert.ok(s.length > 8, `${where}: empty render`);
        assert.ok(!/undefined|NaN|\[object/.test(s), `${where}: leaked placeholder -> ${s}`);
        assert.ok(!/\s{2,}/.test(s), `${where}: double space -> ${s}`);
        assert.ok(!/ \./.test(s), `${where}: space before period -> ${s}`);
        assert.ok(/[.!]$/.test(s), `${where}: no terminal punctuation -> ${s}`);
        assert.equal(s[0], s[0].toUpperCase(), `${where}: not capitalised -> ${s}`);
      });
    }
  }
});

test('generated boards render every one of their real clues in all three languages', () => {
  for (const theme of THEMES) {
    for (let d = 1; d <= 7; d++) {
      const puzzle = generate({ seed: `render-${theme.id}-${d}`, difficulty: d, tagSchema: theme.tagSchema });
      for (const code of LOCALES) {
        const loc = getLocale(code);
        const ctx = renderContext(theme, code, puzzle);
        puzzle.clues.forEach((pc, i) => {
          const s = renderClue(loc, theme, ctx, pc.clue, i);
          assert.ok(s.length > 8 && !/undefined/.test(s), `${theme.id}/${code}/d${d}: ${s}`);
        });
      }
    }
  }
});

/** The reason this layer exists: "tree" is masculine-ish in English, feminine in
 *  Portuguese and masculine in Spanish, and every adjective in the sentence has to follow. */
test('Portuguese and Spanish agree in gender and number with the theme noun', () => {
  const orchard = THEMES.find((t) => t.id === 'orchard')!;
  const puzzle = generate({ seed: 'agree', difficulty: 3, tagSchema: orchard.tagSchema });

  const ptCtx = renderContext(orchard, 'pt', puzzle);
  const esCtx = renderContext(orchard, 'es', puzzle);
  const pt = getLocale('pt'), es = getLocale('es'), en = getLocale('en');

  const plural: Clue = { k: 'count', sel: { k: 'row', r: 1 }, state: B, cmp: 'eq', n: 2 };
  assert.equal(pt.clue(plural, ptCtx), 'Na fileira 2, exatamente duas árvores estão doentes.');
  assert.equal(es.clue(plural, esCtx), 'En la fila 2, exactamente dos árboles están enfermos.');
  assert.equal(en.clue(plural, renderContext(orchard, 'en', puzzle)), 'In row 2, exactly two trees are blighted.');

  const singular: Clue = { k: 'count', sel: { k: 'row', r: 0 }, state: A, cmp: 'eq', n: 1 };
  assert.equal(pt.clue(singular, ptCtx), 'Na fileira 1, exatamente uma árvore está sadia.');
  assert.equal(es.clue(singular, esCtx), 'En la fila 1, exactamente un árbol está sano.');

  const none: Clue = { k: 'count', sel: { k: 'corners' }, state: B, cmp: 'none', n: 0 };
  assert.match(pt.clue({ k: 'count', sel: { k: 'row', r: 2 }, state: B, cmp: 'none', n: 0 }, ptCtx), /nenhuma árvore está doente/);
  assert.match(es.clue({ k: 'count', sel: { k: 'row', r: 2 }, state: B, cmp: 'none', n: 0 }, esCtx), /ningún árbol está enfermo/);
  assert.match(pt.clue(none, ptCtx), /nenhuma está doente/, 'pronominal keeps the tile gender');

  const all: Clue = { k: 'count', sel: { k: 'row', r: 3 }, state: B, cmp: 'all', n: 4 };
  assert.match(pt.clue(all, ptCtx), /todas as árvores estão doentes/);
  assert.match(es.clue(all, esCtx), /todos los árboles están enfermos/);
});

test('a masculine theme noun flips every agreement', () => {
  // The case this test exists to pin is singular-vs-plural against a masculine noun.
  // It finds one by gender rather than by name, so retiring a theme cannot silently
  // delete the coverage — it fails loudly instead.
  const m = THEMES.find((t) => t.strings.pt.tile.g === 'm' && t.strings.es.tile.g === 'm');
  assert.ok(m, 'the suite needs a masculine-noun theme to test agreement against');
  const puzzle = generate({ seed: 'agree2', difficulty: 3, tagSchema: m.tagSchema });
  const pt = getLocale('pt'), es = getLocale('es');
  const two: Clue = { k: 'count', sel: { k: 'row', r: 0 }, state: B, cmp: 'eq', n: 2 };
  assert.match(pt.clue(two, renderContext(m, 'pt', puzzle)), /exatamente dois \S+s /);
  assert.match(es.clue(two, renderContext(m, 'es', puzzle)), /exactamente dos \S+s /);
  const one: Clue = { k: 'count', sel: { k: 'row', r: 0 }, state: B, cmp: 'eq', n: 1 };
  assert.match(pt.clue(one, renderContext(m, 'pt', puzzle)), /exatamente um /);
  assert.match(es.clue(one, renderContext(m, 'es', puzzle)), /exactamente un /);
});

test('person names carry their own gender through conditional clues', () => {
  const cb = THEMES.find((t) => t.id === 'callboard')!;
  const puzzle = generate({ seed: 'names', difficulty: 3, tagSchema: cb.tagSchema });
  for (const code of LOCALES) {
    const ctx = renderContext(cb, code, puzzle);
    assert.equal(ctx.labels.length, puzzle.n);
    for (const l of ctx.labels) assert.ok(l.g === 'm' || l.g === 'f', 'every label declares a gender');
    const s = getLocale(code).clue({ k: 'implies', i: 0, si: B, j: 1, sj: A }, ctx);
    assert.ok(s.includes(ctx.labels[0].text) && s.includes(ctx.labels[1].text));
  }
});

test('theme voice wraps the sentence without breaking it', () => {
  const rec = THEMES.find((t) => t.id === 'record')!;
  const puzzle = generate({ seed: 'voice', difficulty: 5, tagSchema: rec.tagSchema });
  for (const code of LOCALES) {
    const loc = getLocale(code);
    const ctx = renderContext(rec, code, puzzle);
    const s = renderClue(loc, rec, ctx, { k: 'count', sel: { k: 'row', r: 0 }, state: B, cmp: 'eq', n: 2 }, 0);
    assert.ok(s.length > 20 && /§|Divulga|Según|Per /.test(s), `voice missing: ${s}`);
  }
});

test('UI strings are complete in every language', () => {
  const keys = Object.keys(getLocale('en').ui) as (keyof ReturnType<typeof getLocale>['ui'])[];
  for (const code of LOCALES) {
    const ui = getLocale(code).ui as unknown as Record<string, unknown>;
    for (const k of keys) {
      const v = ui[k as string];
      assert.ok(v !== undefined && v !== '', `${code} is missing ui.${String(k)}`);
      if (Array.isArray(v)) assert.equal(v.length, 7, `${code}.days must have 7 entries`);
    }
  }
});

test('tile art is deterministic, well-formed, and state-aware', () => {
  const seen = new Map<string, string>();
  for (const theme of THEMES) {
    const puzzle = generate({ seed: `art-${theme.id}`, difficulty: 3, tagSchema: theme.tagSchema });
    const perTile = new Set<string>();
    for (let i = 0; i < puzzle.n; i++) {
      const base = tileArt({ theme, index: i, labelSeed: puzzle.labelSeed });
      // A theme is either drawn (an SVG) or backed by real files (an <img> in a wrapper).
      // Both are legitimate tiles; what matters is that neither comes out malformed.
      const wellFormed = theme.images
        ? base.startsWith('<span class="tile-photo">') && base.includes('<img src=') && base.endsWith('</span>')
        : base.startsWith('<svg') && base.endsWith('</svg>');
      assert.ok(wellFormed, `${theme.id}: malformed tile -> ${base.slice(0, 120)}`);
      assert.ok(!/undefined|NaN|null/.test(base), `${theme.id} tile ${i}: bad value in art -> ${base.slice(0, 160)}`);
      // deterministic: same inputs, same picture
      assert.equal(base, tileArt({ theme, index: i, labelSeed: puzzle.labelSeed }));
      perTile.add(base);
      // state changes the drawing
      const marked = tileArt({ theme, index: i, labelSeed: puzzle.labelSeed, state: 1 });
      assert.notEqual(marked, base, `${theme.id} tile ${i}: state must change the art`);
      seen.set(`${theme.id}:${i}`, base);
    }
    assert.ok(perTile.size >= Math.min(puzzle.n, 8), `${theme.id}: tiles are too samey (${perTile.size} distinct)`);
  }
  // and two different boards do not produce the same faces
  const t = THEMES[0];
  const a = generate({ seed: 'artA', difficulty: 3, tagSchema: t.tagSchema });
  const b = generate({ seed: 'artB', difficulty: 3, tagSchema: t.tagSchema });
  assert.notEqual(
    tileArt({ theme: t, index: 0, labelSeed: a.labelSeed }),
    tileArt({ theme: t, index: 0, labelSeed: b.labelSeed }),
  );
});

test('an image-backed theme deals every tile a different work, and the files exist', () => {
  for (const theme of THEMES.filter((t) => t.images)) {
    const set = theme.images!;
    for (const seed of ['gal-1', 'gal-2', 'gal-3']) {
      const puzzle = generate({ seed, difficulty: 4, tagSchema: theme.tagSchema });
      assert.ok(set.count >= puzzle.n, `${theme.id}: ${set.count} works cannot fill ${puzzle.n} tiles`);
      const srcs = new Set<string>();
      for (let i = 0; i < puzzle.n; i++) {
        const n = dealFor(puzzle.labelSeed, set.count)[i % set.count];
        // Two tiles showing the same picture would read as a hint that isn't there.
        assert.ok(!srcs.has(set.src(n)), `${theme.id}: work ${n} appears twice on one board`);
        srcs.add(set.src(n));
        const file = join(ROOT, 'demo', set.src(n).replace(/^\//, ''));
        assert.ok(existsSync(file), `${theme.id}: missing asset ${set.src(n)}`);
        // the label under the tile has to be that picture's own title
        if (set.title) {
          const labels = resolveLabels(theme, 'en', puzzle);
          assert.equal(labels[i].text, set.title(n), `${theme.id} tile ${i}: label does not match the work`);
        }
      }
    }
  }
});

test('the innocent/guilty theme reads correctly in all three languages', () => {
  const g = THEMES.find((t) => t.id === 'guestlist')!;
  const puzzle = generate({ seed: 'guilt', difficulty: 4, tagSchema: g.tagSchema });
  const en = getLocale('en'), pt = getLocale('pt'), es = getLocale('es');
  const two: Clue = { k: 'count', sel: { k: 'row', r: 1 }, state: B, cmp: 'eq', n: 2 };
  assert.equal(en.clue(two, renderContext(g, 'en', puzzle)), 'In row 2, exactly two guests are guilty.');
  assert.equal(pt.clue(two, renderContext(g, 'pt', puzzle)), 'Na fileira 2, exatamente dois convidados são culpados.');
  assert.equal(es.clue(two, renderContext(g, 'es', puzzle)), 'En la fila 2, exactamente dos invitados son culpables.');
  const one: Clue = { k: 'count', sel: { k: 'corners' }, state: A, cmp: 'eq', n: 1 };
  assert.match(pt.clue(one, renderContext(g, 'pt', puzzle)), /exatamente um é inocente/);
  assert.match(es.clue(one, renderContext(g, 'es', puzzle)), /exactamente uno es inocente/);
  // a female name must take the feminine form of "guilty" in Portuguese
  const ctx = renderContext(g, 'pt', puzzle);
  const f = ctx.labels.findIndex((l) => l.g === 'f');
  const m = ctx.labels.findIndex((l) => l.g === 'm');
  assert.ok(f >= 0 && m >= 0);
  assert.match(pt.clue({ k: 'implies', i: f, si: B, j: m, sj: B }, ctx),
    new RegExp(`Se ${ctx.labels[f].text} é culpada, então ${ctx.labels[m].text} é culpado\\.`));
});

test('generated clues never say "at most zero" in any language', () => {
  const bad = [/at most zero/i, /exactly zero/i, /no máximo zero/i, /exatamente zero/i, /como máximo cero/i, /exactamente cero/i, /\bzero\b/i, /\bcero\b/i];
  for (const theme of THEMES) {
    for (let d = 1; d <= 7; d++) {
      for (let s = 0; s < 3; s++) {
        const puzzle = generate({ seed: `zero-${theme.id}-${d}-${s}`, difficulty: d, tagSchema: theme.tagSchema });
        for (const code of LOCALES) {
          const loc = getLocale(code);
          const ctx = renderContext(theme, code, puzzle);
          for (const pc of puzzle.clues) {
            const str = renderClue(loc, theme, ctx, pc.clue, pc.order);
            for (const re of bad) {
              assert.ok(!re.test(str), `${theme.id}/${code}: awkward zero phrasing -> ${str}`);
            }
          }
        }
      }
    }
  }
});

test('a theme backed by real artwork deals pictures without repeating', () => {
  const base = THEMES.find((t) => !t.images)!;   // synthesise a set onto a drawn theme
  const withArt = {
    ...base,
    images: { count: 24, src: (n: number) => `/assets/wall/${String(n + 1).padStart(2, '0')}.webp`, mark: 'crack' as const },
  };
  const puzzle = generate({ seed: 'photos', difficulty: 5, tagSchema: base.tagSchema });

  const srcOf = (i: number, state?: 0 | 1) => {
    const html = tileArt({ theme: withArt, index: i, labelSeed: puzzle.labelSeed, state });
    return /src="([^"]+)"/.exec(html)?.[1] ?? '';
  };

  const used = new Set<string>();
  for (let i = 0; i < puzzle.n; i++) {
    const src = srcOf(i);
    assert.match(src, /^\/assets\/wall\/\d\d\.webp$/, 'uses the set, not the drawing');
    assert.ok(!used.has(src), `tile ${i} repeated ${src} on the same board`);
    used.add(src);
  }
  assert.equal(used.size, puzzle.n);

  // same board, same pictures in the same places — everyone in a room must agree
  assert.equal(srcOf(3), srcOf(3));
  // a different board deals differently
  const other = generate({ seed: 'photos-2', difficulty: 5, tagSchema: base.tagSchema });
  const otherFirst = /src="([^"]+)"/.exec(
    tileArt({ theme: withArt, index: 0, labelSeed: other.labelSeed }))?.[1];
  assert.notEqual(otherFirst, srcOf(0));

  // the marked state is shown over the photograph, and the photograph is unchanged
  const marked = tileArt({ theme: withArt, index: 0, labelSeed: puzzle.labelSeed, state: 1 });
  assert.ok(marked.includes('tile-overlay'), 'marked tiles get an overlay');
  assert.ok(!tileArt({ theme: withArt, index: 0, labelSeed: puzzle.labelSeed, state: 0 }).includes('tile-overlay'));
  assert.equal(/src="([^"]+)"/.exec(marked)?.[1], srcOf(0), 'and the same picture underneath');

  // a theme with no set still draws — picked by that property, not by name, so wiring a
  // real image set onto another theme cannot quietly turn this assertion into a tautology
  const drawn = THEMES.find((t) => !t.images);
  assert.ok(drawn, 'at least one theme should still be drawn rather than photographed');
  assert.ok(tileArt({ theme: drawn, index: 0, labelSeed: puzzle.labelSeed }).startsWith('<svg'));
});

/* ------------------------------------------------------------------ *
 * The result grid. The thing worth pinning is that it says how you
 * won each square and never what the answer was.
 * ------------------------------------------------------------------ */

test('the result grid records how a square was won, never what it was', () => {
  const w = 4, h = 5, n = w * h;
  const misses = new Array(n).fill(0);
  const hints = new Array(n).fill(0);
  misses[1] = 2; hints[2] = 1; hints[3] = 2; misses[3] = 1;

  const grid = resultGrid({ w, h, missesByCell: misses, hintedByCell: hints });
  const rows = grid.split('\n');
  assert.equal(rows.length, h);
  assert.equal([...rows[0]].length, w, 'one glyph per square');
  assert.equal([...rows[0]].join(''), '🟩🟨🟡🟠');
  // a square that was both missed and hinted shows the hint: the larger concession wins
  assert.equal(glyphFor(9, 2), '🟠');
  assert.equal(glyphFor(9, 1), '🟡');
  assert.equal(glyphFor(1, 0), '🟨');
  assert.equal(glyphFor(0, 0), '🟩');

  // a clean run is entirely green, and nothing in the output distinguishes the two states
  const clean = resultGrid({ w, h });
  assert.equal(clean.replace(/\n/g, ''), '🟩'.repeat(n));
  const text = shareText({
    w, h, title: 'Auction Night', edition: '21 Aug 2026',
    elapsedMs: 252_000, addedMs: 120_000, url: 'https://example.test',
    missesByCell: misses, hintedByCell: hints,
  });
  assert.match(text, /^Auction Night — 21 Aug 2026\n4:12 \(\+2:00\)\n\n/);
  assert.match(text, /https:\/\/example\.test$/);
  for (const leak of [/sold/i, /available/i, /criminal/i, /innocent/i, /\bA\d\b/]) {
    assert.ok(!leak.test(text), `the share text must not carry the answer -> ${text}`);
  }
  assert.equal(shareTime(0), '0:00');
  assert.equal(shareTime(59_600), '1:00');
  assert.equal(shareTime(3_725_000), '1:02:05');
});

test('a session records which squares were missed and which were hinted', () => {
  const theme = THEMES[0];
  const puzzle = generate({ seed: 'marks', difficulty: 4, tagSchema: theme.tagSchema });
  const s = new Session({ puzzle, now: () => 0 });

  // spend both hint levels; the cell hint must be recorded as the double it was
  const first = s.hint();
  assert.equal(first.kind, 'clue');
  const second = s.hint();
  assert.equal(second.kind, 'cell');
  assert.equal(s.hintedByCell[second.cell!], 2, 'a cell hint after a clue hint is a double');

  // answer that same square the wrong way round: a miss lands on that square only
  const wrong: State = second.state === 1 ? 0 : 1;
  assert.equal(s.mark(second.cell!, wrong).outcome, 'wrong');
  assert.equal(s.missesByCell[second.cell!], 1);
  assert.equal(s.missesByCell.filter(Boolean).length, 1, 'no other square is marked');

  // a refusal on an undecidable square is not a mistake, and marks nothing
  const undecided = [...Array(puzzle.n).keys()].find((i) => {
    const d = s.deduction();
    return !((d.forcedA | d.forcedB) >> i & 1) && !((s.known >> i) & 1);
  })!;
  const before = s.mistakes;
  assert.equal(s.mark(undecided, 1).outcome, 'not-deducible');
  assert.equal(s.mistakes, before, 'refusing a guess is not a mistake');
  assert.equal(s.missesByCell[undecided] ?? 0, 0);
});

test('a second hint press names a square instead of repeating the clue', () => {
  const theme = THEMES[0];
  const puzzle = generate({ seed: 'escalate', difficulty: 5, tagSchema: theme.tagSchema });
  const s = new Session({ puzzle, now: () => 0, hintBudget: 9 });
  const a = s.hint();
  const b = s.hint();
  assert.equal(a.kind, 'clue');
  assert.equal(b.kind, 'cell', 'pressing again must escalate, not resell the same clue');

  // making a move resets the ladder: the next press is a clue again
  s.mark(b.cell!, b.state!);
  assert.equal(s.hint().kind, 'clue');
});
