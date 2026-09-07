# Synthetic history performance baseline

Measured 2026-09-08 Asia/Shanghai against code baseline `7a3db22`. Environment: Windows, Intel Core i7-8650U, Node v24.14.0. This is a synthetic Node aggregation/serialization benchmark, not a measurement of native Tauri startup, idle CPU, working-set memory, or disk persistence.

The fixture contains seven synthetic providers, valid percentage history points spaced one minute apart, and no user credentials or real usage. One warm-up and three measured normalization runs were used; the table reports the median. Serialization is a single observation. These are diagnostic measurements, not portable performance guarantees.

| Input / retained points | Normalize median | Pretty JSON serialization | Pretty JSON bytes |
|---|---:|---:|---:|
| 1,000 | 7.28 ms | 3.18 ms | 186,378 |
| 30,000 | 94.04 ms | 51.94 ms | 5,581,934 |
| 120,000 | 279.71 ms | 108.24 ms | 22,326,769 |

## Consequence

A structurally valid history at the existing 120,000-point count limit can exceed the 20 MiB runtime/backup byte limit solely as pretty-printed JSON. The storage task should evaluate compact JSON first, retain identical byte-limit semantics between export and import, and preserve old state on failure. Do not silently discard points to make a test pass. Combined daily summaries can still exceed the byte limit and require an explicit user-visible failure or a separately designed archive strategy.

The measurements also support filtering detached-pane history before IPC and normalization. A full database migration is not justified by this limited benchmark alone.

## Native acceptance still required

Record startup-to-first-render latency, idle CPU and working set, provider refresh latency, per-minute disk writes, and one-versus-multiple detached panes on a fixed native fixture with provider network access disabled. Record OS, scale, build profile, duration and raw samples. Set regression thresholds only after obtaining repeatable native measurements. Browser preview and Node benchmark results cannot be substituted for native desktop results.

Run `node scripts/measure-history.mjs` to reproduce bounded 1,000/30,000/120,000-point measurements against the current checkout. It writes `output/handoff/history-benchmark.json` with the Git baseline, environment, retained count, normalization timing, and both pretty/compact JSON timing and size. Use the locked development dependencies. It reads no user history and does not run provider adapters. Close competing builds before comparing timings.

The original diagnostic result remains in `output/handoff/performance-baseline.json`. A Rust round-trip test added in `3bf4721` independently verified that all 120,000 legal records fit as compact runtime and backup JSON (14,629,439 and 14,629,491 bytes for that test fixture) and that an oversized write preserves the previous state. The Rust and Node fixtures differ, so their byte counts should not be compared as identical payloads.
