import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it.skipIf(process.platform !== "win32")("uses a signed Windows feed predecessor and rejects changed evidence before any installer runs", () => {
  const source = readFileSync(new URL("./verify-windows-upgrade.ps1", import.meta.url), "utf8");
  const selection = source.slice(source.indexOf('$previousEvidence = $null'), source.indexOf('$releaseRoot = Join-Path'));
  const installerHelper = source.match(/^function Get-InstallerAsset\([^]*?^}/m)?.[0];
  const script = `
$ErrorActionPreference = 'Stop'
$Repository = 'owner/repo'
$CurrentTag = 'v0.3.40'
$PlatformMode = 'windows'
$PreviousTag = ''
$env:RUNNER_TEMP = [IO.Path]::GetTempPath()
$script:mode = 'valid'
$script:endpoints = @()
function node { $global:LASTEXITCODE = if ($script:mode -eq 'command-failure') { 1 } else { 0 } }
function Get-Content {
  param($LiteralPath, [switch]$Raw)
  $proof = @{releaseId=42;tag='windows-v0.3.39';assetId=100;sha256=('a'*64);signatureVerified=$true;releaseCommit=('b'*40)}
  if ($script:mode -eq 'unsigned') { $proof.signatureVerified=$false }
  if ($script:mode -eq 'invalid-hash') { $proof.sha256='oops' }
  $proof | ConvertTo-Json
}
function Invoke-GitHubJson([string]$Endpoint) {
  $script:endpoints += $Endpoint
  $release = @{id=42;tag_name='windows-v0.3.39';draft=$false;target_commitish=('b'*40);assets=@(@{id=100;name='Quota.Float_0.3.39_x64-setup.exe';digest=('sha256:' + ('a'*64))})}
  if ($Endpoint -like '*/latest') { $release.tag_name='v0.3.37' }
  if ($script:mode -eq 'changed-commit') { $release.target_commitish=('c'*40) }
  if ($script:mode -eq 'changed-release') { $release.id=43 }
  if ($script:mode -eq 'changed-asset') { $release.assets[0].id=101 }
  if ($script:mode -eq 'draft') { $release.draft=$true }
  $release
}
${installerHelper}
$candidate = @{assets=@(@{id=200;name='Quota.Float_0.3.40_x64-setup.exe'})}
function Resolve-Previous {
${selection}
  return $previous.tag_name
}
if ((Resolve-Previous) -ne 'windows-v0.3.39') { throw 'Channel predecessor was not selected.' }
if ($script:endpoints -contains 'repos/owner/repo/releases/latest') { throw 'Windows channel used the global latest endpoint.' }
foreach ($case in @('unsigned','invalid-hash','changed-commit','changed-release','changed-asset','draft','command-failure')) {
  $script:mode=$case
  $rejected=$false
  try { Resolve-Previous | Out-Null } catch { $rejected=$true }
  if (-not $rejected) { throw "Unsafe predecessor accepted: $case" }
}
$script:mode='valid'; $PreviousTag='v0.3.37'
$rejected=$false
try { Resolve-Previous | Out-Null } catch { $rejected=$true }
if (-not $rejected) { throw 'The explicit legacy baseline silently used a different channel version.' }
$PreviousTag=''
$script:mode='valid'; $PlatformMode='all'
if ((Resolve-Previous) -ne 'v0.3.37') { throw 'Legacy all-mode behavior changed.' }
`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", timeout: 20_000 });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
}, 25_000);

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
  const resolution = source.slice(source.indexOf("if ($CandidateReleaseId -gt 0)"), source.indexOf('$previousEvidence = $null'));
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
