import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { nextVersion } from "./release.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const WORKFLOW = "release.yml";
const VERSION_SPEC = /^(?:patch|minor|major|beta|stable|\d+\.\d+\.\d+(?:-beta\.\d+)?)$/;
const DEFAULT_RECORD = resolve(ROOT, "output", "release-resume.json");

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
  const matches = runs
    .filter(
      (run) =>
        run.event === "workflow_dispatch" &&
        run.headSha === sourceSha &&
        !previousRunIds.has(String(run.databaseId)),
    );
  if (matches.length > 1) throw new Error("Multiple new release runs match this source. Dispatch will not be repeated; inspect GitHub and resume an identified run.");
  return matches[0];
}

function jobByName(jobs, name) {
  return jobs.find((job) => job.name === name);
}

export function workflowVerificationErrors(run, { stable }) {
  const errors = [];
  if (run.status !== "completed" || run.conclusion !== "success") {
    errors.push(`workflow=${run.status}/${run.conclusion ?? "unknown"}`);
  }

  for (const name of ["verify", "create-release-ref", "create-draft", "finalize"]) {
    const job = jobByName(run.jobs ?? [], name);
    if (!job || job.conclusion !== "success") errors.push(`${name} did not succeed`);
  }

  const publishJobs = (run.jobs ?? []).filter((job) => job.name.startsWith("publish-draft"));
  const windowsJob = jobByName(run.jobs ?? [], "publish-windows") ?? publishJobs.find((job) => job.name.includes("windows-latest"));
  const macJob = jobByName(run.jobs ?? [], "publish-macos") ?? publishJobs.find((job) => job.name.includes("macos-latest"));
  if (jobByName(run.jobs ?? [], "publish-windows") || jobByName(run.jobs ?? [], "publish-macos")) {
    // Older runs used a separate job; current runs assemble before publishing in finalize.
    const assembly = jobByName(run.jobs ?? [], "assemble-updater") ??
      jobByName(run.jobs ?? [], "finalize")?.steps?.find((step) =>
        step.name === "Write the updater manifest once from both verified platform builds");
    if (assembly?.conclusion !== "success") errors.push("assemble-updater did not succeed");
  }
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

export async function retryRead(operation, { attempts = 3, wait = sleep } = {}) {
  let failure;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await operation(); } catch (error) { failure = error; }
    if (attempt + 1 < attempts) await wait(1_000 * (attempt + 1));
  }
  throw failure;
}

export async function dispatchOnceAndRecover({ dispatch, discover, onUnconfirmed = () => {} }) {
  try { await dispatch(); } catch (error) { onUnconfirmed(error); }
  // A missing response can mean the dispatch succeeded. Never repeat this mutation.
  return discover();
}

function readJson(args) { return retryRead(() => runJson("gh", args)); }
function api(repo, path) { return readJson(["api", `repos/${repo}/${path}`]); }

function workflowRuns(repo) {
  return readJson([
    "run",
    "list",
    "--workflow",
    WORKFLOW,
    "--repo", repo,
    "--limit",
    "30",
    "--json",
    "databaseId,createdAt,event,headSha,status,conclusion,url,displayTitle",
  ]);
}

async function awaitDispatchedRun(previousRunIds, sourceSha, repo) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const selected = selectNewWorkflowRun(await workflowRuns(repo), previousRunIds, sourceSha);
    if (selected) return selected;
    await sleep(3_000);
  }
  throw new Error("Dispatch outcome is unknown: no unique matching run appeared. Dispatch was not repeated. Use --resume with the saved record after inspecting GitHub.");
}

export function validateRecoveryRecord(record, repo) {
  if (!record || record.schema !== 1 || record.repo !== repo || record.workflow !== WORKFLOW ||
      !/^[a-f0-9]{40}$/i.test(record.sourceSha ?? "") || !VERSION_SPEC.test(record.versionSpec ?? "") ||
      !/^v\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(record.tag ?? "") ||
      !["publish", "dry-run"].includes(record.mode) ||
      (record.runId !== null && !/^\d+$/.test(String(record.runId)))) {
    throw new Error("Recovery record does not match this repository or is invalid. Nothing was dispatched or modified.");
  }
  if (!Array.isArray(record.previousRunIds) || record.previousRunIds.some((id) => !/^\d+$/.test(String(id)))) {
    throw new Error("Recovery record has an invalid prior run inventory.");
  }
  return record;
}

