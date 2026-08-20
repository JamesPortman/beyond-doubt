import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGrid, isConnected, popcount, bits } from '../src/core/grid.js';
import { makeRng } from '../src/core/rng.js';
import { generate } from '../src/core/generate.js';
import { Session } from '../src/core/session.js';
import { scoreRun } from '../src/core/scoring.js';
import { isoWeek, weekId, weeklyEdition, dailyEdition, weekdayDifficulty } from '../src/core/edition.js';
import { MemoryLeaderboard, entryFrom } from '../src/core/leaderboard.js';
import { State } from '../src/core/clue.js';

test('grid geometry', () => {
  const g = makeGrid(4, 4);
  assert.equal(g.n, 16);
  assert.equal(popcount(g.corners), 4);
  assert.equal(popcount(g.edges), 12);
  assert.equal(popcount(g.interior), 4);
  // centre cell has 8 neighbours, corner has 3
  assert.equal(popcount(g.neigh[5]), 8);
  assert.equal(popcount(g.neigh[0]), 3);
  assert.equal(popcount(g.ortho[0]), 2);
  // between is exclusive of endpoints and only along a line
  assert.deepEqual(bits(g.between[0][3]), [1, 2]);
  assert.equal(g.between[0][6], 0, 'non-collinear pairs have no between');
  assert.deepEqual(bits(g.between[0][10]), [5], 'diagonal between');
});

test('connectivity is orthogonal only', () => {
  const g = makeGrid(4, 4);
  assert.ok(isConnected(g, 0b0011));
  assert.ok(isConnected(g, 0), 'empty set counts as connected');
  assert.ok(!isConnected(g, (1 << 0) | (1 << 5)), 'diagonal touch is not connected');
  assert.ok(isConnected(g, (1 << 0) | (1 << 1) | (1 << 5)));
});

test('rng is deterministic and seed-separated', () => {
  const a = makeRng('x'), b = makeRng('x'), c = makeRng('y');
  const seq = (r: ReturnType<typeof makeRng>) => Array.from({ length: 5 }, () => r.int(1000));
  assert.deepEqual(seq(a), seq(b));
  assert.notDeepEqual(seq(makeRng('x')), seq(c));
});

const SCHEMA = { role: ['a', 'b', 'c', 'd'] };

test('generated boards are solvable with no guessing, across all difficulties', () => {
  for (let d = 1; d <= 7; d++) {
    for (let s = 0; s < 4; s++) {
      const p = generate({ seed: `t-${d}-${s}`, difficulty: d, tagSchema: SCHEMA });
      const sess = new Session({ puzzle: p, now: () => 0 });
      // replay the generator's own forced path; every step must be legal
      for (const cell of p.path) {
        const truth: State = ((p.solution >> cell) & 1) as State;
        const r = sess.mark(cell, truth);
        assert.equal(r.outcome, 'ok', `d${d} seed${s} cell ${cell} was not deducible`);
      }
      assert.ok(sess.solved, `d${d} seed${s} did not finish`);
      assert.equal(sess.mistakes, 0);
      assert.equal(sess.knownB, p.solution);
    }
  }
});

test('every board can also be solved greedily, not just along the generator path', () => {
  for (let s = 0; s < 6; s++) {
    const p = generate({ seed: `greedy-${s}`, difficulty: 5, tagSchema: SCHEMA });
    const sess = new Session({ puzzle: p, now: () => 0 });
    let guard = 0;
    while (!sess.solved) {
      assert.ok(guard++ < 100, 'greedy solve stalled');
      const d = sess.deduction();
      const forced = d.forcedA | d.forcedB;
      assert.ok(forced !== 0, `stuck with ${d.modelCount} models still consistent — that is a guess`);
      const cell = bits(forced)[0];
      sess.mark(cell, ((p.solution >> cell) & 1) as State);
    }
    assert.equal(sess.knownB, p.solution);
  }
});

test('the solution is the unique world consistent with the full clue set', () => {
  const p = generate({ seed: 'unique', difficulty: 6, tagSchema: SCHEMA });
  const sess = new Session({ puzzle: p, now: () => 0 });
  for (const cell of p.path) sess.mark(cell, ((p.solution >> cell) & 1) as State);
  const d = sess.deduction();
  assert.equal(d.modelCount, 1);
});

test('session refuses guesses and counts wrong flips', () => {
  const p = generate({ seed: 'guard', difficulty: 4, tagSchema: SCHEMA });
  const sess = new Session({ puzzle: p, now: () => 0 });
  const d = sess.deduction();
  const undetermined = bits(d.undetermined);
  if (undetermined.length) {
    const r = sess.mark(undetermined[0], 1);
    assert.equal(r.outcome, 'not-deducible');
    assert.equal(sess.mistakes, 0, 'refusing a guess is not a mistake');
  }
  const forced = bits(d.forcedA | d.forcedB)[0];
  const truth: State = ((p.solution >> forced) & 1) as State;
  const wrong: State = truth === 1 ? 0 : 1;
  assert.equal(sess.mark(forced, wrong).outcome, 'wrong');
  assert.equal(sess.mistakes, 1);
  assert.equal(sess.mark(forced, truth).outcome, 'ok');
});

