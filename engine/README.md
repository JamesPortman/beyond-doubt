# @clues/engine

A no-guess deduction engine. **Theme is a skin layer, and it always was.** English, Portuguese
and Spanish are first-class, including gender and number agreement.

Seven games ship in this repo. They share one engine, one generator, one solver and one clue
grammar. The difference between them is a data file, a set of CSS variables, and one
illustration function.

```
npm install
npm run verify      # types, 46 tests, 294-board fuzz, then builds the demo
npm run serve       # http://localhost:8787  — accounts + ranked play
```

`demo/dist/clues-demo.html` also runs standalone from the filesystem: it detects that no
server is reachable and falls back to local play, with scores kept on the device. Sign in
against a running server and the same build switches to ranked play.

## What the engine guarantees

- **You can never be asked to guess.** At every point in a board, the solver enumerates every
  world still consistent with the clues in play. A cell is legal to flip only if it holds the
  same value in *all* of them. Anything else is refused — it is not a mistake, it is simply
  not a move.
- **Every clue is true**, including clues released by cells in the marked state. There are no
  liars; the difficulty is inferential, not adversarial.
- **Boards are pure functions of a seed string.** Two players on opposite sides of the world
  derive the identical board from the same date. Offline that means no puzzle data is shipped;
  online it means the server can re-derive any board from its id and check your work.

## Architecture

```
src/core/     grid.ts      geometry as bitmasks — a whole board state is one 32-bit int
              clue.ts      9 clue kinds, each compiled to 2-3 bit operations
              solver.ts    submask enumeration -> forced cells
              generate.ts  builds a board WITH a proven forced solve path
              session.ts   play state, legality, hints, split-clue dealing
              scoring.ts   time / hints / mistakes / difficulty -> score
              edition.ts   daily + weekly editions from the calendar
              leaderboard.ts  pluggable store (memory + browser-local included)
src/i18n/     en.ts pt.ts es.ts — clue rendering per language, not string substitution
src/themes/   seven themes as pure data + palette
src/render/   art.ts — procedural tile illustration, one drawing function per theme
src/net/      protocol.ts  the wire format
              server.ts    accounts, authoritative play, leaderboards (node:http + node:sqlite)
              client.ts    typed browser client
src/render/   theme -> CSS custom properties
demo/         a playable single-file build of all of it
```

### Why the clue layer looks the way it does

A clue is an AST, never a string:

```ts
{ k: 'count', sel: { k: 'row', r: 1 }, state: B, cmp: 'eq', n: 2 }
```

Rendered:

| locale | output |
|---|---|
| en | In row 2, exactly two trees are blighted. |
| pt | Na fileira 2, exatamente **duas árvores** estão **doentes**. |
| es | En la fila 2, exactamente **dos árboles** están **enfermos**. |

"Tree" is feminine in Portuguese (*a árvore*) and masculine in Spanish (*el árbol*), so the
numeral, the article and the adjective all change. That gender belongs to the **theme**, not
the engine — swap to The Wall (*o quadro* / *el cuadro*, both masculine) and the same clue
renders `exatamente dois quadros são falsos`. Themes therefore declare gendered nouns and
full four-slot predicate forms, and nothing anywhere concatenates an adjective onto an
unknown noun. Person names carry their own gender too, because *Nadia é culpada* and
*Owen é culpado* are different words.

Adding a language means one file implementing `Locale`, and adding a theme means one data
file — neither touches the other, and neither touches the engine.

## Modes

| Mode | What it is | Ranked |
|---|---|---|
| **Solo / Daily** | One board a day, difficulty 1-7 Monday to Sunday, streak tracked | yes |
| **Weekly edition** | Seven boards in one skin, Monday to Sunday, ranked as a set | yes |
| **Archive** | Every daily back to launch day, as a calendar. Ranks on that day's own board | yes, with a caveat |
| **Free play** | Server-chosen random seed, any theme | no — practice |
| **Room** | 2+ players race the same edition on their own devices, with live presence | yes |