export function runIdentityErrors(record, remote, sourceVersion) {
  const errors = [];
  if (String(remote.id) !== String(record.runId)) errors.push("run ID mismatch");
  if (remote.repository?.full_name !== record.repo) errors.push("repository mismatch");
  if (remote.path !== `.github/workflows/${record.workflow}`) errors.push("workflow mismatch");
  if (remote.event !== "workflow_dispatch" || remote.head_branch !== "main") errors.push("run is not a main workflow dispatch");
  if (remote.head_sha !== record.sourceSha) errors.push("source SHA mismatch");
  const legacyTitle = `Release ${record.versionSpec}`;
  const boundTitle = `${legacyTitle} (publish=${record.mode === "publish"})`;
  if (![legacyTitle, boundTitle].includes(remote.display_title)) errors.push("requested version or publish mode mismatch");
  try { if (`v${nextVersion(sourceVersion, record.versionSpec)}` !== record.tag) errors.push("target version mismatch"); }
  catch { errors.push("source version cannot produce the recorded target"); }
  return errors;
}

export function runOutcome(run) {
  if (run.status !== "completed") return "pending";
  if (!run.conclusion) return "unknown";
  return run.conclusion === "success" ? "success" : "failed";
}

export function workflowTimings(jobs) {
  const measured = jobs.flatMap((job) => {
    const start = Date.parse(job.startedAt);
    const end = Date.parse(job.completedAt);
    if (job.conclusion === "skipped" || !Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
    return [{ name: job.name, startedAt: job.startedAt, completedAt: job.completedAt, seconds: (end - start) / 1000 }];
  });
  return {
    // Parallel job durations must not be summed as elapsed release time.
    elapsedSeconds: measured.length ? (Math.max(...measured.map((job) => Date.parse(job.completedAt))) -
      Math.min(...measured.map((job) => Date.parse(job.startedAt)))) / 1000 : null,
    jobs: measured,
  };
}

export async function observeWorkflowRun(initial, { watch, read, onWatchFailure = () => {}, reconnects = 2 }) {
  if (initial.status === "completed") return read();
  for (let attempt = 0; attempt <= reconnects; attempt += 1) {
    try {
      const watched = await watch();
      if (watched.status !== 0) onWatchFailure();
    } catch { onWatchFailure(); }
    // Watch is only a convenience stream. Its exit code never decides remote success or failure.
    const details = await read();
    if (details.status === "completed" || attempt === reconnects) return details;
  }
}

export function releaseAncestryErrors(tagCommit, mainCommit, comparison) {
  if (tagCommit.sha === mainCommit.sha) return [];
  if (comparison?.status === "ahead" && comparison.merge_base_commit?.sha === tagCommit.sha) return [];
  return ["current main does not contain the verified release commit"];
}

export function recoveryRecordFromRun(remote, repo, sourceVersion) {
  const title = /^Release (.+) \(publish=(true|false)\)$/.exec(remote.display_title ?? "");
  if (!title || !VERSION_SPEC.test(title[1])) throw new Error("This run does not expose its version and mode; resume requires its original recovery record.");
  const record = {
    schema: 1, repo, workflow: WORKFLOW, sourceSha: remote.head_sha,
    versionSpec: title[1], tag: `v${nextVersion(sourceVersion, title[1])}`,
    mode: title[2] === "true" ? "publish" : "dry-run", runId: String(remote.id), previousRunIds: [],
  };
  validateRecoveryRecord(record, repo);
  const errors = runIdentityErrors(record, remote, sourceVersion);
  if (errors.length) throw new Error(`Run identity verification failed: ${errors.join("; ")}`);
  return record;
}

export function parsePublishArgs(args) {
  const options = { spec: null, resume: false, runId: null, recordPath: DEFAULT_RECORD, recordExplicit: false, plan: false, dryRun: false, publish: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--resume") {
      options.resume = true;
      if (args[index + 1] && !args[index + 1].startsWith("--")) options.runId = args[++index];
    } else if (arg === "--record") {
      if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error("--record requires a path.");
      options.recordPath = resolve(ROOT, args[++index]);
      options.recordExplicit = true;
    } else if (arg === "--plan") options.plan = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--yes") options.publish = true;
    else if (!arg.startsWith("--") && options.spec === null) options.spec = arg;
    else throw new Error(`Unknown or duplicate argument: ${arg}`);
  }
  if (options.resume) {
    if (options.spec || options.plan || options.dryRun || options.publish) throw new Error("--resume cannot be combined with a version, --yes, --dry-run, or --plan.");
    if (options.runId !== null && !/^\d+$/.test(options.runId)) throw new Error("--resume requires a numeric workflow run ID.");
  } else if (!VERSION_SPEC.test(options.spec ?? "") || [options.plan, options.dryRun, options.publish].filter(Boolean).length !== 1) {
    throw new Error("Choose a supported version and exactly one of --plan, --dry-run, or --yes.");
  }
  return options;
}

