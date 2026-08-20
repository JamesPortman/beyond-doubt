import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1320,height:1250}, deviceScaleFactor:2 });
await p.goto('file:///root/clues/engine/demo/dist/clues-demo.html');
await p.waitForTimeout(800);
// reveal a few so both states show
for (let i=0;i<7;i++){
  const idx = await p.$$eval('#board .cell', ns => ns.findIndex(n=>n.classList.contains('forced')));
  if (idx<0) break;
  for (const brush of [0,1]){
    await p.click(`#brush .chip.s${brush}`);
    const before = await p.$$eval('#board .cell', ns=>ns.filter(n=>n.classList.contains('known')).length);
    await p.click(`#board .cell:nth-child(${idx+1})`); await p.waitForTimeout(70);
    const after = await p.$$eval('#board .cell', ns=>ns.filter(n=>n.classList.contains('known')).length);
    if (after>before) break;
  }
}
await p.click('#board .cell:nth-child(3)', {button:'right'}); await p.waitForTimeout(120);
await p.screenshot({path:'shots/final-orchard.png'});
const games = ['guestlist','callboard','wall','record','plate19','coldopen'];
for (const g of games){
  await p.selectOption('#game', g); await p.waitForTimeout(450);
  await p.screenshot({path:`shots/final-${g}.png`, clip:{x:60,y:330,width:640,height:700}});
}
await p.selectOption('#game','guestlist'); await p.waitForTimeout(400);
await p.click('#actions .action:nth-child(5)'); await p.waitForTimeout(400);
await p.screenshot({path:'shots/final-tutorial.png'});
await b.close();
