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
