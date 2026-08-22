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
// Static companion pages ride along with the build rather than being a second deploy.
if (existsSync('demo/how.html')) {
  cpSync('demo/how.html', 'demo/dist/how.html');
  console.log('demo/dist/how.html    copied');
}
if (existsSync('demo/assets')) {
  cpSync('demo/assets', 'demo/dist/assets', { recursive: true });
  console.log('demo/dist/assets    copied');
}
console.log(`demo/dist/index.html  ${(html.length / 1024).toFixed(0)} KB (self-contained)`);
