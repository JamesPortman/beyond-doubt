import { generate } from '../dist-test/src/core/generate.js';
import { Session } from '../dist-test/src/core/session.js';
import { bits } from '../dist-test/src/core/grid.js';
import { THEMES } from '../dist-test/src/themes/all.js';
import { renderContext, renderClue } from '../dist-test/src/themes/index.js';
import { getLocale } from '../dist-test/src/i18n/index.js';
import '../dist-test/src/i18n/locales.js';

let boards = 0, clues = 0, worst = 0, fails = [];
const t0 = Date.now();
for (const theme of THEMES) {
  for (let d = 1; d <= 7; d++) {
    for (let s = 0; s < 6; s++) {
      const seed = `fuzz|${theme.id}|${d}|${s}`;
      let p;
      try { p = generate({ seed, difficulty: d, tagSchema: theme.tagSchema }); }
      catch (e) { fails.push(`GEN ${seed}: ${e.message}`); continue; }
      boards++;
      const t1 = Date.now();
      const sess = new Session({ puzzle: p });
      let guard = 0;
      while (!sess.solved) {
        if (guard++ > 60) { fails.push(`STALL ${seed}`); break; }
        const dd = sess.deduction();
        const f = dd.forcedA | dd.forcedB;
        if (!f) { fails.push(`GUESS-REQUIRED ${seed}`); break; }
        const c = bits(f)[0];
        const r = sess.mark(c, (p.solution >> c) & 1);
        if (r.outcome !== 'ok') { fails.push(`ILLEGAL ${seed} ${r.outcome}`); break; }
      }
      if (sess.knownB !== p.solution && sess.solved) fails.push(`WRONG ${seed}`);
      worst = Math.max(worst, Date.now() - t1);
      for (const code of ['en','pt','es']) {
        const loc = getLocale(code), ctx = renderContext(theme, code, p);
        p.clues.forEach((pc,i) => {
          const str = renderClue(loc, theme, ctx, pc.clue, i);
          clues++;
          if (!str || /undefined|NaN/.test(str)) fails.push(`RENDER ${seed} ${code}: ${str}`);
        });
      }
    }
  }
}
console.log(`boards=${boards} clueRenders=${clues} slowestSolve=${worst}ms total=${((Date.now()-t0)/1000).toFixed(1)}s`);
console.log(fails.length ? 'FAILURES:\n' + fails.slice(0,10).join('\n') : 'no failures');
