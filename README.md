# FAVS Football Analytics – Dev Overview

Frontend: React + Vite + Tailwind.
Backend ingestion: Python scraper (see `scraper/`) performing a 4-phase loop (fetch → enrich → process → store).

## Scraper Runtime

Main loop: `python -m scraper.fetch_loop` (or run directly via `python scraper/fetch_loop.py`).

Phases:

1. Fetch: collects live events + scheduled events within a configurable time window.
2. Enrich: pulls detail endpoints (`event/{id}`, lineups, incidents, statistics, managers, etc.). Deprecated `player-statistics` endpoint has been removed.
3. Process: normalises into domain rows (matches, teams, players, events, stats, etc.).
4. Store: upserts into Postgres (via Supabase client) with conflict handling.

### Environment Variables

Put these in your environment (e.g. `.env` or process manager config):

| Variable                         | Default     | Description                                                              |
| -------------------------------- | ----------- | ------------------------------------------------------------------------ |
| `FAST_SNAPSHOT`                  | 1           | Early minimal match rows before heavy enrichment.                        |
| `ENRICH_MAX_EVENTS`              | (loop init) | Cap heavy enrichment load.                                               |
| `FETCH_PAST_HOURS`               | 12          | Include finished matches up to N hours in the past (for fresh rankings). |
| `FETCH_FUTURE_HOURS`             | 24          | Include scheduled matches up to N hours in the future.                   |
| `FALLBACK_PLAYER_STATS`          | 1           | If no raw player stats payload, build from lineups + incidents.          |
| `LOG_PLAYER_STATS_FETCH_REMOVED` | 0           | Debug log each skipped deprecated endpoint call.                         |

### Player Stats Ingestion (Important)

`event/{id}/player-statistics` endpoint was removed/unreliable, so we no longer call it. Player statistics now come from:

1. Primary: per-event `statistics` payload (team + sometimes embedded player metrics).
2. Fallback: reconstruction from lineups + incidents (goals, minutes, substitution flags). Assists cannot be derived reliably from incidents (provider omits assist mapping there); they remain null unless another source provides them.

## Historical / Backfill

Two utilities exist for seeding or repairing historical data:

### 1. Full Dataset Initialiser

`python -m scraper.legacy.init_match_dataset --days-back 30 --days-forward 7`
Options:

- `--start YYYY-MM-DD --end YYYY-MM-DD` explicit range.
- `--limit-days N` clamp total days.
- `--dry-run` to only log bundle sizes.
- `--tournaments 34,42` restrict to uniqueTournament IDs (overrides env allowlist).

Use this when first populating matches + standings + related entities over a broad historical window. It reuses the same processing pipeline.

### 2. Recent Player Stats Backfill

Script: `python scripts/backfill_recent_player_stats.py --days 7`
Purpose: Reconstruct / fill missing `player_stats` for recent days after removing deprecated endpoint.
Flags:

- `--days N` (default 7) recent days ending today (UTC).
- `--start YYYY-MM-DD --end YYYY-MM-DD` explicit range override.
- `--dry-run` show counts without persisting.

This script focuses on player stats only (plus minimal dependency upserts) and honours `FALLBACK_PLAYER_STATS`.

## Running Locally

1. Install frontend deps: `npm install` then `npm run dev`.
2. (Optional) Activate Python venv and install requirements (not yet listed formally – ensure packages for HTTP requests + Supabase client are installed).
3. Start scraper loop in a separate process. Adjust env vars as needed.

## Data Consistency Notes

- Kickoff `start_time` is canonicalised from provider numeric timestamp (epoch seconds/millis) and retro-fix script corrected historical drift.
- Rankings / Top Scorers depend on timely ingestion of recent finished matches; ensure `FETCH_PAST_HOURS` is >= window you display (e.g. 12h covers overnight fixtures).

## Troubleshooting

No player stats appearing:

- Confirm `FALLBACK_PLAYER_STATS=1`.
- Check logs for enrichment of lineups + incidents.
- Run recent backfill script to reconstruct.

Slow enrichment / rate limiting:

- Lower `ENRICH_MAX_EVENTS` or increase sleep between cycles.

Missing assists:

- Incidents endpoint lacks explicit assist mapping in current provider responses – feature pending alternate derivation.

---

Original Vite README content below (kept for reference):

## React + Vite Template Info

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

For production apps consider TypeScript with type-aware lint rules.
