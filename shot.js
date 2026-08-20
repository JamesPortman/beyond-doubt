const {chromium} = require('/usr/lib/node_modules/playwright-core' in {} ? '' : 'playwright');
(async()=>{
const b = await chromium.launch();
const p = await b.newPage({viewport:{width:1180,height:1400},deviceScaleFactor:2});
await p.goto('file:///root/clues/clues-themes.html');
await p.waitForTimeout(600);
await p.screenshot({path:'preview.png', fullPage:true});
await b.close();
})();
