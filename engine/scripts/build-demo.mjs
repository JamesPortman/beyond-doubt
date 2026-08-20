import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

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
console.log(`demo/dist/index.html  ${(html.length / 1024).toFixed(0)} KB (self-contained)`);
