# Global reset prediction refresh

The global Codex reset forecast now answers three questions first: what the primary model estimates over 24/48 hours, when to check again, and how to plan while the outcome remains uncertain. The personal reset and consumption plan remain separate.

## Why the old result was usually mixed

The three public trackers were reporting different last-reset baselines. A frozen October 14 observation had October 13, September 26 and July 25 baselines with respective 48-hour scores of 34, 50 and 94. The old logic required a second tracker to corroborate the newest baseline before excluding old ones, then hid the aggregate whenever the sources conflicted.

Only the Codex Reset forecast was captured as a complete raw public response. The other two values are normalized observations, not complete raw-response replay fixtures. This comparison demonstrates source-selection behavior, not predictive accuracy.

## Current behavior

- Select the newest reported baseline cohort, within 24 hours, then choose the most informative source using source reliability and generation time as tie breakers. Never choose the highest score or average old baselines into the primary estimate.
- Preserve source-model 24/48-hour estimates and sampling bands. Signal-only references display `/100`, not probability percentages. Every result remains low confidence; model results are experimental.
- Show a source-reported future window only as unverified. A historical daily watch window is a separate concept, fixed to the source calculation time; reading a cache cannot move it forward another day.
- Keep the six-hour freshness limit. Refresh failures retain still-valid evidence without changing its generation time or expiry. Expired evidence disappears and source links plus retry remain available.
- Open the explanation directly from the widget and Insights forecast buttons. Keep disagreement, excluded sources and links under a separate evidence disclosure. Use the existing Aurora, Graphite and Paper tokens in light/dark variants.
- Preserve personal quota pacing: public predictions cannot increase the daily budget, change the provider's reset time or claim an official announcement.

The October 14 primary observation was 19% over 24 hours and 34% over 48 hours, with a 21.8–48.7% 48-hour sampling band. Its historical watch period was 03:00–06:00 UTC. These are dated third-party observations, not a promised future reset or a calibrated confidence interval.

## Evidence and limitations

Public inputs: [Codex Reset forecast](https://codex-reset.com/api/forecast), [model method](https://codex-reset.com/forecast-method), [Reset Radar](https://codexresetradar.com/api/status), and [Will Codex Reset Today](https://codexreset.app/api/signal).

No accuracy improvement is claimed. Establishing that would require predictions frozen before outcomes, a consistent global-reset event definition, time-separated evaluation and proper scoring/calibration checks. This change fixes usable presentation, source attribution and time semantics. It introduces no private account collection or telemetry.

Development evidence is stored locally under `output/reset-prediction-20261014/`. Browser previews and native UI tests use synthetic data. Release verification and public asset identity are recorded separately.