test('hints are budgeted and always actionable', () => {
  const p = generate({ seed: 'hint', difficulty: 5, tagSchema: SCHEMA });
  const sess = new Session({ puzzle: p, hintBudget: 2, now: () => 0 });
  const h1 = sess.hint();
  assert.notEqual(h1.kind, 'none');
  sess.hint();
  assert.equal(sess.hint().kind, 'none', 'budget must be enforced');
  assert.equal(sess.hintsUsed, 2);
});

test('split clues leave nobody able to finish alone', () => {
  const p = generate({ seed: 'split', difficulty: 6, tagSchema: SCHEMA });
  const sess = new Session({ puzzle: p, players: 3, now: () => 0 });
  const gated = p.clues.filter((c) => c.gate !== null);
  const owners = new Set(gated.map((c) => sess.deal.get(c.id)));
  assert.ok(owners.size > 1, 'dealt clues must be spread across players');
  for (const c of p.clues) assert.ok(sess.deal.has(c.id), 'every clue is dealt to someone');
  const open = p.clues.filter((c) => c.gate === null);
  for (const c of open) assert.equal(sess.deal.get(c.id), -1, 'opening clues are public');
  for (let pl = 0; pl < 3; pl++) {
    assert.ok(sess.cluesFor(pl).length <= sess.activeClues().length);
  }
});

test('scoring rewards speed and punishes help', () => {
  const fast = scoreRun({ difficulty: 4, elapsedMs: 60_000, hintsUsed: 0, mistakes: 0 });
  const slow = scoreRun({ difficulty: 4, elapsedMs: 600_000, hintsUsed: 0, mistakes: 0 });
  const helped = scoreRun({ difficulty: 4, elapsedMs: 60_000, hintsUsed: 2, mistakes: 1 });
  assert.ok(fast.score > slow.score);
  assert.ok(fast.score > helped.score);
  assert.ok(fast.perfect && !helped.perfect);
  const sunday = scoreRun({ difficulty: 7, elapsedMs: 300_000, hintsUsed: 0, mistakes: 0 });
  const monday = scoreRun({ difficulty: 1, elapsedMs: 60_000, hintsUsed: 0, mistakes: 0 });
  assert.ok(sunday.score > 0 && monday.score > 0);
  assert.ok(scoreRun({ difficulty: 7, elapsedMs: 1, hintsUsed: 0, mistakes: 0 }).base <= 2500, 'speed is capped');
});

test('editions are pure functions of the calendar', () => {
  const d = new Date('2026-08-20T12:00:00Z'); // a Thursday
  assert.equal(weekdayDifficulty(d), 4);
  assert.equal(weekId(d), '2026-W34');
  assert.deepEqual(isoWeek(new Date('2027-01-01T00:00:00Z')), { year: 2026, week: 53 });
  const ids = ['orchard', 'coldopen'];
  assert.equal(dailyEdition(ids, d).id, dailyEdition(ids, new Date('2026-08-20T23:00:00Z')).id);
  const week = weeklyEdition(ids, d);
  assert.equal(week.length, 7);
  assert.deepEqual(week.map((w) => w.difficulty), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(week[0].date, '2026-08-17', 'week starts Monday');
  assert.equal(week[6].date, '2026-08-23');
  assert.equal(new Set(week.map((w) => w.seed)).size, 7);
});

test('leaderboard keeps best run only and ranks the week by days completed', async () => {
  const lb = new MemoryLeaderboard();
  const ids = ['orchard'];
  const mk = (day: string, who: string, score: number) => {
    const ref = dailyEdition(ids, new Date(`${day}T12:00:00Z`));
    return entryFrom(ref, who, who, 'en', 60_000, 0, 0, { score } as any, 1);
  };
  await lb.submit(mk('2026-08-17', 'ana', 900));
  await lb.submit(mk('2026-08-17', 'ana', 400));
  assert.equal((await lb.top(mk('2026-08-17', 'ana', 0).editionId))[0].score, 900, 'a worse replay must not overwrite');
  await lb.submit(mk('2026-08-17', 'bo', 2000));
  await lb.submit(mk('2026-08-18', 'ana', 500));
  const wk = await lb.weekly('2026-W34');
  assert.equal(wk[0].playerId, 'ana', 'two days beats one big score');
  assert.equal(wk[0].daysCompleted, 2);
  assert.equal(await lb.streak('ana', ['2026-08-18', '2026-08-17', '2026-08-16']), 2);
  assert.equal(await lb.streak('bo', ['2026-08-18', '2026-08-17']), 0);
});
