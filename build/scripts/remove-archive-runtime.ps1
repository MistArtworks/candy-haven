<#
.SYNOPSIS
    Stops the embedded archive daemon and removes its runtime during uninstall.

.DESCRIPTION
    Invoked by the NSIS uninstaller. Terminates any mongod process launched
    from this installation directory so its files are not locked, then deletes
    the downloaded MongoDB runtime — which was written after installation and
    is therefore not tracked by the uninstaller's file list.

    The operator's archive *data* lives under %APPDATA%\Candy Haven and is
    deliberately left in place; removing a user's project database on uninstall
    would be destructive and unrecoverable.

.PARAMETER InstallDir
    The application's installation directory (NSIS $INSTDIR).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$InstallDir
)

$ErrorActionPreference = 'SilentlyContinue'

try {
    # Only stop daemons this installation owns; a separate system-wide MongoDB
    # service must not be touched.
    Get-Process -Name 'mongod' -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -and $_.Path.StartsWith($InstallDir, [StringComparison]::OrdinalIgnoreCase) } |
        Stop-Process -Force -ErrorAction SilentlyContinue

    # Give the OS a moment to release file handles before deleting.
    Start-Sleep -Milliseconds 600

    $runtime = Join-Path $InstallDir 'resources\mongodb'
    if (Test-Path $runtime) {
        Remove-Item -Path $runtime -Recurse -Force -ErrorAction SilentlyContinue
    }

    Write-Output 'CandyHaven: archive runtime removed.'
} catch {
    Write-Output "CandyHaven: archive runtime cleanup skipped ($($_.Exception.Message))"
}

exit 0
