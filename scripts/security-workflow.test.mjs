import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(new URL("../.github/workflows/security.yml", import.meta.url), "utf8");

function extractJob(source, jobName) {
  const lines = source.split(/\r?\n/);
  const start = lines.indexOf(`  ${jobName}:`);

  if (start === -1) {
    return "";
  }

  const end = lines.findIndex((line, index) => index > start && /^  [a-zA-Z0-9_-]+:$/.test(line));
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

const rustsecJob = extractJob(workflow, "rustsec");
const rustsecHeader = rustsecJob.match(/^  rustsec:\n[\s\S]*?^    steps:/m)?.[0] ?? "";

describe("Security workflow policy", () => {
  it("isolates the RustSec policy from jobs added after it", () => {
    const sample = [
      "jobs:",
      "  rustsec:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: cargo audit",
      "  later-job:",
      "    if: always()",
      "    steps: []",
    ].join("\n");

    expect(extractJob(sample, "rustsec")).toBe(
      "  rustsec:\n    runs-on: ubuntu-latest\n    steps:\n      - run: cargo audit",
    );
  });

  it("runs pinned cargo-audit directly with read-only repository permissions", () => {
    expect(rustsecJob).not.toBe("");
    expect(workflow.match(/^permissions:/gm)).toHaveLength(1);
    expect(workflow).toContain("\npermissions:\n  contents: read\n\njobs:\n");
    expect(workflow).not.toContain("write-all");
    expect(rustsecJob).not.toMatch(/^    permissions:/m);
    expect(rustsecJob).toContain(
      "      - name: Install cargo-audit\n        run: cargo install cargo-audit --locked --version 0.22.2",
    );
    expect(rustsecJob).toContain(
      "      - name: Audit Rust dependencies\n        run: cargo audit --file src-tauri/Cargo.lock",
    );
    expect(rustsecJob).not.toContain("rustsec/audit-check");
    expect(rustsecJob).not.toContain("secrets.GITHUB_TOKEN");
  });

  it("uses supported Node 24 actions without persisting checkout credentials", () => {
    expect(workflow.match(/- uses: actions\/checkout@v7\n        with:\n          persist-credentials: false/g)).toHaveLength(
      3,
    );
    expect(workflow).toContain("      - uses: actions/dependency-review-action@v5");
    expect(workflow).toContain("      - uses: actions/setup-node@v7");
    expect(workflow).not.toMatch(/actions\/(?:checkout|setup-node)@v4/);
    expect(workflow).not.toContain("actions/dependency-review-action@v4");
  });

  it("keeps vulnerability failures blocking while leaving warnings visible", () => {
    expect(rustsecJob).not.toContain("continue-on-error:");
    expect(rustsecJob).not.toMatch(/^        if:/m);
    expect(rustsecJob).not.toMatch(/^        shell:/m);
    expect(rustsecJob.match(/^        run: cargo audit.*$/m)?.[0]).toBe(
      "        run: cargo audit --file src-tauri/Cargo.lock",
    );
  });

  it("keeps pull request, push, scheduled, and manual audit triggers", () => {
    expect(workflow).toContain("  pull_request:");
    expect(workflow).toContain("  push:");
    expect(workflow).toContain("  schedule:");
    expect(workflow).toContain("  workflow_dispatch:");
    expect(rustsecHeader).toBe("  rustsec:\n    runs-on: ubuntu-latest\n    steps:");
  });
});
