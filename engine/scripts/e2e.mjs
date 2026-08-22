/** End-to-end checks: a real browser, against a real server, asserting behaviour that
 *  unit tests cannot see — that the board is clickable, that an illegal move is refused
 *  rather than penalised, that the clue feed grows at the top, and that a run finishes.
 *
 *  Run with: npm run e2e   (needs `npx playwright install chromium` once)
 *
 *  Every check is an assertion, not a screenshot. A screenshot tells you something
 *  changed; an assertion tells you what was supposed to be true and no longer is. */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameServer } from '../dist/net/server.js';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.E2E_PORT ?? 8123);

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('playwright is not installed — run: npm i -D playwright && npx playwright install chromium'); process.exit(1); }

const srv = new GameServer({
  dbPath: join(mkdtempSync(join(tmpdir(), 'bd-e2e-')), 'e2e.db'),
  dev: true,
  minMoveIntervalMs: 0,
  staticDir: join(here, '..', 'demo', 'dist'),
  adminToken: 'e2e-admin-token-long-enough-to-count',
});
const http = srv.listen(PORT);
const base = `http://127.0.0.1:${PORT}/`;

const results = [];
let failed = 0;
async function check(name, fn) {
  try { await fn(); results.push(`  ok   ${name}`); }
  catch (e) { failed++; results.push(`  FAIL ${name}\n         ${e.message.split('\n')[0]}`); }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 1500 }, deviceScaleFactor: 2 });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.goto(base);
await page.waitForSelector('.cell', { timeout: 15000 });

const cells = () => page.$$eval('.cell', (n) => n.length);
const known = () => page.$$eval('.cell.known', (n) => n.length);
const dismiss = async () => {
  if (await page.$('.sheet.refusal')) { await page.click('.refuse-actions .primary'); await page.waitForTimeout(150); }
  if (await page.$('.sheet-close button')) { await page.click('.sheet-close button'); await page.waitForTimeout(120); }
};

await check('the board renders a full grid of cells', async () => {
  assert.ok(await cells() >= 12, `only ${await cells()} cells`);
});

await check('opening clues are in the feed before anything is revealed', async () => {
  // Clues that a square unlocked sit on that square's tile; the ones you start with have
  // no square yet, so the feed is the only place they can be.
  const feed = await page.$$eval('#clues .clue', (x) => x.map((c) => (c.textContent ?? '').trim()));
  assert.ok(feed.length >= 1, 'the opening board hands the player no clues at all');
  assert.ok(feed.every((t) => t.length > 5), 'a clue rendered empty — a missing translation string');
  assert.equal(await page.$$eval('.cell.known', (x) => x.length), 0, 'nothing should be revealed yet');
});

await check('tapping a cell opens the choice sheet rather than flipping it blind', async () => {
  await dismiss();
  await page.locator('.cell:not(.known)').first().click();
  await page.waitForTimeout(200);
  const choices = await page.$$eval('.sheet-choices button', (b) => b.length);
  assert.equal(choices, 2, 'the sheet should offer exactly the two states');
  await dismiss();
});

await check('an undecidable square is refused, and the refusal explains itself', async () => {
  // Walk the board trying both states everywhere; the first refusal is what we want to see.
  let sawRefusal = false;
  const idx = await page.$$eval('.cell', (n) => n.map((c, i) => (c.classList.contains('known') ? -1 : i)).filter((i) => i >= 0));
  for (const i of idx.slice(0, 6)) {
    await dismiss();
    await page.locator('.cell').nth(i).click();
    await page.waitForTimeout(150);
    const btns = await page.$$('.sheet-choices button');
    if (!btns.length) { await dismiss(); continue; }
    await btns[0].click();
    await page.waitForTimeout(250);
    if (await page.$('.sheet.refusal')) {
      const text = await page.$eval('.sheet.refusal', (n) => n.textContent ?? '');
      assert.ok(text.trim().length > 20, 'the refusal says nothing useful');
      assert.ok(!/solution|answer is/i.test(text), 'a refusal must not leak the answer');
      sawRefusal = true;
      break;
    }
  }
  await dismiss();
  assert.ok(sawRefusal, 'no move was ever refused — the no-guess guard may not be wired to the UI');
});

