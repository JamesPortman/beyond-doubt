# Admin

Switches puzzles and modes on and off for every player, without a deploy.

## Turning it on

There is no admin surface until you create one. With `ADMIN_TOKEN` unset, `/api/admin/*`
answers `404 no-such-route` — the same answer any unknown path gets, so probing for it
tells an attacker nothing. There is no default password.

Generate a token:

    node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"

Set it on the host (Vercel → Project → Settings → Environment Variables → `ADMIN_TOKEN`,
all environments) and redeploy. Locally, `ADMIN_TOKEN=… npm run serve`.

Tokens shorter than 24 characters are treated as no token at all, so a weak one cannot be
set by accident.

## Using it

Go to `/#admin`. There is no link to it. Paste the token; it is kept in `sessionStorage`,
so it dies when you close the tab, and it never appears in a URL or a log.

| Switch | What closing it does |
| --- | --- |
| A puzzle | Drops out of the game menu and out of `/api/today`. Starting it is refused with `theme-disabled`. The last remaining puzzle cannot be switched off. |
| Archive | The Archive tab disappears; listing and starting past boards are refused. |
| Weekly edition | The tab disappears; starting a weekly board is refused. |
| New board (free play) | The tab disappears; free boards are refused. |
| Rooms | The tab disappears; creating and joining rooms are refused. |
| New accounts | Existing players sign in as normal. A new address is turned away *after* its code checks out, so a closed door never doubles as a "does this email have an account?" oracle. |
| Notice to players | Shown above the board, verbatim, in every language. Empty means nothing is shown. 240 characters. |

## What to expect

Changes reach players within about five seconds — flags are read on nearly every request
and cached briefly so the database is not hit twenty times a board.

Every one of these is enforced **on the server**. A client that ignores the menu and calls
the API directly is refused. That is the point: a flag that only greys out a button is
decoration.

A player already mid-board when you close something keeps playing that board. The switch
governs starting, not finishing.

## If you lose the token

Set a new `ADMIN_TOKEN` and redeploy. Nothing is stored against the old one — it is
compared, not saved.

## Accounts, data and the law

Three things exist for the player, all of them self-service — you should never have to run
a query to answer a request.

| Ask | Where it happens | What it does |
| --- | --- | --- |
| "Send me my data" | Settings → **Download my data** | A JSON file with the account row, every play and every result. No hashes, no tokens, no other player's data. |
| "Delete my account" | Settings → **Delete my account** | Erases the account, its runs, its leaderboard entries and its sessions. Requires a fresh emailed code *and* the word DELETE — a stolen session cannot do it. Irreversible. |
| "What do you keep?" | Footer → **Privacy** / **Terms** | Both live on the main page, at `#privacy` and `#terms`. |

The privacy policy names three processors: Vercel, Neon and Resend. **If you change host,
database or mail provider, change that paragraph** — it is the one part of the page that
can go quietly out of date and matter.

## Sign-in throttling

Both `/api/auth/request` and `/api/auth/verify` are capped in a fifteen-minute window: 12
attempts per IP and 5 per address (10 for code entry). `/api/account/delete` checks an
emailed code as well, and shares the code-entry budget. Past the cap the answer is `429
too-many-requests` and the game says so in plain words. Behind Vercel the caller is read
from `x-forwarded-for`; behind nothing it is the socket address.

The counters live in the `rate_hits` table and are pruned on every hit, so nothing needs
sweeping. If a legitimate player is locked out, the window clears itself — there is no
unblock button, by design.

## Streaks

A streak counts consecutive *civil* days, in the game's timezone (`America/Toronto` unless
`GAME_TZ` says otherwise), and is computed from the days a player finished on time. Three
rules worth knowing before someone emails you about theirs:

- Today being unplayed does not break it. The streak stands until midnight local and shows
  as at-risk in the chrome.
- An archive board played after its day is marked `late` and never counts. This is what
  stops a streak being backfilled.
- The best streak is remembered separately, so breaking one does not erase what it was.
