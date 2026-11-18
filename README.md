# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/FayBZ77/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/FayBZ77/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: every protocol in the snapshot that records no token yet, ranked by what its token would be worth if its record held — with the concrete steps to farm each one before it launches, and a comparison board for the protocols whose token already trades.

The implied value is priced off the market itself. The snapshot's 128 tokenized protocols give, per category, a median market-cap-per-dollar-of-TVL multiple, shrunk toward the all-market median by peer count and clamped to 0.02x–2.00x. A pre-token protocol is priced as its TVL × its category's multiple × a momentum factor from its 7-day TVL change × a track-record factor from how long it has run tokenless × a breadth factor for its chains. One function scores every row; no name is special-cased. The board ranks 192 pre-token protocols (all 40 of the house watchlist among them) and scores 144 already-trading protocols alongside, shown against their real market caps.

The dashboard is a static page with no build step and no network: a sortable, filterable board (search, category, chain, value band, watchlist-only), a detail drawer per protocol that shows the four factors behind its value and its farm plan, and a method panel with the peer multiples by category. Farm plans are generated per protocol from its category, chains, TVL and age — each step carries what it costs and how long it takes.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

This writes `out/board.json` (the ranked board), `out/data.js`, `out/dashboard/` (open `dashboard/index.html` to read the radar), `out/screenshots/` and `out/dossier.json`. Node 22.18 or later, standard library only; in the grader the snapshot is read from `/input` and the entry written to `/output` by default.

---

Entered on [make.fun](https://make.fun/?ref=4004mnbp&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards
