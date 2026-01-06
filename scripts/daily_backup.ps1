$ErrorActionPreference = "Stop"

$proj = "C:\Users\NABIL BAHHAR\Work\crm-pipe"
$backupDir = "$env:USERPROFILE\Desktop\crm-pipe-backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$tmp = Join-Path $backupDir "src-$stamp"
$zip = Join-Path $backupDir "crm-pipe-$stamp.zip"

# Copie "slim" (sans node_modules/.next/.git)
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
robocopy $proj $tmp /E /XD node_modules .next .git | Out-Null

# Zip
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path "$tmp\*" -DestinationPath $zip -Force
Remove-Item $tmp -Recurse -Force

# Backup .env.local à part
Copy-Item "$proj\.env.local" (Join-Path $backupDir "env.local.$stamp.backup") -Force

# Rotation: garder seulement les 7 plus récents ZIP
$zips = Get-ChildItem $backupDir -Filter "crm-pipe-*.zip" | Sort-Object LastWriteTime -Descending
if ($zips.Count -gt 7) {
  $zips | Select-Object -Skip 7 | Remove-Item -Force
}

Write-Host "OK Daily backup created: $zip"
