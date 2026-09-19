import { appendFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

// Deliberately narrow: unknown files, workflow/config changes and mixed diffs
// always run the full gate. Markdown outside docs can be build inputs.
export function documentationOnly(paths) {
  return paths.length > 0 && paths.every((path) =>
    !path.split("/").includes("..") &&
    /^(?:README(?:\.zh-CN)?\.md|CHANGELOG\.md|docs\/.+\.md)$/.test(path),
  );
}

export function classifyChanges(eventName, event, git) {
  if (!["push", "pull_request"].includes(eventName)) return "full";
  const base = eventName === "push" ? event.before : event.pull_request?.base?.sha;
  if (!/^[a-f0-9]{40}$/i.test(base ?? "") || /^0+$/.test(base)) return "full";
  try {
    const comparison = eventName === "pull_request" ? git(["merge-base", base, "HEAD"]).trim() : base;
    const paths = git(["diff", "--no-renames", "--name-only", "-z", comparison, "HEAD"])
      .split("\0").filter(Boolean);
    return documentationOnly(paths) ? "docs" : "full";
  } catch {
    // A missing base or unexpected Git response must never suppress tests.
    return "full";
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  let scope = "full";
  try {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    scope = classifyChanges(process.env.GITHUB_EVENT_NAME, event,
      (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }));
  } catch {
    // Keep the full gate when event metadata cannot be read.
  }
  if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required");
  appendFileSync(process.env.GITHUB_OUTPUT, `scope=${scope}\n`);
  console.log(scope === "docs" ? "Documentation-only change: preserve check results without native builds." : "Full CI required.");
}
