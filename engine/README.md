# @clues/engine

A no-guess deduction engine. **Theme is a skin layer, and it always was.** English, Portuguese
and Spanish are first-class, including gender and number agreement.

Seven games ship in this repo. They share one engine, one generator, one solver and one clue
grammar. The difference between them is a data file, a set of CSS variables, and one
illustration function.

```
npm install
npm run verify      # types, 82 tests, 294-board fuzz, builds the demo, then e2e
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
              edition.ts   daily + weekly + archive editions from the calendar
              streak.ts    current / best streak from played dates
              share.ts     the shareable result
              leaderboard.ts  pluggable store (memory + browser-local included)
src/i18n/     en.ts pt.ts es.ts — clue rendering per language, not string substitution
src/themes/   seven themes as pure data + palette
src/render/   art.ts       procedural tile illustration, one drawing function per theme
              deal.ts      seeded deal of a theme's real artwork
              settings.ts  palette derivation;  skin.ts  theme -> CSS custom properties
src/net/      protocol.ts  the wire format
              server.ts    accounts, authoritative play, leaderboards (node:http)
              store.ts     SQLite (node:sqlite);  store-pg.ts  Postgres, same interface
              flags.ts     operator feature flags, enforced server-side
              client.ts    typed browser client
src/base.ts   the /beyond-doubt path prefix, recovered at runtime
api/          Vercel serverless entry point
demo/         a playable single-file build of all of it, plus how, tech, legal and account pages
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
the engine — swap to The Guest List (*o convidado* / *el invitado*, both masculine) and the
same clue renders `exatamente dois convidados são culpados`. Themes therefore declare gendered nouns and
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
your score, and each day's difficulty. A board is a pure function of its seed, and the server
derives each day's seed the same way every time, so the archive serves the board that
*actually ran* — not a regenerated approximation.

An archived run **is** ranked on that day's own leaderboard (first attempt only) — for days from
2026-09-25 on. Boards before that were seeded from the date alone, so anyone with the code can
rebuild them; replays of those days are practice, and the leaderboard from the day stands. It is
recorded with `late = 1`, which excludes it from two things:

- **Streaks.** Otherwise you could back-fill a fortnight and manufacture a 14-day streak.
- **Weekly standings**, once that week has passed.

Weekly standings also count **distinct days**, not results — a test caught that playing two
themes on one Thursday was being counted as two days completed.

Split-clue mode is the multiplayer idea worth building: it changes no rule at all. The board's
legality is still global — the *table* collectively knows enough — so the game becomes people
talking to each other. `Session.cluesFor(player)` is the whole implementation.

## Scoring and leaderboards

`scoreRun()` weighs time against par for the difficulty, multiplies by difficulty, deducts a
flat penalty per hint, and adds a minute to the clock per mistake, so a clean Sunday outranks
a fast Monday. Speed is
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

**Nor can you compute tomorrow's board.** A ranked board dated 2026-09-25 or later is seeded
with an HMAC of its date and theme under `EDITION_SECRET`, which only the server holds. Before
that, the seed *was* the date and theme, so with the code in hand anyone could build tomorrow's
board tonight and solve it offline with the engine's own solver. Production refuses to start a
ranked board without the secret rather than fall back. The browser builds only practice boards —
split play and the offline fallback included — because a board built in the page carries its
whole solution.

**The first attempt *started* is the ranked one.** Not the first finished: otherwise you
could open the board, make your mistakes, walk away and start a clean run knowing the answer.
So starting a ranked board you are part-way through *resumes* that play — its moves, its
mistakes, its hints and its clock, which kept running while you were away — whether you
reloaded, switched device or joined a room. (`start` returns it with a `resume` block; the
client replays the moves.) Replaying a board you have finished is practice and cannot
improve your placement, and if two starts ever race, only the earlier play can record a
result. Free play is never ranked at all.

Also enforced server-side: hints and mistakes are counted and persisted (a hinted run is not
"perfect"), moves on someone else's play are rejected, out-of-range cells are rejected, move
flooding is rate limited, login codes are single-use, attempt-capped, expiring and compared in
constant time, and tokens are stored only as hashes.

What is *not* solved here: two people at one screen, or someone photographing a friend's
board. That is a social problem, not a cryptographic one, and every daily puzzle game has it.

### Auth

Passwordless six-digit code by email. In dev the code comes back in the response body so you
can sign in without an email provider; in production `authRequest` hands it to the
`sendEmail` option (Resend, in `api/index.ts`) and returns `{ sent: true }` alone. Swapping in OAuth or passkeys touches only `authRequest`/`authVerify`.

### Storage

`node:sqlite` — one file, zero operations. Every query is plain SQL in `store.ts`. Requires
Node 22.5+. `PostgresStore` in `store-pg.ts` implements the same `Store` interface and is used
whenever `DATABASE_URL` (or `POSTGRES_URL`) is set; `npm run test:pg` runs the whole server
suite against it.


## Tile artwork

Every tile is illustrated, and every illustration is *drawn* rather than fetched —
`src/render/art.ts` emits inline SVG seeded from the board's label seed. Six drawing
functions cover the seven themes: portraits (in colour for The Guest List, as a
high-contrast photocopy for The Callboard), orchard trees with three growth habits,
framed paintings mixed from a twelve-pigment box, personnel dossiers, star fields, and
storyboard frames.

Doing it this way buys four things that an asset pipeline would not:

- **Determinism.** Two players on the same board see the same faces, in every language,
  with nothing downloaded and nothing stored.
- **State.** Art takes the tile's state, so a guilty guest gets struck through, a blighted
  tree loses its fruit and gains lesions, a forged canvas cracks, a flagged file gets
  stamped. The picture *is* the feedback.
- **Theming.** Drawings read the theme palette, so a new skin needs no new assets.
- **Size.** The entire illustrated game, seven themes and three languages included, is one
  self-contained ~260 KB HTML file.

Real artwork plugs in through a theme's `images` set, and Auction Night uses it: 21
paintings and photographs in `demo/assets/gallery/`, dealt from the label seed and marked
with a red dot when sold. They load at runtime, so the single-file build, which has no
assets beside it, falls back to the drawn tile. `tileArt()` remains the single seam. Tests assert the art is deterministic,
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


## Accounts: the copy and the exit

Two endpoints, both behind a live session:

    POST /api/account/export   -> every row held about the caller, as JSON
    POST /api/account/delete   -> { code, confirm: 'DELETE' }

Deleting takes more than a session on purpose. A live token proves the browser, not the
person; the delete additionally requires a code mailed to the address *now*, so a borrowed
phone cannot erase someone's five-year streak. The delete is real — results, plays, room
memberships, tokens and outstanding codes all go, and the leaderboards lose those rows with
them. A scoreboard that still lists someone who asked to be forgotten has not forgotten them.

The export deliberately returns rows rather than a summary; a summary is us deciding what
someone gets to see about themselves. It carries no hashes and no session tokens.

## Streaks

`Store.playedDates(userId)` returns the days a player finished on time; `streakStats()` in
`src/core/streak.ts` turns that into `{ current, best, playedToday, atRisk }`. The rule is
deliberately a pure function over dates rather than a SQL window, because it is a product
decision that will change and a decision that will change should be readable.

Two details that are easy to get wrong and hard to notice:

- **Civil-day arithmetic, not `- 86_400_000`.** Subtracting a day in milliseconds lands in
  the same civil day twice on the two days a year the clocks move, which invents a day the
  player never played. `shiftDays()` anchors at noon UTC and steps in UTC instead.
- **Today unplayed does not break the streak.** It counts back from yesterday and reports
  `atRisk`, so the number people carry around survives until midnight.

## Sign-in rate limits

`Store.hitRateLimit(key, windowMs, now)` records an attempt and returns how many happened
in the window. The server keys on both the IP and the address, because each alone is
trivially varied. It is deliberately approximate — two racing requests can both squeak
through, which for a speed bump on a sign-in form is a fair trade against locking a table on
every hit.

## End-to-end checks

`npm run e2e` builds, starts a real server on a temp database and drives Chromium through
the things unit tests cannot see: that a square opens a sheet, that an undecidable square is
refused with an explanation that does not leak the answer, that the newest clue arrives at
the top, that a board can be finished, that the article follows the language picker, and
that sign-in throttles. Every check is an assertion, not a screenshot — a screenshot tells
you something changed; an assertion tells you what was supposed to be true and no longer is.

Playwright is deliberately **not** in `package.json`: its install hook downloads a browser,
and the deploy build has no business doing that. Install it where you run the checks —

    npm i --no-save playwright && npx playwright install chromium

— and `npm run e2e` picks it up. Without it the script says so and exits rather than
failing obscurely. `npm run verify` typechecks and runs the 82 unit tests, the fuzz, the
demo build and then e2e. The Postgres store is covered separately by `npm run test:pg`,
which needs a running server.


## Deploying

The demo is a single static HTML file, so the front end deploys anywhere. The decision is
where the *server* lives, and it comes down to one question: does the host give you a disk.

### The short version

| Host | What you change | Why |
|---|---|---|
| **Fly.io / Railway / Render** | nothing | a real Node process with a mounted volume — `npm run serve` is the whole deployment |
| **Vercel** | set `DATABASE_URL` to a hosted Postgres | serverless functions have no persistent disk and no memory between requests |
| **Static only (no server)** | nothing | the demo already falls back to local play when no server answers |

### Vercel specifically

`vercel.json` and `api/index.ts` are in the repo. One serverless function handles every
`/api/*` route by reusing the same `GameServer` as local development over `PostgresStore`,
so there is no second copy of the rules to keep in sync. It migrates on cold start and
refuses to start without a database URL.

Two properties of the architecture make this work at all, and both were designed in rather
than patched on:

- **Every cache is rebuildable.** Puzzles regenerate from their seed. Play state replays from
  the moves the server already validated. So a request landing on a cold instance that has
  never seen your board is indistinguishable from one that has. The reverse matters as much:
  a warm instance's cached play is used only while its move, mistake and hint counts match
  the database row, so a cache that missed a move handled elsewhere is rebuilt rather than
  written back over it.
- **Rate limiting reads the database**, not a `Map`. That was a real change made for this —
  an in-process counter is worthless when the next request may hit a different process.

### Served under a path prefix

The Vercel deployment answers on two URLs: its own domain at the root, and
`www.portman.ca/beyond-doubt/`, which proxies it as a subpath. `src/base.ts` recovers the
prefix from `location.pathname`; `defaultApiBase()` in `src/net/client.ts` prepends it to
the API origin, and Auction Night's artwork URLs carry it too, so one build serves both with
no environment flag. Anything else the browser fetches by a site-root path needs the same
treatment. The demo pages link to each other relatively; keep it that way when adding a
page. `test/client-base.test.ts` pins the prefix rules, including that a path
merely *starting* with the same letters is a different app.

What you still have to do:

1. **Provision Postgres** (Vercel Postgres, Neon, Supabase — any of them). SQLite on Vercel
   writes to `/tmp`, which is per-instance and wiped without warning. It will *appear* to
   work in testing and lose accounts in production.
2. **Set the secrets:** `DATABASE_URL`, and `NODE_ENV=production` so login codes stop coming
   back in the response body. `ALLOWED_ORIGINS`, `ADMIN_TOKEN` (unset, `/api/admin/*` does
   not exist) and `LAUNCH_DATE` are optional.
3. **Send real email.** `api/index.ts` delivers codes through Resend and needs
   `RESEND_API_KEY` (and `MAIL_FROM` for a verified sender). Without it a sign-in request
   fails loudly rather than leaving the player waiting for a code that is not coming.
4. **Watch the cold-start cost.** Generating a 4x5 board is ~70ms and replaying twenty moves
   costs a few deductions, so a cold request can run ~300ms. Caching the daily boards in the
   database at midnight would remove it if that ever matters.

### If you would rather not do any of that

Deploy to Fly or Railway with a small volume mounted at `/data` and set
`DB=/data/clues.db`, and `npm run serve` runs the whole game on SQLite, one process and one
file. Two things stand between that and production as `scripts/serve.mjs` is written today:
with `NODE_ENV=production` it refuses to start without `DATABASE_URL` and `ALLOWED_ORIGINS`,
and it passes no `sendEmail`, so sign-in codes would go nowhere. Both are small changes to
that script — copy the Resend sender from `api/index.ts` — and for a daily puzzle game with
a leaderboard one process and one file will still carry you a long way.
