import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1240,height:1180}, deviceScaleFactor:2 });
await p.goto('http://localhost:8788/');
await p.waitForTimeout(700);
await p.click('#themes .theme-card:nth-child(1)');   // The Guest List
await p.waitForTimeout(600);
// reveal a few so both states are visible
for (let i=0;i<6;i++){
  const idx = await p.$$eval('#board .cell', ns => ns.findIndex(n=>n.classList.contains('forced')));
  if (idx<0) break;
  for (const brush of [0,1]){
    await p.click(`#brush .chip.s${brush}`);
    const before = await p.$$eval('#board .cell', ns=>ns.filter(n=>n.classList.contains('known')).length);
    await p.click(`#board .cell:nth-child(${idx+1})`); await p.waitForTimeout(120);
    const after = await p.$$eval('#board .cell', ns=>ns.filter(n=>n.classList.contains('known')).length);
    if (after>before) break;
  }
}
await p.screenshot({path:'shots/guestlist-en.png'});
await p.selectOption('#lang','pt'); await p.waitForTimeout(400);
console.log('pt:', await p.$$eval('#clues .clue-text', ns=>ns.slice(0,3).map(n=>n.textContent)));
await p.screenshot({path:'shots/guestlist-pt.png'});
await b.close();
