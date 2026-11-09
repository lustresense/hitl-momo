param([Parameter(Mandatory=$true)][string]$Remote)
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "../..")
$exclude = Join-Path $root ".backupignore"
Write-Host "COPY-ONLY backup. This script does NOT use rclone sync or delete remote-only files."
& rclone copy $root $Remote --exclude-from $exclude --progress
if ($LASTEXITCODE -ne 0) { throw "rclone copy failed: $LASTEXITCODE" }
Write-Host "Backup copy completed."
