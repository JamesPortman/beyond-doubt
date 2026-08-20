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
writeFileSync('demo/dist/clues-demo.html', html);
console.log(`demo/dist/clues-demo.html  ${(html.length / 1024).toFixed(0)} KB (self-contained)`);
