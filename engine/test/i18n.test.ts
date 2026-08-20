import test from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../src/core/generate.js';
import { Clue, A, B } from '../src/core/clue.js';
import { THEMES } from '../src/themes/all.js';
import { renderContext, renderClue } from '../src/themes/index.js';
import { tileArt } from '../src/render/art.js';
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
  const wall = THEMES.find((t) => t.id === 'wall')!;
  const puzzle = generate({ seed: 'agree2', difficulty: 3, tagSchema: wall.tagSchema });
  const pt = getLocale('pt'), es = getLocale('es');
  const c: Clue = { k: 'count', sel: { k: 'row', r: 0 }, state: B, cmp: 'eq', n: 2 };
  assert.equal(pt.clue(c, renderContext(wall, 'pt', puzzle)), 'Na fileira 1, exatamente dois quadros são falsos.');
  assert.equal(es.clue(c, renderContext(wall, 'es', puzzle)), 'En la fila 1, exactamente dos cuadros son falsos.');
  const one: Clue = { k: 'count', sel: { k: 'row', r: 0 }, state: B, cmp: 'eq', n: 1 };
  assert.match(pt.clue(one, renderContext(wall, 'pt', puzzle)), /exatamente um quadro é falso/);
  assert.match(es.clue(one, renderContext(wall, 'es', puzzle)), /exactamente un cuadro es falso/);
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
      assert.ok(base.startsWith('<svg') && base.endsWith('</svg>'), `${theme.id}: not an svg`);
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
