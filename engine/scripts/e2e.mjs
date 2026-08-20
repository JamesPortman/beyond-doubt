import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1280,height:1060}, deviceScaleFactor:2 });
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await p.goto('http://localhost:8788/');
await p.waitForTimeout(800);
console.log('themes shown:', await p.$$eval('#themes .theme-card', n=>n.length));
console.log('status before sign-in:', await p.$eval('#ranked', n=>n.textContent), '|', await p.$eval('#account .who', n=>n.textContent));

// sign in through the UI
await p.click('#account .link');
await p.waitForTimeout(200);
await p.fill('.result.signin input[type=email]', 'james@portman.ca');
await p.fill('.result.signin input[type=text]', 'James');
await p.click('.result.signin .primary');
await p.waitForTimeout(400);
const note = await p.$eval('.result.signin .streak', n=>n.textContent);
console.log('code stage:', note);
await p.click('.result.signin .primary');
await p.waitForTimeout(900);
console.log('status after sign-in:', await p.$eval('#ranked', n=>n.textContent), '|', await p.$eval('#account .who', n=>n.textContent));
await p.screenshot({path:'shots/online-start.png'});

// verify the browser was never sent the answer
const leak = await p.evaluate(async ()=>{
  const t = localStorage.getItem('clues.token');
  const r = await fetch('/api/play/start',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+t},body:JSON.stringify({mode:'daily',themeId:'orchard'})});
  const j = await r.json();
  const s = JSON.stringify(j);
  return { hasSolution: /"solution"/.test(s), hasSeed: /"seed"/.test(s), hasPath: /"path"/.test(s), clues: j.view.clues.length };
});
console.log('wire check:', JSON.stringify(leak));

// play the daily board online, forced cell by forced cell
async function solve(page){
  for (let step=0; step<60; step++){
    const done = await page.$$eval('#board .cell', ns => ns.every(n=>n.classList.contains('known')));
    if (done) return step;
    const idx = await page.$$eval('#board .cell', ns => ns.findIndex(n=>n.classList.contains('forced')));
    if (idx<0) return -1;
    let moved=false;
    for (const brush of [0,1]){
      await page.click(`#brush .chip.s${brush}`);
      const before = await page.$$eval('#board .cell', ns=>ns.filter(n=>n.classList.contains('known')).length);
      await page.click(`#board .cell:nth-child(${idx+1})`);
      await page.waitForTimeout(90);
      const after = await page.$$eval('#board .cell', ns=>ns.filter(n=>n.classList.contains('known')).length);
      if (after>before){moved=true;break;}
    }
    if(!moved) return -1;
  }
  return -1;
}
const steps = await solve(p);
console.log('online solve steps:', steps);
await p.waitForTimeout(500);
console.log('result card:', await p.$eval('#overlay .score', n=>n.textContent).catch(()=>'none'),
            '| rank:', await p.$$eval('#overlay .perfect', ns=>ns.map(n=>n.textContent).join(' / ')).catch(()=>''));
await p.screenshot({path:'shots/online-result.png'});

// leaderboard is now a real server row
await p.click('#overlay button:last-child'); await p.waitForTimeout(700);
console.log('board rows:', await p.$$eval('#lbrows .lbrow', ns=>ns.map(n=>n.textContent)));
console.log('week rows:', await p.$$eval('#wkrows .lbrow', ns=>ns.map(n=>n.textContent)));

// replay the same edition: must come back unranked
await p.click('#modes .tab:nth-child(1)'); await p.waitForTimeout(700);
console.log('replay status:', await p.$eval('#ranked', n=>n.textContent));
// weekly view: future days locked
await p.click('#modes .tab:nth-child(2)'); await p.waitForTimeout(700);
console.log('weekly locked days:', await p.$$eval('#week .day.locked', n=>n.length), 'of', await p.$$eval('#week .day', n=>n.length));
await p.screenshot({path:'shots/online-weekly.png'});
// language switch mid-board keeps progress
await p.click('#modes .tab:nth-child(1)'); await p.waitForTimeout(600);
await p.selectOption('#lang','pt'); await p.waitForTimeout(400);
console.log('pt clue:', await p.$eval('#clues .clue-text', n=>n.textContent));
await p.selectOption('#lang','es'); await p.waitForTimeout(300);
console.log('es clue:', await p.$eval('#clues .clue-text', n=>n.textContent));
await p.screenshot({path:'shots/online-es.png'});
console.log(errs.length? 'ERRORS:\n'+errs.slice(0,6).join('\n'):'no console errors');
await b.close();
