import { generate } from '../dist/core/generate.js';
import { makeGrid, popcount } from '../dist/core/grid.js';
const schema = { role: ['a','b','c','d'] };
for (const d of [1,3,5,7]) {
  const t0 = Date.now();
  const p = generate({ seed: 'smoke-'+d, difficulty: d, tagSchema: schema });
  console.log(`d${d} ${p.w}x${p.h} B=${popcount(p.solution)} clues=${p.clues.length} opening=${p.openingClues} path=${p.path.length} ${Date.now()-t0}ms`);
}