function saveRecord(record, path) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`);
  renameSync(temporary, path);
  console.log(`Recovery record: ${path}`);
  console.log(`Repository: ${record.repo}; source: ${record.sourceSha}; target: ${record.tag}; mode: ${record.mode}; run: ${record.runId ?? "awaiting discovery"}`);
}

async function sourcePackageVersion(record) {
  const file = await api(record.repo, `contents/package.json?ref=${record.sourceSha}`);
  if (file.encoding !== "base64") throw new Error("Cannot verify the source package version.");
  return JSON.parse(Buffer.from(file.content, "base64").toString("utf8")).version;
}

async function verifyExistingRun(record, recordPath) {
  if (!record.runId) {
    const discovered = await awaitDispatchedRun(new Set(record.previousRunIds.map(String)), record.sourceSha, record.repo);
    record.runId = String(discovered.databaseId);
    saveRecord(record, recordPath);
  }
  const remote = await api(record.repo, `actions/runs/${record.runId}`);
  const identityErrors = runIdentityErrors(record, remote, await sourcePackageVersion(record));
  if (identityErrors.length) throw new Error(`Recovery identity verification failed: ${identityErrors.join("; ")}`);
  saveRecord(record, resolve(ROOT, "output", "release-runs", `${record.runId}.json`));
  console.log(`Workflow: ${remote.html_url}`);
  let details;
  try {
    details = await observeWorkflowRun(remote, {
      watch: () => commandResult("gh", ["run", "watch", record.runId, "--repo", record.repo, "--exit-status", "--interval", "10"], { inherit: true }),
      read: () => readJson(["run", "view", record.runId, "--repo", record.repo, "--json", "status,conclusion,url,headSha,jobs"]),
      onWatchFailure: () => console.warn("Workflow watch disconnected or returned nonzero; checking authoritative run state."),
    });
  } catch {
    throw new Error(`Remote outcome is unknown (read failed). Resume with --resume ${record.runId} --record "${recordPath}". This is not evidence of a failed workflow.`);
  }
  if (details.headSha !== record.sourceSha) throw new Error("Observed run source changed; refusing verification.");
  const outcome = runOutcome(details);
  if (outcome === "pending") throw new Error(`Workflow remains ${details.status}. Resume with --resume ${record.runId} --record "${recordPath}"; no new dispatch is needed.`);
  if (outcome === "unknown") throw new Error(`Workflow conclusion is unknown. Resume with --resume ${record.runId} --record "${recordPath}"; this is not evidence of a failed workflow.`);
  if (outcome === "failed") throw new Error(`Remote workflow completed with ${details.conclusion}: ${details.url}`);
  if (record.mode === "dry-run") {
    const refJob = jobByName(details.jobs ?? [], "create-release-ref");
    const publishingJobs = ["create-release-ref", "create-draft", "publish-windows", "publish-macos", "assemble-updater", "finalize", "upgrade-smoke"];
    if (!refJob || refJob.conclusion !== "skipped" || jobByName(details.jobs ?? [], "verify")?.conclusion !== "success" ||
        (details.jobs ?? []).some((job) => (publishingJobs.includes(job.name) || job.name.startsWith("publish-draft")) && job.conclusion !== "skipped")) {
      throw new Error("Run does not match the recorded dry-run mode.");
    }
    console.log(`Remote verification passed for ${record.tag}. No release refs or assets were created.`);
    return;
  }
  const errors = workflowVerificationErrors(details, { stable: !record.tag.includes("-") });
  const release = await readJson(["release", "view", record.tag, "--repo", record.repo, "--json", "tagName,isDraft,isPrerelease,url,targetCommitish,assets"]);
  errors.push(...releaseVerificationErrors(release, record.tag));
  const tagCommit = await api(record.repo, `commits/${record.tag}`);
  const mainCommit = await api(record.repo, "commits/main");
  const comparison = tagCommit.sha !== mainCommit.sha ? await api(record.repo, `compare/${tagCommit.sha}...${mainCommit.sha}`) : null;
  errors.push(...releaseAncestryErrors(tagCommit, mainCommit, comparison));
  if (release.targetCommitish !== tagCommit.sha) errors.push("the public Release does not target the release commit");
  if (!(tagCommit.parents ?? []).some((parent) => parent.sha === record.sourceSha)) errors.push("release commit is not directly based on the verified source");
  if (errors.length) throw new Error(`Post-publish verification failed:\n- ${errors.join("\n- ")}`);
  const publicRelease = await api(record.repo, `releases/tags/${record.tag}`);
  if (publicRelease.tag_name !== record.tag || publicRelease.target_commitish !== tagCommit.sha) {
    throw new Error("Public release identity changed before artifact verification.");
  }
  const freshReleaseErrors = releaseVerificationErrors({ tagName: publicRelease.tag_name, isDraft: publicRelease.draft, isPrerelease: publicRelease.prerelease, assets: publicRelease.assets }, record.tag);
  if (publicRelease.target_commitish !== tagCommit.sha) freshReleaseErrors.push("public release target changed before artifact verification");
  if (freshReleaseErrors.length) throw new Error(`Public artifact identity verification failed: ${freshReleaseErrors.join("; ")}`);
  const configFile = await api(record.repo, `contents/src-tauri/tauri.conf.json?ref=${tagCommit.sha}`);
  if (configFile.encoding !== "base64") throw new Error("Cannot read the released updater public key.");
  const releasedConfig = JSON.parse(Buffer.from(configFile.content, "base64").toString("utf8"));
  const { verifyPublicArtifacts } = await import("./verify-public-artifacts.mjs");
  const artifactVerification = await verifyPublicArtifacts({
    release: publicRelease,
    publicKey: releasedConfig.plugins?.updater?.pubkey,
    outputDirectory: resolve(ROOT, "output", "release-runs", `${record.runId}-artifacts`),
  });
  console.log(`Artifact verification report: ${artifactVerification.reportPath}`);
  const report = { ...record, verifiedAt: new Date().toISOString(), releaseCommit: tagCommit.sha, mainAtVerification: mainCommit.sha, mainAdvanced: mainCommit.sha !== tagCommit.sha, releaseUrl: release.url, assets: release.assets, timings: workflowTimings(details.jobs ?? []), verification: "workflow, Defender step, public state, artifact integrity, signatures and commit identity", artifactVerification };
  saveRecord(report, resolve(ROOT, "output", "release-runs", `${record.runId}-verification.json`));
  console.log(`Published and verified ${record.tag}: ${release.url}`);
  console.log(`Release commit: ${tagCommit.sha}`);
  console.log(`Verified assets: ${release.assets.map((asset) => asset.name).join(", ")}`);
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
  npm run publish:release -- --resume
  npm run publish:release -- --resume RUN_ID [--record PATH]

--yes      Publish through the guarded GitHub Actions workflow.
--dry-run  Run the remote verification gate without creating a commit, tag, or Release.
--plan     Validate local state and print the target version without network access.
--resume   Only observe and verify an existing run; never bump, tag, dispatch, or publish.
--record   Recovery JSON location (default: output/release-resume.json).
           A run ID without a saved record requires a version/mode-bound run title.`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  const { spec, plan, publish, resume, runId, recordPath, recordExplicit } = parsePublishArgs(args);
  if (resume) {
    const { nameWithOwner: repo } = await readJson(["repo", "view", "--json", "nameWithOwner"]);
    let record;
    const perRunPath = runId ? resolve(ROOT, "output", "release-runs", `${runId}.json`) : null;
    if (existsSync(recordPath)) record = JSON.parse(readFileSync(recordPath, "utf8"));
    if (runId && record?.runId && String(record.runId) !== runId) {
      if (recordExplicit) throw new Error("Requested run ID does not match the explicitly supplied recovery record.");
      record = undefined;
    }
    if (!record && perRunPath && existsSync(perRunPath)) record = JSON.parse(readFileSync(perRunPath, "utf8"));
    if (!record) {
      if (!runId) throw new Error("No recovery record found. Supply an existing workflow run ID with --resume RUN_ID.");
      const remote = await api(repo, `actions/runs/${runId}`);
      const sourceVersion = await sourcePackageVersion({ repo, sourceSha: remote.head_sha });
      record = recoveryRecordFromRun(remote, repo, sourceVersion);
    }
    validateRecoveryRecord(record, repo);
    if (runId) {
      if (record.previousRunIds.map(String).includes(runId)) throw new Error("Requested run predates the saved dispatch.");
      record.runId = runId;
    }
    saveRecord(record, recordPath);
    await verifyExistingRun(record, recordPath);
    return;
  }

  assertLocalReleaseState();
  const target = run("npm", ["run", "--silent", "release", "--", spec, "--print-target"]);
  const tag = `v${target}`;
  console.log(`Release target: ${tag}`);
  if (plan) {
    console.log("Plan complete. No network request or repository change was made.");
    return;
  }

  const { nameWithOwner: repo } = await readJson(["repo", "view", "--json", "nameWithOwner"]);
  await retryRead(() => run("git", ["fetch", "origin", "main", "--tags"], { inherit: true }));
  const sourceSha = run("git", ["rev-parse", "HEAD"]);
  const remoteSha = run("git", ["rev-parse", "origin/main"]);
  if (sourceSha !== remoteSha) {
    throw new Error(`Local main (${sourceSha.slice(0, 8)}) must exactly match origin/main (${remoteSha.slice(0, 8)}).`);
  }
  if (run("git", ["tag", "--list", tag])) throw new Error(`${tag} already exists.`);

  const before = await workflowRuns(repo);
  const active = before.filter((run) => run.status !== "completed");
  if (active.length > 0) {
    throw new Error(`Another release workflow is active: ${active[0].url}`);
  }
  const previousRunIds = new Set(before.map((run) => String(run.databaseId)));
  const publishValue = publish ? "true" : "false";
  console.log(`${publish ? "Publishing" : "Verifying"} ${tag} through GitHub Actions...`);
  const record = { schema: 1, repo, workflow: WORKFLOW, sourceSha, tag, versionSpec: spec, mode: publish ? "publish" : "dry-run", runId: null, previousRunIds: [...previousRunIds], dispatchedAt: new Date().toISOString() };
  saveRecord(record, recordPath);
  await dispatchOnceAndRecover({
    dispatch: () => run("gh", ["workflow", "run", WORKFLOW, "--repo", repo, "--ref", "main", "-f", `version=${spec}`, "-f", `publish=${publishValue}`]),
    discover: () => verifyExistingRun(record, recordPath),
    onUnconfirmed: (error) => console.warn(`Dispatch response was not confirmed: ${error.message}. Looking for a matching run; dispatch will not be repeated.`),
  });
}

const invokedDirectly = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`Release command stopped: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
