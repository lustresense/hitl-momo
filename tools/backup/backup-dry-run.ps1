param([Parameter(Mandatory=$true)][string]$Remote)
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "../..")
$exclude = Join-Path $root ".backupignore"
& rclone copy $root $Remote --exclude-from $exclude --dry-run --progress
if ($LASTEXITCODE -ne 0) { throw "rclone dry-run failed: $LASTEXITCODE" }
