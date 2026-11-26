$ErrorActionPreference='Continue'
function Step($name,$cmd){ $t=Get-Date; & powershell -NoProfile -Command $cmd *> "e2e/r83/logs/$name.log"; $c=$LASTEXITCODE; $d=[int]((Get-Date)-$t).TotalSeconds; "$name`t$c`t${d}s`t$cmd" | Add-Content e2e/r83/logs/summary.tsv }
Remove-Item e2e/r83/logs/summary.tsv -ErrorAction SilentlyContinue
Step 'npm_ci' 'npm ci'
Step 'typecheck' 'npm run typecheck'
Step 'lint' 'npm run lint'
Step 'test' 'npm test'
Step 'build' '$env:NEXT_PUBLIC_TEST_HOOKS="0"; npm run build'
"DONE" | Add-Content e2e/r83/logs/summary.tsv
