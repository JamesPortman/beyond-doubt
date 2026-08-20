import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES } from '../src/themes/all.js';
import { renderContext } from '../src/themes/index.js';
import { generate } from '../src/core/generate.js';
import { Clue, A, B } from '../src/core/clue.js';
import { getLocale, TermId, Term } from '../src/i18n/index.js';
import { ALL_LOCALES } from '../src/i18n/locales.js';
import { termsForClue, selectorSize } from '../src/i18n/glossary.js';
import {
  DEFAULT_SETTINGS, Settings, sanitize, resolvePalette, cssVars,
  contrast, luminance, Appearance, ColorMode,
} from '../src/render/settings.js';

const APPEARANCES: Appearance[] = ['theme', 'dark', 'light'];
const MODES: ColorMode[] = ['normal', 'contrast', 'colorblind'];
const HEX = /^#[0-9a-f]{6}$/i;

test('settings survive garbage in storage', () => {
  const junk = sanitize({ font: 'comic-sans' as any, appearance: 42 as any, tileArt: 'yes' as any });
  assert.deepEqual(junk, DEFAULT_SETTINGS, 'unknown values fall back to defaults');
  assert.deepEqual(sanitize({}), DEFAULT_SETTINGS);
  const kept = sanitize({ ...DEFAULT_SETTINGS, font: 'readable', colorMode: 'colorblind' });
  assert.equal(kept.font, 'readable');
  assert.equal(kept.colorMode, 'colorblind');
});

/** The whole point of deriving appearance instead of hand-authoring it: a new theme
 *  inherits every accessibility mode, and this proves none of them can go unreadable. */
test('every theme stays readable in every appearance and colour mode', () => {
  for (const theme of THEMES) {
    for (const appearance of APPEARANCES) {
      for (const colorMode of MODES) {
        const s: Settings = { ...DEFAULT_SETTINGS, appearance, colorMode };
        const p = resolvePalette(theme, s);
        const where = `${theme.id}/${appearance}/${colorMode}`;
        for (const [k, v] of Object.entries(p)) {
          if (k === 'mood' || k === 'glow') continue;
          assert.match(String(v), HEX, `${where}: ${k} is not a hex colour (${v})`);
        }
        assert.ok(contrast(p.ink, p.bg) >= 4.5, `${where}: body text ${contrast(p.ink, p.bg).toFixed(2)}:1`);
        assert.ok(contrast(p.ink, p.surface) >= 4.5, `${where}: panel text ${contrast(p.ink, p.surface).toFixed(2)}:1`);
        assert.ok(contrast(p.tileInk, p.tile) >= 4.5, `${where}: tile caption ${contrast(p.tileInk, p.tile).toFixed(2)}:1`);
        assert.ok(contrast(p.inkSoft, p.bg) >= 3, `${where}: secondary text ${contrast(p.inkSoft, p.bg).toFixed(2)}:1`);
        assert.equal(p.mood, appearance === 'theme' ? theme.palette.mood : appearance);
      }
    }
  }
});

test('high contrast really is higher contrast', () => {
  for (const theme of THEMES) {
    const normal = resolvePalette(theme, { ...DEFAULT_SETTINGS, colorMode: 'normal' });
    const high = resolvePalette(theme, { ...DEFAULT_SETTINGS, colorMode: 'contrast' });
    assert.ok(contrast(high.ink, high.bg) >= contrast(normal.ink, normal.bg),
      `${theme.id}: high contrast made it worse`);
    assert.ok(contrast(high.ink, high.bg) >= 12, `${theme.id}: only ${contrast(high.ink, high.bg).toFixed(1)}:1`);
  }
});

test('colour-blind mode separates the two states without relying on hue alone', () => {
  for (const theme of THEMES) {
    const p = resolvePalette(theme, { ...DEFAULT_SETTINGS, colorMode: 'colorblind' });
    // Okabe-Ito blue/orange: distinguishable under deuteranopia, protanopia and tritanopia
    assert.equal(p.stateA.toLowerCase(), '#0072b2');
    assert.equal(p.stateB.toLowerCase(), '#e69f00');
    // and they differ in lightness too, so the pair survives being printed in greyscale
    const dl = Math.abs(luminance(p.stateA) - luminance(p.stateB));
    assert.ok(dl > 0.18, `${theme.id}: states differ by only ${dl.toFixed(3)} in luminance`);
  }
});

