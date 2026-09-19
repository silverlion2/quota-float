import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

const source = readFileSync(new URL("./verify-windows-defender.ps1", import.meta.url), "utf8");

it("runs custom release scans with exclusions ignored and validates their output", () => {
  expect(source).toMatch(/& \$mpCmdRun -Scan -ScanType 3 -File \$resolvedPath -DisableRemediation/);
  expect(source).toContain("Assert-DefenderScanCompleted $scanOutput $scanExitCode $resolvedPath");
});

it.skipIf(process.platform !== "win32")("rejects skipped, missing, incomplete and failed Defender scans", () => {
  const helper = source.match(/^function Assert-DefenderScanCompleted\([^]*?^}/m)?.[0];
  expect(helper).toBeTruthy();
  const script = `
$ErrorActionPreference = 'Stop'
${helper}
Assert-DefenderScanCompleted "Scan starting...\nScan finished." 0 'clean.exe'
$cases = @(
  @{ Output = 'Scanning excluded.exe was skipped.'; Code = 0 },
  @{ Output = "Scanning excluded.exe was skipped.\nScan finished."; Code = 0 },
  @{ Output = ''; Code = 0 },
  @{ Output = 'Scan starting...'; Code = 0 },
  @{ Output = 'Scan finished.'; Code = 2 }
)
foreach ($case in $cases) {
  $rejected = $false
  try { Assert-DefenderScanCompleted $case.Output $case.Code 'candidate.exe' }
  catch { $rejected = $true }
  if (-not $rejected) { throw "Invalid scan accepted: $($case.Output)" }
}
`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", timeout: 20_000 });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
}, 25_000);