Split clues (2-4 players on one device, the clue set dealt out so nobody can finish alone) is
**shelved, not deleted**: `Session.cluesFor(player)` and `dealClues()` are still in the engine
and still tested. Putting the tab back is one line in `paintModes()`.

Themes are chosen from a dropdown in the header and in Settings.

### The archive, and why late results are flagged

Every daily since launch is playable from a calendar grid, showing which you have finished,
your score, and each day's difficulty. Boards are pure functions of their date, so the archive
serves the board that *actually ran* — not a regenerated approximation.

An archived run **is** ranked on that day's own leaderboard (first attempt only). It is
recorded with `late = 1`, which excludes it from two things:

- **Streaks.** Otherwise you could back-fill a fortnight and manufacture a 14-day streak.
- **Weekly standings**, once that week has passed.

Weekly standings also count **distinct days**, not results — a test caught that playing two
themes on one Thursday was being counted as two days completed.

Split-clue mode is the multiplayer idea worth building: it changes no rule at all. The board's
legality is still global — the *table* collectively knows enough — so the game becomes people
talking to each other. `Session.cluesFor(player)` is the whole implementation.

## Scoring and leaderboards

`scoreRun()` weighs time against par for the difficulty, multiplies by difficulty, and deducts
flat penalties for hints and mistakes, so a clean Sunday outranks a fast Monday. Speed is
capped so an implausible solve cannot run away with the board.

`scoreRun()` is shared by both paths, but online it is only ever called on the server, from
server-measured time. Weekly standings rank by days completed first, total score second —
finishing all seven beats one huge Tuesday.

`LeaderboardStore` (`MemoryLeaderboard`, `LocalLeaderboard`) remains for offline play. Online,
the board is SQL. The demo seeds deterministic fake rivals **only when offline**, so a local
board is not an empty table; every row you see while signed in is a result the server
verified.

## Adding a theme

```ts
export const myTheme: Theme = {
  id: 'lighthouse',
  labelMode: 'coord',
  tagSchema: { watch: ['first', 'middle', 'morning'] },  // powers relational clues
  skinClass: 'skin-lighthouse',
  palette: { /* page chrome AND tile material — they are different surfaces */ },
  fonts: { display, body, mono },
  strings: { en: {...}, pt: {...}, es: {...} },
};
```

Then `registerTheme(myTheme)`. The generator, solver, hint system, scoring, editions and
leaderboard all work on it immediately, in all three languages.

## Limits worth knowing

- The solver enumerates `2^free` worlds, so boards are capped at 21 free cells. 4x4 and 4x5
  are instant (worst observed generate+solve: ~120ms). A 5x5 board would need a real
  constraint propagator instead — the interface would not change.
- `connected` clues cost ~20x a count clue to test, so they are evaluated last, after cheaper
  clues have already rejected most candidate worlds.
- The daily total-count opening clue is deliberate: it collapses the search space and gives
  the player something to hold in their head. It is one line in `tryGenerate` to remove.


## Server-verified play

Ranked scores need an account, and a ranked run is verified end to end. The design goal was
that a determined player with devtools open should gain nothing.

**The client is never sent the answer.** `/api/play/start` returns the grid, the tile tags, a
label seed, and *only the opening clues*. No solution, no path, and not the generating seed —
the seed is withheld precisely because it would let the client regenerate the board. There is
a test that greps the serialised response for exactly this.

**So how does the board stay responsive?** The client runs the same solver on the clues it
legitimately holds. A cell that is forced has, by definition, the same value in every world
consistent with those clues — so the client can *derive* the answer for legal moves and paint
them instantly, while remaining unable to know anything about cells that are not yet forced.
The server re-checks every move anyway. You get zero-latency play and full authority.

**The clock is the server's**, from `start` to the final flip. A client cannot report a time.

**Editions come from the server's calendar.** The client sends a *mode* — `daily`, `weekly`,
`free` — never a seed or a date. You cannot request tomorrow's board, drop back to Monday's
easier one, or hand-pick a seed you already solved.

**The first completed attempt is the ranked one.** Replaying a board you have solved is
practice; it cannot improve your placement. Free play is never ranked at all.

