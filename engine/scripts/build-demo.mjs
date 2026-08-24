import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';

const res = await build({
  entryPoints: ['demo/app.ts'],
  bundle: true, format: 'esm', target: 'es2022',
  write: false, minify: false, legalComments: 'none',
});
const js = res.outputFiles[0].text;
const html = readFileSync('demo/template.html', 'utf8').replace('/*APP*/', () => js);
mkdirSync('demo/dist', { recursive: true });
// index.html is what a web host serves at "/"; clues-demo.html is the same bytes under a
// self-describing name, for handing someone a single file to open locally.
writeFileSync('demo/dist/index.html', html);
writeFileSync('demo/dist/clues-demo.html', html);
// Themes backed by real artwork load their files at runtime, so the pictures have to be
// in the published tree next to the page. The single-file build has no assets alongside
// it and falls back to the drawn tile.
if (existsSync('demo/assets')) {
  cpSync('demo/assets', 'demo/dist/assets', { recursive: true });
  console.log('demo/dist/assets    copied');
}
console.log(`demo/dist/index.html  ${(html.length / 1024).toFixed(0)} KB (self-contained)`);

/* ---- the standalone pages -------------------------------------------------
 * The article, the architecture write-up, the policies and the account page are all the
 * same shell: the game's stylesheet, lifted straight out of its template at build time so
 * a colour changed for the game cannot drift away from the pages around it, plus one
 * script and (for the prose pages) one body of text. */
const gameStyle = /<style>[\s\S]*?<\/style>/.exec(readFileSync('demo/template.html', 'utf8'));
if (!gameStyle) throw new Error('could not find the game stylesheet to share with the other pages');

async function bundle(entry) {
  const r = await build({
    entryPoints: [entry],
    bundle: true, format: 'esm', target: 'es2022',
    write: false, minify: false, legalComments: 'none',
  });
  return r.outputFiles[0].text;
}
const proseJs = await bundle('demo/how.ts');
const accountJs = await bundle('demo/account.ts');

for (const [out, template, article, js] of [
  ['demo/dist/how.html', 'demo/how-template.html', 'demo/how-article.html', proseJs],
  ['demo/dist/tech.html', 'demo/tech-template.html', 'demo/tech-article.html', proseJs],
  ['demo/dist/legal.html', 'demo/legal-template.html', 'demo/legal-article.html', proseJs],
  ['demo/dist/account.html', 'demo/account-template.html', null, accountJs],
]) {
  const text = readFileSync(template, 'utf8')
    .replace('<!--STYLE-->', () => gameStyle[0])
    .replace('<!--ARTICLE-->', () => (article ? readFileSync(article, 'utf8') : ''))
    .replace('/*HOW*/', () => js);
  writeFileSync(out, text);
  console.log(`${out.padEnd(21)} ${(text.length / 1024).toFixed(0)} KB`);
}
