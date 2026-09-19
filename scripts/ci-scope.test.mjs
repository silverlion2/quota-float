import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { classifyChanges, documentationOnly } from "./ci-scope.mjs";

const sha = "a".repeat(40);
describe("CI change scope", () => {
  it("skips builds only for a nonempty allowlisted documentation diff", () => {
    expect(documentationOnly(["README.md", "README.zh-CN.md", "CHANGELOG.md", "docs/RELEASE-0.3.19.md"])).toBe(true);
    for (const path of ["src/README.md", "AGENTS.md", "package.json", ".github/workflows/ci.yml", "scripts/ci-scope.mjs", "docs/build.js", "docs/image.svg", "docs/../src/README.md"]) {
      expect(documentationOnly(["docs/report.md", path]), path).toBe(false);
    }
    expect(documentationOnly([])).toBe(false);
  });

  it("runs the full gate for manual runs, missing bases or metadata failures", () => {
    const git = vi.fn(() => { throw new Error("missing commit"); });
    expect(classifyChanges("workflow_dispatch", {}, git)).toBe("full");
    expect(classifyChanges("push", { before: "0".repeat(40) }, git)).toBe("full");
    expect(classifyChanges("push", { before: "--option" }, git)).toBe("full");
    expect(git).not.toHaveBeenCalled();
    expect(classifyChanges("push", { before: sha }, git)).toBe("full");
  });

  it("examines both sides of renames and the full pull request diff", () => {
    const git = vi.fn((args) => args[0] === "merge-base" ? `${sha}\n` : "src/deleted.ts\0docs/moved.md\0");
    expect(classifyChanges("pull_request", { pull_request: { base: { sha } } }, git)).toBe("full");
    expect(git).toHaveBeenLastCalledWith(["diff", "--no-renames", "--name-only", "-z", sha, "HEAD"]);
    expect(classifyChanges("push", { before: sha }, () => "docs/中文说明.md\0")).toBe("docs");
  });

  it("preserves existing check job names, supports full manual CI and cancels only superseded CI", () => {
    const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    expect(workflow).toContain("  workflow_dispatch:");
    expect(workflow).toContain("group: ci-${{ github.event.pull_request.number || github.ref }}");
    expect(workflow).toContain("cancel-in-progress: true");
    expect(workflow).toContain("  frontend:\n    needs: changes\n");
    expect(workflow).toContain("  desktop:\n    needs: [changes, frontend]\n");
    expect(workflow).not.toMatch(/(?:frontend|desktop):\n\s+if:/);
    const gated = workflow.split("  frontend:\n")[1];
    const steps = gated.split(/\n      - /).slice(1);
    for (const step of steps) {
      expect(step).toContain("needs.changes.outputs.scope");
    }
  });
});