test('cssVars covers everything the stylesheet needs', () => {
  const needed = ['--bg', '--surface', '--surface-alt', '--ink', '--ink-soft', '--line',
    '--accent', '--state-a', '--state-b', '--tile', '--tile-ink', '--tile-line',
    '--font-display', '--font-body', '--font-mono', '--font-scale', '--motion',
    '--tag-left', '--tag-right'];
  for (const theme of THEMES) {
    const v = cssVars(theme, DEFAULT_SETTINGS);
    for (const k of needed) assert.ok(v[k], `${theme.id}: missing ${k}`);
  }
  const left = cssVars(THEMES[0], { ...DEFAULT_SETTINGS, tagSide: 'left' });
  assert.equal(left['--tag-left'], '6px');
  assert.equal(left['--tag-right'], 'auto');
  assert.equal(cssVars(THEMES[0], { ...DEFAULT_SETTINGS, reduceMotion: true })['--motion'], '0s');
});

/* ----------------------------- Inspect ----------------------------- */

const KINDS: Clue[] = [
  { k: 'count', sel: { k: 'all' }, state: B, cmp: 'eq', n: 7 },
  { k: 'count', sel: { k: 'row', r: 1 }, state: B, cmp: 'eq', n: 2 },
  { k: 'count', sel: { k: 'col', c: 2 }, state: A, cmp: 'atLeast', n: 1 },
  { k: 'count', sel: { k: 'neighbors', i: 5 }, state: B, cmp: 'atMost', n: 3 },
  { k: 'count', sel: { k: 'ortho', i: 6 }, state: B, cmp: 'none', n: 0 },
  { k: 'count', sel: { k: 'corners' }, state: A, cmp: 'all', n: 4 },
  { k: 'count', sel: { k: 'edges' }, state: B, cmp: 'eq', n: 3 },
  { k: 'count', sel: { k: 'interior' }, state: B, cmp: 'eq', n: 1 },
  { k: 'count', sel: { k: 'between', i: 0, j: 3 }, state: B, cmp: 'none', n: 0 },
  { k: 'compare', a: { k: 'row', r: 0 }, b: { k: 'row', r: 2 }, state: B },
  { k: 'implies', i: 1, si: B, j: 9, sj: A },
  { k: 'exactlyOneOf', i: 2, j: 8, state: B },
  { k: 'sameState', i: 3, j: 7 },
  { k: 'differentState', i: 4, j: 11 },
  { k: 'nearest', i: 6, state: B, d: 2 },
  { k: 'connected', state: B },
];

