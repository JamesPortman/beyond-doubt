import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1300,height:1150}, deviceScaleFactor:2 });
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
p.on('console',m=>{if(m.type()==='error' && !/ERR_CONNECTION_REFUSED/.test(m.text()))errs.push(m.text());});
await p.goto('file:///root/clues/engine/demo/dist/clues-demo.html');
await p.waitForTimeout(800);

console.log('game dropdown options:', await p.$$eval('#game option', ns=>ns.map(n=>n.textContent)));

// --- settings panel
await p.click('#actions .action:nth-child(4)'); await p.waitForTimeout(300);
const rows = await p.$$eval('.setting-row', ns=>ns.map(n=>n.querySelector('.setting-label').textContent));
console.log('settings rows:', rows.length, rows.join(' | '));
await p.screenshot({path:'shots/settings-en.png'});

// change a few and confirm they take effect (find rows by their label, not by index)
const setByLabel = async (label, value) => {
  const idx = await p.$$eval('.setting-row', (ns, l) => ns.findIndex(n => n.querySelector('.setting-label').textContent === l), label);
  await p.selectOption(`.setting-row:nth-child(${idx+1}) select`, value);
};
await setByLabel('Result tag side', 'left');
await setByLabel('Appearance', 'light');
await setByLabel('Colour mode', 'colorblind');
await p.waitForTimeout(300);
console.log('after change ->',
  'color-mode:', await p.getAttribute('body','data-color-mode'),
  '| bg:', await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()),
  '| stateB:', await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--state-b').trim()),
  '| tagRight:', await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--tag-right').trim()));
await p.screenshot({path:'shots/settings-a11y.png'});
// reset
await p.click('.settings-card button:last-child'); await p.waitForTimeout(300);
console.log('after reset -> stateB:', await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--state-b').trim()));
await p.click('.settings-card .primary'); await p.waitForTimeout(200);

// --- inspect
await p.click('#actions .action:nth-child(2)'); await p.waitForTimeout(300);
console.log('inspect idle:', (await p.$eval('#inspect', n=>n.textContent)).slice(0,80));
await p.click('#clues .clue'); await p.waitForTimeout(300);
const insp = await p.$eval('#inspect', n=>n.innerText);
console.log('--- inspect (clue) ---\n'+insp.split('\n').filter(Boolean).slice(0,10).join('\n'));
console.log('dimmed cells:', await p.$$eval('#board .cell.dimmed', n=>n.length), 'of', await p.$$eval('#board .cell', n=>n.length));
await p.screenshot({path:'shots/inspect-en.png'});
// inspect a tile
await p.click('#board .cell:nth-child(1)'); await p.waitForTimeout(300);
console.log('tile inspect lists', await p.$$eval('#inspect .clue', n=>n.length), 'clue(s) mentioning it');
// portuguese
await p.click('#actions .action:nth-child(4)'); await p.waitForTimeout(200);
await setByLabel('Language','pt'); await p.waitForTimeout(400);
const ptRows = await p.$$eval('.setting-row', ns=>ns.map(n=>n.querySelector('.setting-label').textContent));
console.log('pt settings rows:', ptRows.join(' | '));
await p.screenshot({path:'shots/settings-pt.png'});
await p.click('.settings-card .primary'); await p.waitForTimeout(200);
await p.click('#clues .clue'); await p.waitForTimeout(300);
console.log('--- inspeccionar (pt) ---\n'+(await p.$eval('#inspect', n=>n.innerText)).split('\n').filter(Boolean).slice(0,8).join('\n'));
await p.screenshot({path:'shots/inspect-pt.png'});
console.log(errs.length? 'ERRORS:\n'+errs.slice(0,5).join('\n'):'no console errors');
await b.close();
