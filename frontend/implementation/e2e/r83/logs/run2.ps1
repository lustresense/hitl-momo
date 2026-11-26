$env:CHROMIUM_PATH="C:\Users\deano\AppData\Local\ms-playwright\chromium-1248\chrome-win64\chrome.exe"
$env:NO_VIDEO="1"
$o="e2e/r83/out"
$env:JOURNEY_OUT="$o/normal-journey"; $env:SHOTS_OUT="$o/normal-journey-shots"; $env:RECOVERY_OUT="$o/recovery"; $env:ROUTE_OUT="$o/route-canvas"; $env:GUIDE_OUT="$o/guide-flow"
foreach($n in 'normal-journey','recovery-paths','route-canvas','guide-flow'){
 $t=Get-Date; node "e2e/$n.mjs" *> "e2e/r83/logs/e2e-$n.log"; $c=$LASTEXITCODE; $d=[int]((Get-Date)-$t).TotalSeconds
 "$n`t$c`t${d}s" | Add-Content e2e/r83/logs/e2e-summary.tsv }
"DONE" | Add-Content e2e/r83/logs/e2e-summary.tsv
