import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1220,height:1000}, deviceScaleFactor:2 });
const errs = [];
p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
p.on('pageerror', e => errs.push('PAGEERROR '+e.message));
await p.goto('file:///root/clues/engine/demo/dist/clues-demo.html');
await p.waitForTimeout(700);

const cells = await p.$$eval('#board .cell', n=>n.length);
const clues = await p.$$eval('#clues .clue', n=>n.length);
console.log('cells', cells, 'clues', clues);

// play the whole board by clicking only forced cells, switching brush as needed
async function solve(){
  for (let step=0; step<40; step++){
    const done = await p.$$eval('#board .cell', ns => ns.every(n=>n.classList.contains('known')));
    if (done) return step;
    const idx = await p.$$eval('#board .cell', ns => ns.findIndex(n=>n.classList.contains('forced')));
    if (idx < 0) return -1;
    for (const brush of [0,1]) {
      await p.click(`#brush .chip.s${brush}`);
      const before = await p.$$eval('#board .cell', ns => ns.filter(n=>n.classList.contains('known')).length);
      await p.click(`#board .cell:nth-child(${idx+1})`);
      await p.waitForTimeout(30);
      const after = await p.$$eval('#board .cell', ns => ns.filter(n=>n.classList.contains('known')).length);
      if (after>before) break;
    }
  }
  return -1;
}
const steps = await solve();
console.log('solved in steps:', steps);
const overlay = await p.$eval('#overlay', n=>n.classList.contains('on'));
const score = await p.$eval('#overlay .score', n=>n.textContent).catch(()=>null);
console.log('overlay', overlay, '|', score);
await p.screenshot({path:'shots/solved.png'});

await p.click('#overlay button:last-child');
// language sweep on one theme
for (const lang of ['en','pt','es']){
  await p.selectOption('#lang', lang);
  await p.waitForTimeout(250);
  const first = await p.$eval('#clues .clue-text', n=>n.textContent);
  console.log(lang, '::', first);
}
// theme sweep with screenshots
const themeCount = await p.$$eval('#themes .theme-card', n=>n.length);
const ids = ['gallery','guestlist','orchard','coldopen','callboard','record','plate19'];
for (let i=0;i<themeCount;i++){
  await p.click(`#themes .theme-card:nth-child(${i+1})`);
  await p.waitForTimeout(420);
  await p.screenshot({path:`shots/theme-${ids[i]}.png`});
}
// weekly + split
await p.click('#themes .theme-card:nth-child(2)'); await p.waitForTimeout(300);
for (const m of ['Weekly','Semanal','Pistas']) {}
const tabs = await p.$$eval('#modes .tab', ns=>ns.map(n=>n.textContent));
console.log('modes', tabs);
await p.click('#modes .tab:nth-child(2)'); await p.waitForTimeout(400);
console.log('week days', await p.$$eval('#week .day', n=>n.length));
await p.screenshot({path:'shots/weekly.png'});
await p.click('#modes .tab:nth-child(4)'); await p.waitForTimeout(400);
const pcount = await p.$$eval('#players .tab', n=>n.length);
const cluesP1 = await p.$$eval('#clues .clue', n=>n.length);
const p1txt = await p.$$eval('#clues .clue-text', ns=>ns.map(n=>n.textContent));
await p.click('#players .tab:nth-child(3)'); await p.waitForTimeout(200);
const cluesP2 = await p.$$eval('#clues .clue', n=>n.length);
const p2txt = await p.$$eval('#clues .clue-text', ns=>ns.map(n=>n.textContent));
const shared = p1txt.filter(t=>p2txt.includes(t)).length;
console.log('hands differ:', JSON.stringify(p1txt)!==JSON.stringify(p2txt), '| shared(opening) =', shared);
console.log('split players', pcount, 'p1 clues', cluesP1, 'p2 clues', cluesP2);
await p.screenshot({path:'shots/split.png'});

console.log(errs.length? 'CONSOLE ERRORS:\n'+errs.slice(0,5).join('\n') : 'no console errors');
await b.close();

// play a few forced cells in split mode, then confirm the hands actually diverge
const b2 = await chromium.launch();
const q = await b2.newPage({viewport:{width:1220,height:1000}});
await q.goto('file:///root/clues/engine/demo/dist/clues-demo.html');
await q.waitForTimeout(500);
await q.click('#modes .tab:nth-child(4)'); await q.waitForTimeout(400);
for (let i=0;i<8;i++){
  const idx = await q.$$eval('#board .cell', ns => ns.findIndex(n=>n.classList.contains('forced')));
  if (idx<0) break;
  for (const brush of [0,1]) {
    await q.click(`#brush .chip.s${brush}`);
    const before = await q.$$eval('#board .cell', ns=>ns.filter(n=>n.classList.contains('known')).length);
    await q.click(`#board .cell:nth-child(${idx+1})`); await q.waitForTimeout(25);
    const after = await q.$$eval('#board .cell', ns=>ns.filter(n=>n.classList.contains('known')).length);
    if (after>before) break;
  }
}
const h1 = await q.$$eval('#clues .clue-text', ns=>ns.map(n=>n.textContent));
await q.click('#players .tab:nth-child(3)'); await q.waitForTimeout(200);
const h2 = await q.$$eval('#clues .clue-text', ns=>ns.map(n=>n.textContent));
const onlyP1 = h1.filter(t=>!h2.includes(t)).length, onlyP2 = h2.filter(t=>!h1.includes(t)).length;
console.log(`mid-game split: p1=${h1.length} p2=${h2.length} privateToP1=${onlyP1} privateToP2=${onlyP2}`);
await q.screenshot({path:'shots/split-midgame.png'});
await b2.close();
