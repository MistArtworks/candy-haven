<#
.SYNOPSIS
    Downloads and installs the MongoDB runtime used by Candy Haven's embedded archive.

.DESCRIPTION
    Invoked by the NSIS installer during installation. Downloads the pinned
    MongoDB Community archive, verifies its SHA-256, and extracts only the
    binaries the application needs (bin/, minus debug symbols and mongos) into
    <InstallDir>\resources\mongodb.

    This script is intentionally best-effort. If it fails for any reason —
    no network, a proxy, a cancelled install — it exits 0 so the installer
    still completes. Candy Haven detects the missing runtime on first launch
    and provisions it itself through the boot sequence, so a failure here
    degrades to a slower first start rather than a broken installation.

.PARAMETER InstallDir
    The application's installation directory (NSIS $INSTDIR).

.PARAMETER Url
    Override the archive URL. Defaults to the pinned release.

.PARAMETER Sha256
    Expected lowercase hex digest of the archive. Pass an empty string to skip
    verification (not recommended).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$InstallDir,

    [string]$Url = 'https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.29.zip',

    [string]$Sha256 = '4b1fc74acbd7fbdc3bb9a70dc7f133cf401488196a9d6e6a3ee8471c58eea44b'
)

$ErrorActionPreference = 'Stop'

$targetRoot = Join-Path $InstallDir 'resources\mongodb'
$targetBin = Join-Path $targetRoot 'bin'
$mongod = Join-Path $targetBin 'mongod.exe'

function Write-Stage([string]$message) {
    # Surfaced in the NSIS details pane.
    Write-Output "CandyHaven: $message"
}

try {
    if (Test-Path $mongod) {
        Write-Stage 'Archive runtime already present; skipping download.'
        exit 0
    }

    $work = Join-Path $env:TEMP ("candy-haven-archive-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $work | Out-Null
    $archive = Join-Path $work 'mongodb.zip'

    Write-Stage "Downloading archive runtime from $Url"

    # TLS 1.2 is not the default on older Windows PowerShell hosts.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    # BITS is dramatically faster than Invoke-WebRequest for large files and
    # reports progress, but is unavailable in some environments — fall back.
    $downloaded = $false
    try {
        Import-Module BitsTransfer -ErrorAction Stop
        Start-BitsTransfer -Source $Url -Destination $archive -ErrorAction Stop
        $downloaded = $true
    } catch {
        Write-Stage 'BITS unavailable; falling back to direct download.'
    }

    if (-not $downloaded) {
        $previous = $ProgressPreference
        # Progress rendering makes Invoke-WebRequest an order of magnitude slower.
        $ProgressPreference = 'SilentlyContinue'
        try {
            Invoke-WebRequest -Uri $Url -OutFile $archive -UseBasicParsing
        } finally {
            $ProgressPreference = $previous
        }
    }

    if (-not (Test-Path $archive)) {
        throw 'Download did not produce an archive file.'
    }

    if ($Sha256 -and $Sha256.Trim().Length -gt 0) {
        Write-Stage 'Verifying archive integrity'
        $actual = (Get-FileHash -Path $archive -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne $Sha256.Trim().ToLowerInvariant()) {
            throw "Archive digest mismatch. Expected $Sha256 but found $actual."
        }
    }

    Write-Stage 'Extracting archive runtime'

    $extract = Join-Path $work 'extract'
    New-Item -ItemType Directory -Force -Path $extract | Out-Null
    Expand-Archive -Path $archive -DestinationPath $extract -Force

    # The archive nests everything under one versioned directory whose exact
    # name tracks the release, so locate mongod.exe rather than assuming it.
    $sourceMongod = Get-ChildItem -Path $extract -Filter 'mongod.exe' -Recurse -File |
        Select-Object -First 1

    if ($null -eq $sourceMongod) {
        throw 'mongod.exe was not found inside the downloaded archive.'
    }

    New-Item -ItemType Directory -Force -Path $targetBin | Out-Null

    # Copy the binaries, discarding debug symbols and the sharding router.
    Get-ChildItem -Path $sourceMongod.Directory.FullName -File |
        Where-Object { $_.Extension -ne '.pdb' -and $_.Name -notlike 'mongos*' } |
        ForEach-Object { Copy-Item -Path $_.FullName -Destination $targetBin -Force }

    # Retain licence and attribution files alongside the binaries.
    Get-ChildItem -Path $sourceMongod.Directory.Parent.FullName -File |
        Where-Object { $_.Name -match '(?i)^(LICENSE|THIRD-PARTY|README|MPL)' } |
        ForEach-Object { Copy-Item -Path $_.FullName -Destination $targetRoot -Force }

    if (-not (Test-Path $mongod)) {
        throw 'Extraction completed but mongod.exe is missing from the target directory.'
    }

    Write-Stage "Archive runtime installed to $targetRoot"
    exit 0
} catch {
    # Non-fatal by design: the application provisions the runtime on first launch.
    Write-Stage "Archive runtime setup deferred to first launch ($($_.Exception.Message))"
    exit 0
} finally {
    if ($work -and (Test-Path $work)) {
        Remove-Item -Path $work -Recurse -Force -ErrorAction SilentlyContinue
    }
}
