import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it.skipIf(process.platform !== "win32")("enumerates release arrays and preserves singleton responses in Windows PowerShell", () => {
  const source = readFileSync(new URL("./verify-windows-upgrade.ps1", import.meta.url), "utf8");
  const helper = source.match(/^function Invoke-GitHubJson\([^]*?^}/m)?.[0];
  expect(helper).toBeTruthy();
  const script = `
$ErrorActionPreference = 'Stop'
function gh {
  param($Verb, $Endpoint)
  $global:LASTEXITCODE = 0
  if ($Endpoint -eq 'latest') { '{"id":2,"tag_name":"v0.3.9"}' }
  else { '[{"id":1,"tag_name":"v0.3.10"},{"id":2,"tag_name":"v0.3.9"}]' }
}
${helper}
$releases = @(Invoke-GitHubJson 'releases')
$candidate = $releases | Where-Object { $_.tag_name -eq 'v0.3.10' } | Select-Object -First 1
if ($releases.Count -ne 2 -or $candidate.id -ne 1) { throw 'Release list was not enumerated into individual candidates.' }
$latest = Invoke-GitHubJson 'latest'
if ($latest.id -ne 2) { throw 'Singleton release response changed.' }
`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", timeout: 20_000 });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
}, 25_000);

it.skipIf(process.platform !== "win32")("pins upgrade smoke to the prepared release ID and rejects ambiguous fallback candidates", () => {
  const source = readFileSync(new URL("./verify-windows-upgrade.ps1", import.meta.url), "utf8");
  const resolution = source.slice(source.indexOf("if ($CandidateReleaseId -gt 0)"), source.indexOf('$previous = Invoke-GitHubJson'));
  expect(resolution).toContain("The prepared candidate release identity changed");
  const script = `
$ErrorActionPreference = 'Stop'
$Repository = 'owner/repo'
$CurrentTag = 'v0.3.20'
$CandidateReleaseId = 42
$script:mode = 'valid'
function Invoke-GitHubJson([string]$Endpoint) {
  if ($Endpoint -like '*?per_page=100' -and $CandidateReleaseId -gt 0) { throw 'Explicit ID unexpectedly enumerated releases.' }
  $value = @{ id = 42; tag_name = 'v0.3.20'; draft = $true }
  if ($script:mode -eq 'wrong-id') { $value.id = 43 }
  if ($script:mode -eq 'wrong-tag') { $value.tag_name = 'v0.3.19' }
  if ($script:mode -eq 'public') { $value.draft = $false }
  if ($script:mode -eq 'duplicate') { $value; $value } else { $value }
}
function Resolve-Candidate {
${resolution}
  return $candidate
}
$resolved = Resolve-Candidate
if ($resolved.id -ne 42) { throw 'The exact prepared release was not selected.' }
foreach ($mode in @('wrong-id', 'wrong-tag', 'public', 'duplicate')) {
  $script:mode = $mode
  $CandidateReleaseId = if ($mode -eq 'duplicate') { 0 } else { 42 }
  $rejected = $false
  try { Resolve-Candidate | Out-Null } catch { $rejected = $true }
  if (-not $rejected) { throw "Unsafe candidate was accepted: $mode" }
}
`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", timeout: 20_000 });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
}, 25_000);
