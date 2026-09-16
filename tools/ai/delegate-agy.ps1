param(
  [Parameter(Mandatory=$true)][string]$TaskFile,
  [string]$Model
)
$ErrorActionPreference = "Stop"
if (-not (Test-Path $TaskFile)) { throw "Task file not found: $TaskFile" }
$prompt = "ROLE: WORKER`nExecute the bounded task in: $TaskFile`nRead repository AGENTS.md first. Return verification and blockers."
if ($Model) {
  & agy -p $prompt --model $Model
} else {
  & agy -p $prompt
}
if ($LASTEXITCODE -ne 0) { throw "agy worker failed with exit code $LASTEXITCODE" }
