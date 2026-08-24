/** The article page. It is static text, so the only thing this script does is make it
 *  match the game the reader just came from: the same theme's palette, the same
 *  appearance and font settings, and the same language — all read from the storage the
 *  game already writes, so nothing has to be configured twice. */
import { allThemes, getTheme, LocaleCode, ALL_LOCALES, loadSettings, cssVars } from '../src/index.js';
import '../src/themes/all.js';

const DEFAULTS = { themeId: 'gallery', locale: 'en' as LocaleCode };
const prefs = (() => {
  try { return { ...DEFAULTS, ...JSON.parse(globalThis.localStorage?.getItem('clues.prefs.v4') ?? '{}') }; }
  catch { return { ...DEFAULTS }; }
})() as { themeId: string; locale: LocaleCode };

const BACK = { en: '← Back to the game', pt: '← Voltar ao jogo', es: '← Volver al juego' };
const TITLE = { en: 'How Beyond Doubt was built', pt: 'Como o Beyond Doubt foi construído', es: 'Cómo se construyó Beyond Doubt' };

function paint(): void {
  // The theme may have been retired since this browser last stored one.
  const theme = getTheme(prefs.themeId) ?? getTheme(allThemes()[0].id)!;
  const settings = loadSettings();
  const root = document.documentElement;
  for (const [k, v] of Object.entries(cssVars(theme, settings))) root.style.setProperty(k, v);
  document.body.className = `skin-${theme.id}`;

  const locale = ALL_LOCALES.includes(prefs.locale) ? prefs.locale : 'en';
  const bodies = Array.from(document.querySelectorAll<HTMLElement>('.how-body'));
  for (const n of bodies) n.hidden = n.dataset.lang !== locale;
  // The same script serves the legal page, which is written once and in English only —
  // so the language machinery applies itself only where there is something to switch.
  if (bodies.length) { root.lang = locale; document.title = TITLE[locale]; }
  const back = document.getElementById('back');
  if (back) back.textContent = BACK[locale];
  const sel = document.getElementById('lang') as HTMLSelectElement | null;
  if (sel) sel.value = locale;
}

const sel = document.getElementById('lang') as HTMLSelectElement | null;
if (sel) {
  sel.onchange = () => {
    prefs.locale = sel.value as LocaleCode;
    // Write it back, so changing language here changes it in the game too. One setting.
    try {
      const raw = JSON.parse(globalThis.localStorage?.getItem('clues.prefs.v4') ?? '{}');
      globalThis.localStorage?.setItem('clues.prefs.v4', JSON.stringify({ ...raw, locale: prefs.locale }));
    } catch { /* private mode: the choice just does not persist */ }
    paint();
  };
}
paint();
