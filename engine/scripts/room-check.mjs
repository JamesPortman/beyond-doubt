import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const mk = async (name) => {
  const ctx = await b.newContext({ viewport:{width:1280,height:1150} });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8790/'); await p.waitForTimeout(600);
  await p.click('#account .link'); await p.waitForTimeout(200);
  await p.fill('.result.signin input[type=email]', `${name}@x.co`);
  await p.fill('.result.signin input[type=text]', name);
  await p.click('.result.signin .primary'); await p.waitForTimeout(400);
  await p.click('.result.signin .primary'); await p.waitForTimeout(900);
  return p;
};
const ana = await mk('Ana');
const bo  = await mk('Bo');

await ana.click('#modes .tab:nth-child(5)'); await ana.waitForTimeout(1200);
const code = (await ana.$eval('#room .panel-head', n=>n.textContent)).split('·')[1].trim();
console.log('room code:', code);

// Bo joins by link
await bo.goto(`http://localhost:8790/?room=${code}`); await bo.waitForTimeout(1500);
console.log('bo sees players:', await bo.$$eval('#room .player-row .player-name', ns=>ns.map(n=>n.textContent)));

// Ana solves several tiles, Bo one
const play = async (page, n) => {
  for (let i=0;i<n;i++){
    const idx = await page.$$eval('#board .cell', ns => ns.findIndex(x=>x.classList.contains('forced')));
    if (idx<0) break;
    for (const brush of [0,1]){
      await page.click(`#brush .chip.s${brush}`);
      const before = await page.$$eval('#board .cell', ns=>ns.filter(x=>x.classList.contains('known')).length);
      await page.click(`#board .cell:nth-child(${idx+1})`); await page.waitForTimeout(90);
      const after = await page.$$eval('#board .cell', ns=>ns.filter(x=>x.classList.contains('known')).length);
      if (after>before) break;
    }
  }
};
await play(ana, 6);
await play(bo, 2);
await ana.hover('#board .cell:nth-child(9)');
await bo.waitForTimeout(3200);
console.log('bo sees progress:', await bo.$$eval('#room .player-row', ns=>ns.map(n=>n.innerText.replace(/\n/g,' '))));
console.log('markers on bo board:', await bo.$$eval('#board .player-marks', ns=>ns.length));
await bo.screenshot({path:'shots/room-bo.png'});
await ana.waitForTimeout(2800);
console.log('ana sees progress:', await ana.$$eval('#room .player-row', ns=>ns.map(n=>n.innerText.replace(/\n/g,' '))));
await ana.screenshot({path:'shots/room-ana.png'});
await b.close();
