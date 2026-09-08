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
