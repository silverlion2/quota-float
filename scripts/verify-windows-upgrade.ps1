param(
  [Parameter(Mandatory = $true)][string]$Repository,
  [Parameter(Mandatory = $true)][string]$CurrentTag,
  [long]$CandidateReleaseId
)

$ErrorActionPreference = "Stop"

if (-not $IsWindows -and $PSVersionTable.PSEdition -eq "Core") {
  throw "The upgrade smoke test must run on Windows."
}
if ([string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
  throw "RUNNER_TEMP is required so installers are isolated to the ephemeral CI runner."
}
if ([string]::IsNullOrWhiteSpace($env:GH_TOKEN)) {
  throw "GH_TOKEN is required to read the draft release candidate without exposing credentials."
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI (gh) is required to resolve release metadata."
}

function Invoke-GitHubJson([string]$Endpoint) {
  $raw = gh api $Endpoint
  if ($LASTEXITCODE -ne 0) { throw "GitHub API request failed for $Endpoint." }
  return $raw | ConvertFrom-Json
}

function Get-InstallerAsset($Release, [string]$Label) {
  $installers = @($Release.assets | Where-Object { $_.name -match '_x64-setup\.exe$' })
  if ($installers.Count -ne 1) {
    throw "$Label must contain exactly one x64 NSIS installer; found $($installers.Count)."
  }
  return $installers[0]
}

function Save-ReleaseAsset($Asset, [string]$Destination) {
  $headers = @{
    Authorization = "Bearer $env:GH_TOKEN"
    Accept = "application/octet-stream"
    "X-GitHub-Api-Version" = "2022-11-28"
    "User-Agent" = "quota-float-upgrade-smoke"
  }
  Invoke-WebRequest -UseBasicParsing -Uri $Asset.url -Headers $headers -OutFile $Destination
}

function Write-CiOutput([string]$Name, [string]$Value) {
  if (-not [string]::IsNullOrWhiteSpace($env:GITHUB_OUTPUT)) {
    "$Name=$Value" | Out-File -FilePath $env:GITHUB_OUTPUT -Encoding utf8 -Append
  }
}

$allReleases = @(Invoke-GitHubJson "repos/$Repository/releases?per_page=100")
if ($CandidateReleaseId -gt 0) {
  $candidate = Invoke-GitHubJson "repos/$Repository/releases/$CandidateReleaseId"
} else {
  $candidate = $allReleases | Where-Object { $_.tag_name -eq $CurrentTag } | Select-Object -First 1
}
if (-not $candidate) { throw "Release candidate $CurrentTag was not found, including drafts." }
if ($candidate.tag_name -ne $CurrentTag) {
  throw "Candidate release $($candidate.id) is tagged $($candidate.tag_name), expected $CurrentTag."
}
if (-not $candidate.draft) {
  throw "Refusing to smoke test $CurrentTag after publication; the candidate must still be a draft."
}

$previous = Invoke-GitHubJson "repos/$Repository/releases/latest"
if ($previous.tag_name -eq $CurrentTag) {
  throw "Current tag $CurrentTag is already the latest public release; the draft gate ran too late."
}
if (-not $previous) { throw "No previous public stable release is available for the upgrade smoke test." }

$candidateAsset = Get-InstallerAsset $candidate "Draft candidate $CurrentTag"
$previousAsset = Get-InstallerAsset $previous "Previous stable release $($previous.tag_name)"
$releaseRoot = Join-Path $env:RUNNER_TEMP "quota-float-upgrade-smoke-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $releaseRoot | Out-Null

$previousDir = Join-Path $releaseRoot "previous"
$currentDir = Join-Path $releaseRoot "current"
New-Item -ItemType Directory -Force -Path $previousDir, $currentDir | Out-Null
$previousInstallerPath = Join-Path $previousDir $previousAsset.name
$currentInstallerPath = Join-Path $currentDir $candidateAsset.name
Save-ReleaseAsset $previousAsset $previousInstallerPath
Save-ReleaseAsset $candidateAsset $currentInstallerPath

$previousInstaller = Get-Item -LiteralPath $previousInstallerPath
$currentInstaller = Get-Item -LiteralPath $currentInstallerPath
$candidateSha256 = (Get-FileHash -LiteralPath $currentInstaller.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
if (-not [string]::IsNullOrWhiteSpace($candidateAsset.digest)) {
  $expectedDigest = "sha256:$candidateSha256"
  if ($candidateAsset.digest.ToLowerInvariant() -ne $expectedDigest) {
    throw "Downloaded candidate digest does not match GitHub asset $($candidateAsset.id)."
  }
}

$previousProcess = Start-Process -FilePath $previousInstaller.FullName -ArgumentList "/S" -Wait -PassThru -WindowStyle Hidden
if ($previousProcess.ExitCode -ne 0) { throw "Previous installer failed with exit code $($previousProcess.ExitCode)." }
$installedExe = Join-Path $env:LOCALAPPDATA "Quota Float\quota-float.exe"
if (-not (Test-Path -LiteralPath $installedExe)) { throw "Previous Quota Float executable was not found after installation." }
$previousExpectedVersion = $previous.tag_name.TrimStart("v")
$previousInstalledVersion = (Get-Item -LiteralPath $installedExe).VersionInfo.ProductVersion
if ($previousInstalledVersion -notlike "$previousExpectedVersion*") {
  throw "Expected previous version $previousExpectedVersion but installed $previousInstalledVersion."
}

$currentProcess = Start-Process -FilePath $currentInstaller.FullName -ArgumentList "/S" -Wait -PassThru -WindowStyle Hidden
if ($currentProcess.ExitCode -ne 0) { throw "Current installer failed with exit code $($currentProcess.ExitCode)." }

if (-not (Test-Path -LiteralPath $installedExe)) { throw "Installed Quota Float executable was not found." }
$expectedVersion = $CurrentTag.TrimStart("v")
$installedVersion = (Get-Item -LiteralPath $installedExe).VersionInfo.ProductVersion
if ($installedVersion -notlike "$expectedVersion*") { throw "Expected $expectedVersion but installed $installedVersion." }

$candidateAfterSmoke = Invoke-GitHubJson "repos/$Repository/releases/$($candidate.id)"
$candidateAssetAfterSmoke = Get-InstallerAsset $candidateAfterSmoke "Draft candidate $CurrentTag"
if (-not $candidateAfterSmoke.draft -or $candidateAssetAfterSmoke.id -ne $candidateAsset.id) {
  throw "The draft candidate or its Windows installer changed during the upgrade smoke test."
}

Write-CiOutput "candidate_release_id" ([string]$candidate.id)
Write-CiOutput "candidate_asset_id" ([string]$candidateAsset.id)
Write-CiOutput "candidate_asset_name" ([string]$candidateAsset.name)
Write-CiOutput "candidate_sha256" $candidateSha256
Write-Output "Upgrade smoke test passed on draft asset $($candidateAsset.id): $($previous.tag_name) -> $CurrentTag ($installedVersion, sha256:$candidateSha256)."
