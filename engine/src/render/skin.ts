import { Theme } from '../themes/index.js';

/** The entire visual difference between the six games is this object. Swapping a theme
 *  is a CSS-variable write, not a rebuild — which is the point of keeping theme as a
 *  skin layer from day one. */
export function skinVars(theme: Theme): Record<string, string> {
  const p = theme.palette;
  return {
    '--bg': p.bg,
    '--surface': p.surface,
    '--surface-alt': p.surfaceAlt,
    '--ink': p.ink,
    '--ink-soft': p.inkSoft,
    '--line': p.line,
    '--tile': p.tile,
    '--tile-ink': p.tileInk,
    '--tile-line': p.tileLine,
    '--accent': p.accent,
    '--state-a': p.stateA,
    '--state-b': p.stateB,
    '--glow': p.glow ?? 'transparent',
    '--font-display': theme.fonts.display,
    '--font-body': theme.fonts.body,
    '--font-mono': theme.fonts.mono,
  };
}

export function skinCss(theme: Theme, scope = ':root'): string {
  const vars = skinVars(theme);
  return `${scope}{\n${Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`;
}

export function applySkin(el: HTMLElement, theme: Theme): void {
  const vars = skinVars(theme);
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  el.dataset.theme = theme.id;
  el.dataset.mood = theme.palette.mood;
}
