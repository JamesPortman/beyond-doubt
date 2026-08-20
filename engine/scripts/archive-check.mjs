import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1300,height:1200}, deviceScaleFactor:2 });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{if(m.type()==='error' && !/ERR_CONNECTION_REFUSED/.test(m.text()))errs.push(m.text());});
await p.goto('http://localhost:8791/'); await p.waitForTimeout(700);
await p.click('#account .link'); await p.waitForTimeout(200);
await p.fill('.result.signin input[type=email]','james@portman.ca');
await p.fill('.result.signin input[type=text]','James');
await p.click('.result.signin .primary'); await p.waitForTimeout(400);
await p.click('.result.signin .primary'); await p.waitForTimeout(900);

console.log('modes:', await p.$$eval('#modes .tab', ns=>ns.map(n=>n.textContent)));
await p.click('#modes .tab:nth-child(2)'); await p.waitForTimeout(900);
console.log('archive days:', await p.$$eval('.arch-day', n=>n.length),
            '| months:', await p.$$eval('.arch-month', ns=>ns.map(n=>n.textContent)));
console.log('count line:', await p.$eval('.arch-count', n=>n.textContent));
await p.screenshot({path:'shots/archive-en.png'});

// play an older day from the grid
const days = await p.$$('.arch-day');
await days[6].click(); await p.waitForTimeout(900);
console.log('now playing:', await p.$eval('#diff', n=>n.textContent), '| ranked:', await p.$eval('#ranked', n=>n.textContent));
const solve = async () => {
  for (let i=0;i<40;i++){
    const done = await p.$$eval('#board .cell', ns => ns.every(n=>n.classList.contains('known')));
    if (done) return true;
    const idx = await p.$$eval('#board .cell', ns => ns.findIndex(n=>n.classList.contains('forced')));
    if (idx<0) return false;
    for (const brush of [0,1]){
      await p.click(`#brush .chip.s${brush}`);
      const before = await p.$$eval('#board .cell', ns=>ns.filter(n=>n.classList.contains('known')).length);
      await p.click(`#board .cell:nth-child(${idx+1})`); await p.waitForTimeout(80);
      const after = await p.$$eval('#board .cell', ns=>ns.filter(n=>n.classList.contains('known')).length);
      if (after>before) break;
    }
  }
  return false;
};
console.log('solved archived day:', await solve());
await p.waitForTimeout(400);
await p.click('#overlay button:last-child'); await p.waitForTimeout(600);
await p.click('#modes .tab:nth-child(2)'); await p.waitForTimeout(900);
console.log('after playing:', await p.$eval('.arch-count', n=>n.textContent),
            '| done cells:', await p.$$eval('.arch-day.done', n=>n.length));
await p.screenshot({path:'shots/archive-played.png'});
await p.selectOption('#lang','pt'); await p.waitForTimeout(600);
console.log('pt archive:', await p.$eval('.arch-title', n=>n.textContent), '|', await p.$$eval('.arch-month', ns=>ns.slice(0,2).map(n=>n.textContent)));
console.log(errs.length? 'ERRORS: '+errs.slice(0,4).join(' | '):'no console errors');
await b.close();