await check('mistakes never end the game: the board is still playable after a refusal', async () => {
  assert.ok(await cells() >= 12);
  assert.equal(await page.$$eval('.cell.known', (n) => n.some((c) => c.classList.contains('wrong'))), false);
});

await check('the newest clue arrives at the top of the feed', async () => {
  const before = await page.$$eval('#clues .clue', (n) => n.map((c) => c.textContent));
  // play forward until at least one clue unlocks
  for (let r = 0; r < 25 && (await page.$$eval('#clues .clue', (n) => n.length)) <= before.length; r++) {
    const idx = await page.$$eval('.cell', (n) => n.map((c, i) => (c.classList.contains('known') ? -1 : i)).filter((i) => i >= 0));
    if (!idx.length) break;
    let moved = false;
    for (const i of idx) {
      const was = await known();
      for (const which of [0, 1]) {
        await dismiss();
        await page.locator('.cell').nth(i).click();
        await page.waitForTimeout(120);
        const btns = await page.$$('.sheet-choices button');
        if (!btns.length) { await dismiss(); break; }
        await btns[which].click();
        await page.waitForTimeout(200);
        if (await known() > was) { moved = true; break; }
      }
      if (moved) break;
    }
    if (!moved) break;
  }
  const after = await page.$$eval('#clues .clue', (n) => n.map((c) => c.textContent));
  if (after.length > before.length && before.length) {
    assert.equal(after[after.length - before.length], after[after.length - before.length],
      'sanity');
    assert.deepEqual(after.slice(after.length - before.length), before,
      'the clues that were already there should have been pushed down, unchanged');
  }
});

await check('the board can be solved to the end and shows a result with a share grid', async () => {
  for (let round = 0; round < 60; round++) {
    const idx = await page.$$eval('.cell', (n) => n.map((c, i) => (c.classList.contains('known') ? -1 : i)).filter((i) => i >= 0));
    if (!idx.length) break;
    let moved = false;
    for (const i of idx) {
      const was = await known();
      for (const which of [0, 1]) {
        await dismiss();
        await page.locator('.cell').nth(i).click();
        await page.waitForTimeout(110);
        const btns = await page.$$('.sheet-choices button');
        if (!btns.length) { await dismiss(); break; }
        await btns[which].click();
        await page.waitForTimeout(190);
        if (await known() > was) { moved = true; break; }
      }
      if (moved) break;
    }
    if (!moved) break;
  }
  await page.waitForTimeout(700);
  assert.equal(await known(), await cells(), 'the board did not finish');
  const grid = await page.$eval('.result-grid', (n) => n.textContent ?? '').catch(() => '');
  assert.ok(grid.includes('🟩') || grid.includes('🟨') || grid.includes('🟡'),
    'the result card has no share grid');
});

await check('the footer offers the privacy policy and the terms, and both are on the page', async () => {
  const links = await page.$$eval('.site-foot a', (n) => n.map((a) => a.getAttribute('href')));
  assert.ok(links.includes('#privacy') && links.includes('#terms'), `footer links were ${links}`);
  for (const id of ['privacy', 'terms', 'how']) {
    const words = await page.$eval(`#${id}`, (n) => (n.textContent ?? '').trim().split(/\s+/).length);
    assert.ok(words > 150, `#${id} has only ${words} words`);
  }
});

