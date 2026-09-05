import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const WORKFLOW = "release.yml";
const VERSION_SPEC = /^(?:patch|minor|major|beta|stable|\d+\.\d+\.\d+(?:-beta\.\d+)?)$/;

const REQUIRED_ASSETS = [
  ["updater manifest", (name) => name === "latest.json"],
  ["Windows installer", (name) => /_x64-setup\.exe$/.test(name)],
  ["Windows updater signature", (name) => /_x64-setup\.exe\.sig$/.test(name)],
  ["macOS Universal DMG", (name) => /_universal\.dmg$/.test(name)],
  ["macOS updater archive", (name) => /_universal\.app\.tar\.gz$/.test(name)],
  ["macOS updater signature", (name) => /_universal\.app\.tar\.gz\.sig$/.test(name)],
];

function commandResult(name, args, { inherit = false } = {}) {
  const windowsNpm = process.platform === "win32" && name === "npm";
  const command = windowsNpm ? process.env.ComSpec || "cmd.exe" : name;
  const commandArgs = windowsNpm ? ["/d", "/s", "/c", "npm", ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  return result;
}

function run(name, args, options = {}) {
  const result = commandResult(name, args, options);
  if (result.status !== 0) {
    const detail = options.inherit ? "" : `\n${result.stderr || result.stdout}`;
    throw new Error(`${name} ${args.join(" ")} failed with exit code ${result.status}.${detail}`);
  }
  return options.inherit ? "" : result.stdout.trim();
}

function runJson(name, args) {
  const raw = run(name, args);
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${name} returned invalid JSON.`);
  }
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

export function missingReleaseAssets(assetNames) {
  return REQUIRED_ASSETS.filter(([, matches]) => !assetNames.some(matches)).map(([label]) => label);
}

export function selectNewWorkflowRun(runs, previousRunIds, sourceSha) {
  return runs
    .filter(
      (run) =>
        run.event === "workflow_dispatch" &&
        run.headSha === sourceSha &&
        !previousRunIds.has(String(run.databaseId)),
    )
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
}

function jobByName(jobs, name) {
  return jobs.find((job) => job.name === name);
}

export function workflowVerificationErrors(run, { stable }) {
  const errors = [];
  if (run.status !== "completed" || run.conclusion !== "success") {
    errors.push(`workflow=${run.status}/${run.conclusion ?? "unknown"}`);
  }

  for (const name of ["verify", "create-release-ref", "finalize"]) {
    const job = jobByName(run.jobs ?? [], name);
    if (!job || job.conclusion !== "success") errors.push(`${name} did not succeed`);
  }

  const publishJobs = (run.jobs ?? []).filter((job) => job.name.startsWith("publish-draft"));
  const windowsJob = publishJobs.find((job) => job.name.includes("windows-latest"));
  const macJob = publishJobs.find((job) => job.name.includes("macos-latest"));
  if (!windowsJob || windowsJob.conclusion !== "success") errors.push("Windows publish job did not succeed");
  if (!macJob || macJob.conclusion !== "success") errors.push("macOS publish job did not succeed");

  const defender = windowsJob?.steps?.find((step) => step.name === "Scan the exact Windows release artifacts with Microsoft Defender");
  if (!defender || defender.conclusion !== "success") errors.push("Microsoft Defender release scan did not succeed");

  if (stable) {
    const upgrade = jobByName(run.jobs ?? [], "upgrade-smoke");
    if (!upgrade || upgrade.conclusion !== "success") errors.push("stable upgrade smoke did not succeed");
  }
  return errors;
}

export function releaseVerificationErrors(release, tag) {
  const errors = [];
  if (release.tagName !== tag) errors.push(`release tag is ${release.tagName ?? "missing"}, expected ${tag}`);
  if (release.isDraft) errors.push("release is still a draft");
  if (release.isPrerelease !== tag.includes("-")) errors.push("release prerelease state does not match the tag");
  const missing = missingReleaseAssets((release.assets ?? []).map((asset) => asset.name));
  if (missing.length > 0) errors.push(`missing assets: ${missing.join(", ")}`);
  return errors;
}

function workflowRuns() {
  return runJson("gh", [
    "run",
    "list",
    "--workflow",
    WORKFLOW,
    "--limit",
    "30",
    "--json",
    "databaseId,createdAt,event,headSha,status,conclusion,url,displayTitle",
  ]);
}

async function awaitDispatchedRun(previousRunIds, sourceSha) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const selected = selectNewWorkflowRun(workflowRuns(), previousRunIds, sourceSha);
    if (selected) return selected;
    await sleep(3_000);
  }
  throw new Error("GitHub accepted the dispatch, but its workflow run did not appear within 60 seconds.");
}

function assertLocalReleaseState() {
  const branch = run("git", ["branch", "--show-current"]);
  if (branch !== "main") throw new Error(`Publishing requires main, not ${branch || "detached HEAD"}.`);
  if (run("git", ["status", "--porcelain"])) throw new Error("The worktree must be clean before publishing.");
}

function printUsage() {
  console.log(`Usage:
  npm run publish:release -- patch --yes
  npm run publish:release -- patch --dry-run
  npm run publish:release -- patch --plan

--yes      Publish through the guarded GitHub Actions workflow.
--dry-run  Run the remote verification gate without creating a commit, tag, or Release.
--plan     Validate local state and print the target version without network access.`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  const spec = args.find((arg) => !arg.startsWith("--"));
  if (!spec || !VERSION_SPEC.test(spec)) {
    throw new Error("Version must be patch, minor, major, beta, stable, or x.y.z[-beta.n].");
  }
  const plan = args.includes("--plan");
  const dryRun = args.includes("--dry-run");
  const publish = args.includes("--yes");
  if ([plan, dryRun, publish].filter(Boolean).length !== 1) {
    throw new Error("Choose exactly one of --plan, --dry-run, or --yes.");
  }

  assertLocalReleaseState();
  const target = run("npm", ["run", "--silent", "release", "--", spec, "--print-target"]);
  const tag = `v${target}`;
  console.log(`Release target: ${tag}`);
  if (plan) {
    console.log("Plan complete. No network request or repository change was made.");
    return;
  }

  run("gh", ["auth", "status"]);
  run("git", ["fetch", "origin", "main", "--tags"], { inherit: true });
  const sourceSha = run("git", ["rev-parse", "HEAD"]);
  const remoteSha = run("git", ["rev-parse", "origin/main"]);
  if (sourceSha !== remoteSha) {
    throw new Error(`Local main (${sourceSha.slice(0, 8)}) must exactly match origin/main (${remoteSha.slice(0, 8)}).`);
  }
  if (run("git", ["tag", "--list", tag])) throw new Error(`${tag} already exists.`);

  const before = workflowRuns();
  const active = before.filter((run) => run.status !== "completed");
  if (active.length > 0) {
    throw new Error(`Another release workflow is active: ${active[0].url}`);
  }
  const previousRunIds = new Set(before.map((run) => String(run.databaseId)));
  const publishValue = publish ? "true" : "false";
  console.log(`${publish ? "Publishing" : "Verifying"} ${tag} through GitHub Actions...`);
  run("gh", ["workflow", "run", WORKFLOW, "--ref", "main", "-f", `version=${spec}`, "-f", `publish=${publishValue}`]);

  const dispatched = await awaitDispatchedRun(previousRunIds, sourceSha);
  console.log(`Workflow: ${dispatched.url}`);
  const watched = commandResult("gh", ["run", "watch", String(dispatched.databaseId), "--exit-status", "--interval", "10"], {
    inherit: true,
  });
  if (watched.status !== 0) throw new Error(`Release workflow failed: ${dispatched.url}`);

  const runDetails = runJson("gh", [
    "run",
    "view",
    String(dispatched.databaseId),
    "--json",
    "status,conclusion,url,headSha,jobs",
  ]);
  if (!publish) {
    if (runDetails.status !== "completed" || runDetails.conclusion !== "success") {
      throw new Error(`Remote verification did not succeed: ${runDetails.url}`);
    }
    console.log(`Remote verification passed for ${tag}. No release refs or assets were created.`);
    return;
  }

  const workflowErrors = workflowVerificationErrors(runDetails, { stable: !tag.includes("-") });
  const release = runJson("gh", [
    "release",
    "view",
    tag,
    "--json",
    "tagName,isDraft,isPrerelease,url,targetCommitish,assets",
  ]);
  const releaseErrors = releaseVerificationErrors(release, tag);

  run("git", ["fetch", "origin", "main", "--tags"], { inherit: true });
  const tagSha = run("git", ["rev-list", "-n", "1", tag]);
  const publishedMainSha = run("git", ["rev-parse", "origin/main"]);
  if (tagSha !== publishedMainSha) releaseErrors.push("origin/main and the release tag do not point to the same commit");
  if (release.targetCommitish !== tagSha) releaseErrors.push("the public Release does not target the release commit");

  const errors = [...workflowErrors, ...releaseErrors];
  if (errors.length > 0) throw new Error(`Post-publish verification failed:\n- ${errors.join("\n- ")}`);

  console.log(`Published and verified ${tag}: ${release.url}`);
  console.log(`Release commit: ${tagSha}`);
  console.log(`Verified assets: ${release.assets.map((asset) => asset.name).join(", ")}`);
}

const invokedDirectly = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`Publish failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
