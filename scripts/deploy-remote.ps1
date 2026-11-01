#Requires -Version 7.0
param(
    [switch]$SkipBuild,
    [switch]$SkipLocalAccounts,
    [string]$Remote = $env:FLORRCLONE_REMOTE,
    [string]$SshKey = $env:FLORRCLONE_SSH_KEY,
    [string]$PublicUrl = $env:FLORRCLONE_PUBLIC_URL
)
$ErrorActionPreference = 'Stop'
if (-not $Remote) { throw 'Set FLORRCLONE_REMOTE (e.g. user@your.host) or pass -Remote' }
if (-not $SshKey) { $SshKey = Join-Path $env:USERPROFILE '.ssh/id_ed25519' }
if (-not (Test-Path -LiteralPath $SshKey)) { throw "SSH key not found: $SshKey" }
if (-not $PublicUrl) {
    $hostPart = ($Remote -split '@', 2)[-1]
    $PublicUrl = "http://${hostPart}:8088/"
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$sshOptions = @('-i', $SshKey, '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15')
$release = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$stage = Join-Path $projectRoot "test-results/deploy/$release"
$remoteStage = "/root/florrclone-upload/$release"
function Invoke-Remote([string]$Command) {
    & ssh @sshOptions $Remote $Command
    if ($LASTEXITCODE -ne 0) { throw "Remote command failed (exit $LASTEXITCODE)" }
}
Push-Location $projectRoot
try {
    if (-not $SkipBuild) {
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
    }
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    $archive = Join-Path $stage 'florrclone.tar.gz'
    & tar -czf $archive -C (Join-Path $projectRoot 'dist') start.js package.json server web node_modules/ws -C $projectRoot deploy
    if ($LASTEXITCODE -ne 0) { throw 'Packaging failed' }
    $sha = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    $files = @($archive, (Join-Path $projectRoot 'deploy/bootstrap-runtime.sh'), (Join-Path $projectRoot 'deploy/install.sh'))
    $seed = ''
    $localDb = Join-Path $projectRoot 'dist/data/inventory.json'
    if (-not $SkipLocalAccounts -and (Test-Path -LiteralPath $localDb)) {
        $sourceDb = Get-Content -Raw -LiteralPath $localDb | ConvertFrom-Json
        if ($null -ne $sourceDb.accounts -and @($sourceDb.accounts.PSObject.Properties).Count -gt 0) {
            # Copy account saves on a FIRST deployment only. Do not export browser
            # session tokens or legacy guests, and never overwrite a live database.
            $seed = Join-Path $stage 'inventory.seed.json'
            $seedJson = @{version=1;sessions=@{};accounts=$sourceDb.accounts} | ConvertTo-Json -Depth 100 -Compress
            [IO.File]::WriteAllText($seed, $seedJson, [Text.UTF8Encoding]::new($false))
            $files += $seed
        }
    }
    Invoke-Remote "install -d -m 0700 $remoteStage"
    & scp -q @sshOptions @files "${Remote}:${remoteStage}/"
    if ($LASTEXITCODE -ne 0) { throw 'Upload failed' }
    Invoke-Remote "printf '%s  %s\n' '$sha' '$remoteStage/florrclone.tar.gz' | sha256sum --check --strict -"
    Invoke-Remote "bash -n $remoteStage/bootstrap-runtime.sh && bash -n $remoteStage/install.sh && bash $remoteStage/bootstrap-runtime.sh"
    $seedArg = if ($seed) { "$remoteStage/inventory.seed.json" } else { '' }
    Invoke-Remote "bash $remoteStage/install.sh $release $remoteStage/florrclone.tar.gz $seedArg"
    # Uploaded seed contains password hashes and stays outside the web root.
    # Remove the staging copy after successful installation.
    if ($seed) { Invoke-Remote "rm -f -- $remoteStage/inventory.seed.json"; Remove-Item -LiteralPath $seed }
    $health = Invoke-RestMethod -Uri ($PublicUrl.TrimEnd('/') + '/api/health') -TimeoutSec 20
    if (-not $health.ok -or $health.protocol -ne 3) { throw 'Public health check failed' }
    $recordHost = ([Uri]$PublicUrl).Host
    $record = @{release=$release;host=$recordHost;publicPort=8088;backend='127.0.0.1:8788';archiveSha256=$sha;url=$PublicUrl;health=$health}
    $record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $stage 'deployment.json') -Encoding utf8
    Write-Output "PUBLIC_OK $PublicUrl release=$release"
} finally {
    Pop-Location
}
