# Beyond Doubt

Built with [Claude Code](https://claude.com/claude-code).

A deduction puzzle you are never asked to guess at: before a move is allowed, the solver
checks every world still consistent with the clues in play, and a square you could only
guess at is refused. A new board each day, a weekly edition, and an archive back to launch,
in English, Spanish and Portuguese. Play it at [portman.ca/beyond-doubt](https://www.portman.ca/beyond-doubt/).

Everything lives in [`engine/`](engine/) — start with its [README](engine/README.md).

## Ranked boards cannot be built in advance

Boards are pure functions of their seed, and the solver is in this repository. So the seed
of a ranked board is keyed with a secret only the server holds (`EDITION_SECRET`); without
it, the code tells you nothing about tomorrow's board. See `SECRET_SEEDS_FROM` in
[`engine/src/net/server.ts`](engine/src/net/server.ts).

## License

The code is MIT — see [`LICENSE`](LICENSE). The paintings in the Auction Night theme are
© James Portman, all rights reserved — see [`NOTICE`](NOTICE).