test('Inspect explains every clue kind, in every theme, in every language', () => {
  for (const theme of THEMES) {
    const puzzle = generate({ seed: `inspect-${theme.id}`, difficulty: 4, tagSchema: theme.tagSchema });
    const tagKey = Object.keys(theme.tagSchema)[0];
    const clues: Clue[] = [...KINDS,
      { k: 'count', sel: { k: 'tag', key: tagKey, value: theme.tagSchema[tagKey][0] }, state: B, cmp: 'eq', n: 1 },
      { k: 'uniqueMost', key: tagKey, value: theme.tagSchema[tagKey][0], state: B },
    ];
    for (const code of ALL_LOCALES) {
      const loc = getLocale(code);
      const ctx = renderContext(theme, code, puzzle);
      for (const c of clues) {
        const s = loc.explain(c, ctx);
        const where = `${theme.id}/${code}/${c.k}`;
        assert.ok(s.length > 20, `${where}: explanation too short -> ${s}`);
        assert.ok(!/undefined|NaN|\[object/.test(s), `${where}: ${s}`);
        assert.ok(/[.!]$/.test(s), `${where}: no terminal punctuation -> ${s}`);
        assert.equal(s[0], s[0].toUpperCase(), `${where}: not capitalised -> ${s}`);
        assert.notEqual(s, loc.clue(c, ctx), `${where}: explanation just repeats the clue`);
      }
    }
  }
});

test('every clue names the terms it uses, and every term is defined in every language', () => {
  const ids = new Set<TermId>();
  for (const c of KINDS) {
    const terms = termsForClue(c);
    assert.ok(terms.length >= 1, `${c.k}: no terms`);
    assert.ok(terms.includes('truth'), `${c.k}: the truth rule always applies`);
    terms.forEach((t) => ids.add(t));
  }
  ids.add('group'); ids.add('most');
  for (const code of ALL_LOCALES) {
    const g = getLocale(code).glossary;
    for (const id of ids) {
      const e: Term | undefined = g[id];
      assert.ok(e && e.term && e.def, `${code}: glossary is missing "${id}"`);
      assert.ok(e.def.length > 25, `${code}/${id}: definition is too thin -> ${e.def}`);
    }
    // no term left undefined anywhere in the record
    for (const [id, e] of Object.entries(g)) {
      assert.ok(e.term && e.def, `${code}: empty glossary entry ${id}`);
    }
  }
});

test('selector sizes match the geometry Inspect claims', () => {
  assert.equal(selectorSize({ k: 'all' }, 4, 5), 20);
  assert.equal(selectorSize({ k: 'row', r: 0 }, 4, 5), 4);
  assert.equal(selectorSize({ k: 'col', c: 0 }, 4, 5), 5);
  assert.equal(selectorSize({ k: 'corners' }, 4, 5), 4);
  assert.equal(selectorSize({ k: 'edges' }, 4, 5), 14, 'matches the 14 the original quotes for a 4x5');
  assert.equal(selectorSize({ k: 'interior' }, 4, 5), 6);
  assert.equal(selectorSize({ k: 'neighbors', i: 0 }, 4, 5), 3, 'a corner has three neighbours');
  assert.equal(selectorSize({ k: 'neighbors', i: 5 }, 4, 5), 8, 'an interior tile has eight');
  assert.equal(selectorSize({ k: 'ortho', i: 0 }, 4, 5), 2);
  assert.equal(selectorSize({ k: 'between', i: 0, j: 3 }, 4, 5), 2);
  assert.equal(selectorSize({ k: 'between', i: 0, j: 10 }, 4, 5), 1, 'diagonal, endpoints excluded');
  assert.equal(selectorSize({ k: 'between', i: 0, j: 6 }, 4, 5), 0, 'not collinear');
  assert.equal(selectorSize({ k: 'tag', key: 'x', value: 'y' }, 4, 5), null);
});

/** Every nested string block, not just the ones that existed when this test was written —
 *  the check walks whatever English declares, so a new block cannot ship half-translated. */
test('every UI string is present and non-empty in every language', () => {
  const en = getLocale('en').ui as unknown as Record<string, unknown>;
  const blocks = Object.keys(en).filter((k) => typeof en[k] === 'object' && !Array.isArray(en[k]));
  assert.ok(blocks.length >= 5, `expected several nested blocks, found ${blocks.join(',')}`);
  for (const code of ALL_LOCALES) {
    const ui = getLocale(code).ui as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(en)) {
      if (typeof v === 'string') {
        assert.ok(typeof ui[k] === 'string' && (ui[k] as string).trim(), `${code}: missing ui.${k}`);
      } else if (Array.isArray(v)) {
        assert.equal((ui[k] as unknown[]).length, v.length, `${code}: ui.${k} has the wrong length`);
        for (const item of ui[k] as string[]) assert.ok(item.trim(), `${code}: blank entry in ui.${k}`);
      } else {
        const mine = ui[k] as Record<string, unknown>;
        assert.ok(mine, `${code}: missing whole block ui.${k}`);
        for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
          const got = mine[sk];
          if (Array.isArray(sv)) {
            assert.equal((got as unknown[])?.length, sv.length, `${code}: ui.${k}.${sk} has the wrong length`);
            for (const item of got as string[]) assert.ok(item.trim(), `${code}: blank entry in ui.${k}.${sk}`);
          } else {
            assert.ok(typeof got === 'string' && (got as string).trim(), `${code}: missing ui.${k}.${sk}`);
          }
        }
      }
    }
  }
});