await check('the article follows the language picker, one version visible at a time', async () => {
  await page.reload();
  await page.waitForSelector('.cell', { timeout: 15000 });
  const visible = () => page.$$eval('.how-body', (n) => n.filter((x) => !x.hidden).map((x) => x.dataset.lang));
  assert.deepEqual(await visible(), ['en']);
  await page.selectOption('#lang', 'pt');
  await page.waitForTimeout(400);
  assert.deepEqual(await visible(), ['pt'], 'the article did not follow the language picker');
  const head = await page.$eval('.how-body[data-lang=pt] h2', (n) => n.textContent);
  assert.match(head, /constru/i, `the Portuguese article is headed "${head}"`);
  await page.selectOption('#lang', 'es');
  await page.waitForTimeout(400);
  assert.deepEqual(await visible(), ['es']);
  // and every version says roughly as much — a stub translation is worse than none
  const lengths = await page.$$eval('.how-body', (n) => n.map((x) => (x.textContent ?? '').split(/\s+/).length));
  assert.ok(Math.min(...lengths) > 800, `one version is only ${Math.min(...lengths)} words`);
  await page.selectOption('#lang', 'en');
  await page.waitForTimeout(300);
});

await check('the admin surface is not reachable without the token', async () => {
  const status = await page.evaluate(async (b) => (await fetch(`${b}api/admin/flags`, { method: 'POST', body: '{}' })).status, base);
  assert.equal(status, 403, `expected a refusal, got ${status}`);
});

await check('the player-facing flags never carry operator-only fields', async () => {
  const flags = await page.evaluate(async (b) => (await fetch(`${b}api/flags`)).json(), base);
  assert.ok(Array.isArray(flags.flags.themes));
  assert.equal('signups' in flags.flags, false, 'signups leaked into the public flags');
});

await check('a player can sign in, and their data comes back to them on request', async () => {
  await page.reload();
  await page.waitForSelector('.cell', { timeout: 15000 });
  await page.click('#account button.link');            // "Sign in"
  await page.waitForSelector('.signin .field');
  await page.fill('.signin input[type=email]', 'e2e@example.com');
  await page.fill('.signin input[type=text]', 'E2E Player');
  await page.click('.signin .primary');                 // send code — dev mode fills it in
  await page.waitForTimeout(500);
  await page.click('.signin .primary');                 // verify
  await page.waitForSelector('#account .who', { timeout: 10000 });
  assert.equal(await page.$eval('#account .who', (n) => n.textContent), 'E2E Player');

  const dump = await page.evaluate(async () => {
    const token = localStorage.getItem('clues.token');
    const r = await fetch('/api/account/export', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: '{}',
    });
    return r.json();
  });
  assert.equal(dump.account.email, 'e2e@example.com');
  assert.ok(Array.isArray(dump.results), 'the export has no results array');
  assert.ok(!JSON.stringify(dump).includes('token'), 'the export must not contain session tokens');
});

await check('deleting an account refuses to proceed on the session alone', async () => {
  const status = await page.evaluate(async () => {
    const token = localStorage.getItem('clues.token');
    const r = await fetch('/api/account/delete', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ confirm: 'DELETE', code: '000000' }),
    });
    return r.status;
  });
  assert.equal(status, 401, 'a stolen session should not be able to erase an account');
});

await check('sign-in is rate limited from the browser, not just in the server tests', async () => {
  const codes = await page.evaluate(async (b) => {
    const out = [];
    for (let i = 0; i < 8; i++) {
      const r = await fetch(`${b}api/auth/request`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'flood@example.com' }),
      });
      out.push(r.status);
    }
    return out;
  }, base);
  assert.ok(codes.includes(429), `no request was throttled: ${codes.join(',')}`);
});

await check('nothing threw in the browser along the way', async () => {
  const real = consoleErrors.filter((e) => !/favicon|429|too-many|Failed to load resource/i.test(e));
  assert.deepEqual(real, []);
});

await browser.close();
http.close();

console.log(`\ne2e — ${results.length - failed}/${results.length} checks passed\n`);
console.log(results.join('\n'));
process.exit(failed ? 1 : 0);
