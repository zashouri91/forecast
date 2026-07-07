# CM Forecast Tool

Static, client-side capacity forecasting for Community Manager (CM) teams across PulsePoint sites. Upload the standard exports (site meeting binders, approved-events planning grid, executed-events results, space report, travelers CSV) and get a site × day utilization forecast with risk flags.

## Run

```
npm install
npm start          # serves on :3500
npm run bake       # re-bake reference.xlsx into index.html after editing site data
```

## How the model works

- **Capacity** = CMs at site × availability factor (default 85%) × meeting-equivalents/day (default 5)
- **Load** = meetings×1 + events×5 + VIPs×3 + attendees/75 + catering×2 + VP+ travelers×0.5
- **Utilization** = load ÷ capacity, with a baseline floor (default 25%) — flagged Amber ≥70%, Red >100% or on override rules (event stacking, back-to-back events, bad-day combos)
- All assumptions are adjustable in **Overview → Capacity Model Settings**, which also shows a **90-day backtest** of how current settings classify historical data.

## Data-quality safeguards (applied automatically on upload)

- Site nicknames resolve to canonical reference sites (e.g. "Willis Tower" → Chicago), with filename fallback for unmatched/blank Site values and a manual override UI.
- Cancelled meetings/events are tracked but excluded from load.
- "VIP/Meeting Host" name columns only count as VIPs when corroborated by an SLT column or an executive title (configurable in model settings).
- Binder rows flagged `Event = TRUE` are weighted as events; binder rows duplicating an approved/executed event on the same site+day are merged (never double-counted).
- Exact duplicate rows, weekend rows, non-confirmed space reservations, and implausible dates (<2020 or >18 months out) are skipped — every skip is counted and surfaced in the **Data Health** panel (Validate step) and the dashboard subtitle.
- Travelers below the VP+ manager level (default 25) are shown but don't add CM load.
- Multi-day records load every weekday they span.

## Repo layout

- `index.html` — the entire app (upload → map → validate → dashboard)
- `reference.xlsx` + `scripts/bake-reference.mjs` — canonical site/CM/capacity data baked into the page
- `cm-forecast-tool.html` — legacy single-file version
