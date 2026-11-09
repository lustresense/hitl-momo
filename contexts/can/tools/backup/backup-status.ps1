param([string]$Remote)
Write-Host "Local project size:"
$root = Resolve-Path (Join-Path $PSScriptRoot "../..")
Get-ChildItem $root -Force -Recurse -ErrorAction SilentlyContinue |
  Where-Object { -not $_.PSIsContainer } |
  Measure-Object Length -Sum |
  ForEach-Object { "{0:N2} GB" -f ($_.Sum / 1GB) }
if ($Remote) {
  Write-Host "`nRemote listing:"
  & rclone lsf $Remote --max-depth 1
}
