import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "output/handoff");
mkdirSync(output, { recursive: true });
const bundled = resolve(output, "activity-benchmark.cjs");
await build({
  entryPoints: [resolve(root, "src/lib/activity.ts")],
  bundle: true, platform: "node", format: "cjs", outfile: bundled, logLevel: "silent",
});
const { normalizeRuntimeState, EMPTY_RUNTIME_STATE } = createRequire(import.meta.url)(bundled);
const providers = ["codex", "claude", "qoder", "trae", "workbuddy", "volcengine", "antigravity"];
const now = Date.now();
const results = [];
for (const count of [1_000, 30_000, 120_000]) {
  const history = Array.from({ length: count }, (_, i) => ({
    provider: providers[i % providers.length],
    capturedAt: new Date(now - (count - i) * 60_000).toISOString(),
    metric: i % 101, metricKind: "percent", status: "ok", resetsAt: null,
  }));
  const input = { ...structuredClone(EMPTY_RUNTIME_STATE), history };
  const samples = [];
  let normalized;
  for (let run = 0; run < 4; run++) {
    const started = performance.now();
    normalized = normalizeRuntimeState(input);
    const duration = performance.now() - started;
    if (run > 0) samples.push(duration);
  }
  const serialization = {};
  for (const [label, space] of [["pretty", 2], ["compact", undefined]]) {
    const started = performance.now();
    const json = JSON.stringify(normalized, null, space);
    serialization[label] = {
      milliseconds: performance.now() - started,
      bytes: Buffer.byteLength(json),
      exceeds20MiB: Buffer.byteLength(json) > 20 * 1024 * 1024,
    };
  }
  results.push({ inputPoints: count, retainedPoints: normalized.history.length,
    normalizeMedianMs: samples.sort((a, b) => a - b)[1], serialization });
}
const report = {
  measuredAt: new Date().toISOString(),
  baseline: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  node: process.version, platform: process.platform, cpu: os.cpus()[0]?.model,
  scope: "Synthetic Node aggregation and JSON serialization only; not Tauri startup, native CPU/memory or disk persistence. Seven providers, one-minute spacing; no real user data.",
  results,
};
writeFileSync(resolve(output, "history-benchmark.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