Also enforced server-side: hints and mistakes are counted and persisted (a hinted run is not
"perfect"), moves on someone else's play are rejected, out-of-range cells are rejected, move
flooding is rate limited, login codes are single-use, attempt-capped, expiring and compared in
constant time, and tokens are stored only as hashes.

What is *not* solved here: two people at one screen, or someone photographing a friend's
board. That is a social problem, not a cryptographic one, and every daily puzzle game has it.

### Auth

Passwordless six-digit code by email. In dev the code comes back in the response body so you
can sign in without an email provider; in production `authRequest` should send it and return
`{ sent: true }` alone. Swapping in OAuth or passkeys touches only `authRequest`/`authVerify`.

### Storage

`node:sqlite` — one file, zero operations. Every query is plain SQL in `store.ts`; moving to
Postgres is a driver swap. Requires Node 22.5+.


## Tile artwork

Every tile is illustrated, and every illustration is *drawn* rather than fetched —
`src/render/art.ts` emits inline SVG seeded from the board's label seed. Six drawing
functions cover the seven themes: portraits (in colour for The Guest List, as a
high-contrast photocopy for The Callboard), orchard trees with three growth habits,
framed paintings mixed from a ten-pigment box, personnel dossiers, star fields, and
storyboard frames.

Doing it this way buys four things that an asset pipeline would not:

- **Determinism.** Two players on the same board see the same faces, in every language,
  with nothing downloaded and nothing stored.
- **State.** Art takes the tile's state, so a guilty guest gets struck through, a blighted
  tree loses its fruit and gains lesions, a forged canvas cracks, a flagged file gets
  stamped. The picture *is* the feedback.
- **Theming.** Drawings read the theme palette, so a new skin needs no new assets.
- **Size.** The entire illustrated demo, seven themes and three languages included, is one
  132 KB HTML file with no network requests.

If you later commission real illustration, `tileArt()` is the single seam — return an
`<img>` and nothing else in the codebase changes. Tests assert the art is deterministic,
well-formed, varied within a board, different across boards, and visibly state-dependent.

The grid is square: tiles are 1:1 with the drawing edge to edge and a caption bar across
the foot carrying the name and its tag.


## Inspect

A no-guess puzzle only keeps its promise if the player can check what a clue actually says.
"All", "both", "most", "between" and "connected" are technical terms on this board and do
not mean what everyday usage suggests, so Inspect is not a nicety — it is the thing that
makes the fairness legible.

Turn it on and pick a clue. You get:

- **What it means** — a plain restatement, generated per locale, that spells out the
  semantics the clue's wording compresses. "In row 2, exactly two guests are guilty" becomes
  "In row 2 there are 4 guests. The number of them that are guilty is exactly 2 — no more
  and no fewer."
- **Squares it talks about** — the exact set, named and highlighted on the board while
  everything else dims. A whole-board clue says so rather than listing twenty names.
- **Terms used** — only the definitions this clue actually needs, from a per-language
  glossary of 22 terms. Every clue also carries the truth rule, because "even the guilty
  tell the truth" is the rule players most often forget.

Pick a *tile* instead and you get every clue in play that mentions it.

`explain()` sits beside `clue()` on the `Locale` interface, so a new language writes both
or neither — there is no path to a half-translated Inspect.

## Settings

| Setting | Options | Why it earns a row |
|---|---|---|
| Game | seven themes | the switcher, also in the header |
| Language | English, Português, Español | re-renders the board in place, same seed, same progress |
| Font | theme, sans, serif, mono, **high legibility** | the last one swaps in wide-aperture faces and bumps the scale |
| Result tag side | right, left | thumb reach, and it stops the tag covering the art you are reading |
| Auto-clear pencil marks | on/off | |
| Show used clues as | normal, dimmed, hidden | crossing off is how people actually track a board |
| Hint button | enabled, ask first, disabled | "ask first" stops the mis-tap that spends a hint |
| Appearance | follow theme, dark, light | |
| Colour mode | normal, high contrast, colour-blind safe | |
| Show timer | always, when solved, never | not everyone wants a clock running |
| Show leaderboard | always, when solved, never | ditto for the ranking |
| Tile artwork | on/off | |
| Reduce motion | on/off | kills transforms and the shake |
| Undim clues at the end | on/off | |

