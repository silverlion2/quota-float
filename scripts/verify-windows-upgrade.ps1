param(
  [Parameter(Mandatory = $true)][string]$Repository,
  [Parameter(Mandatory = $true)][string]$CurrentTag
)

$ErrorActionPreference = "Stop"
$releaseRoot = Join-Path $env:RUNNER_TEMP "quota-float-upgrade-smoke"
New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null

$releases = gh release list --repo $Repository --exclude-drafts --exclude-pre-releases --limit 10 --json tagName,isLatest | ConvertFrom-Json
$previous = $releases | Where-Object { $_.tagName -ne $CurrentTag } | Select-Object -First 1
if (-not $previous) { throw "No previous stable release is available for the upgrade smoke test." }

$previousDir = Join-Path $releaseRoot "previous"
$currentDir = Join-Path $releaseRoot "current"
New-Item -ItemType Directory -Force -Path $previousDir, $currentDir | Out-Null
gh release download $previous.tagName --repo $Repository --pattern "*x64-setup.exe" --dir $previousDir
gh release download $CurrentTag --repo $Repository --pattern "*x64-setup.exe" --dir $currentDir

$previousInstaller = Get-ChildItem -LiteralPath $previousDir -Filter "*x64-setup.exe" | Select-Object -First 1
$currentInstaller = Get-ChildItem -LiteralPath $currentDir -Filter "*x64-setup.exe" | Select-Object -First 1
if (-not $previousInstaller -or -not $currentInstaller) { throw "NSIS installer assets were not found." }

$previousProcess = Start-Process -FilePath $previousInstaller.FullName -ArgumentList "/S" -Wait -PassThru -WindowStyle Hidden
if ($previousProcess.ExitCode -ne 0) { throw "Previous installer failed with exit code $($previousProcess.ExitCode)." }
$currentProcess = Start-Process -FilePath $currentInstaller.FullName -ArgumentList "/S" -Wait -PassThru -WindowStyle Hidden
if ($currentProcess.ExitCode -ne 0) { throw "Current installer failed with exit code $($currentProcess.ExitCode)." }

$installedExe = Join-Path $env:LOCALAPPDATA "Quota Float\quota-float.exe"
if (-not (Test-Path -LiteralPath $installedExe)) { throw "Installed Quota Float executable was not found." }
$expectedVersion = $CurrentTag.TrimStart("v")
$installedVersion = (Get-Item -LiteralPath $installedExe).VersionInfo.ProductVersion
if ($installedVersion -notlike "$expectedVersion*") { throw "Expected $expectedVersion but installed $installedVersion." }
Write-Output "Upgrade smoke test passed: $($previous.tagName) -> $CurrentTag ($installedVersion)."