Appearance and colour mode are **derived from each theme's palette rather than hand-authored
per theme**, so a new theme inherits every accessibility mode the moment it is registered.
Only the page chrome is recoloured — the tile keeps its material, because the artwork is
what carries the theme.

There is a test that walks all 7 themes × 3 appearances × 3 colour modes and asserts WCAG
contrast on body text, panel text, tile captions and secondary text. It caught two real
failures on first run: Cold Open's cork background put secondary text at 2.84:1, and "high
contrast" left black ink on that same cork at 5.8:1 because it was only changing the ink.
Both are fixed in the derivation, not in the test.

Colour-blind mode uses the Okabe-Ito blue/orange pair, which stays distinguishable under
deuteranopia, protanopia and tritanopia — and adds a border-style difference, so the two
states never rely on hue alone. Settings are sanitised on load, so a stale or hand-edited
record cannot produce an unreadable board.


## Deploying

The demo is a single static HTML file, so the front end deploys anywhere. The decision is
where the *server* lives, and it comes down to one question: does the host give you a disk.

### The short version

| Host | What you change | Why |
|---|---|---|
| **Fly.io / Railway / Render** | nothing | a real Node process with a mounted volume — `npm run serve` is the whole deployment |
| **Vercel** | swap SQLite for hosted Postgres | serverless functions have no persistent disk and no memory between requests |
| **Static only (no server)** | nothing | the demo already falls back to local play when no server answers |

### Vercel specifically

`vercel.json` and `api/index.ts` are in the repo. One serverless function handles every
`/api/*` route by reusing the same `GameServer` as local development, so there is no second
copy of the rules to keep in sync.

Two properties of the architecture make this work at all, and both were designed in rather
than patched on:

- **Every cache is rebuildable.** Puzzles regenerate from their seed. Play state replays from
  the moves the server already validated. So a request landing on a cold instance that has
  never seen your board is indistinguishable from one that has.
- **Rate limiting reads the database**, not a `Map`. That was a real change made for this —
  an in-process counter is worthless when the next request may hit a different process.

What you still have to do:

1. **Provision Postgres** (Vercel Postgres, Neon, Supabase — any of them). SQLite on Vercel
   writes to `/tmp`, which is per-instance and wiped without warning. It will *appear* to
   work in testing and lose accounts in production.
2. **Write `PostgresStore`.** `src/net/store.ts` is ~20 methods of plain SQL behind one
   class; nothing above it knows what database it is talking to. The translation is
   mechanical: `INTEGER PRIMARY KEY` → `bigserial`, `?` → `$1`, `ON CONFLICT … DO UPDATE`
   is already Postgres-compatible syntax, and `DatabaseSync`'s synchronous `.get/.all/.run`
   become awaited calls, which makes `Store`'s methods async. **This is the one piece not
   written yet** — the SQLite implementation is the reference.
3. **Set the secrets:** `DATABASE_URL`, and `NODE_ENV=production` so login codes stop coming
   back in the response body.
4. **Send real email.** `authRequest` currently returns the six-digit code to the caller,
   which is correct for development and unacceptable in production. Swap in Resend, Postmark
   or SES — it is a four-line change in one method.
5. **Watch the cold-start cost.** Generating a 4x5 board is ~70ms and replaying twenty moves
   costs a few deductions, so a cold request can run ~300ms. Caching the daily boards in the
   database at midnight would remove it if that ever matters.

### If you would rather not do any of that

Deploy to Fly or Railway with a small volume mounted at `/data` and set
`DB=/data/clues.db`. `npm run serve` is then the entire deployment, SQLite and all, and the
Postgres work above disappears. For a daily puzzle game with a leaderboard this is very
likely the right call — one process and one file will carry you a long way, and the code is
already written.
