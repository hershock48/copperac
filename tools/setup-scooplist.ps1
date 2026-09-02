# One-time setup of the Copper Athletic Club business on Scooplist.
#
# Run this in PowerShell from anywhere:
#
#   powershell -ExecutionPolicy Bypass -File C:\Users\hersh\Glazedweb\copperac\tools\setup-scooplist.ps1
#
# It asks for two things and does the rest:
#   1. The Scooplist master secret. That is SCOOPLIST_MASTER on the
#      `scooplist` Vercel project (Settings > Environment Variables > reveal).
#      It is typed hidden and never written anywhere.
#   2. A PIN for the bar (4 to 12 characters). This is what the bar types on
#      its sign-in page. Write it down for them.
#
# Then it creates the business (safe to re-run: a second run updates it in
# place, which is also how a PIN gets rotated) and seeds it with the printed
# cocktail list plus the Toast drink harvest. Taps are left empty on purpose:
# the bar enters what is pouring, so the site's LIVE label never points at a
# guess.
#
# When it finishes, the bar's sign-in link is
#   https://scooplist.glazedweb.com/login/copper
# and https://copperac.vercel.app/api/status should report cocktails: live.

$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$copperac = Split-Path -Parent $here
$scooplist = Join-Path (Split-Path -Parent $copperac) "scooplist"
$env:Path = "C:\Program Files\nodejs;" + $env:Path

if (-not (Test-Path (Join-Path $scooplist "tools\create-org.mjs"))) {
  throw "Expected the scooplist repo at $scooplist (tools\create-org.mjs not found)."
}

$secure = Read-Host "Paste SCOOPLIST_MASTER from the scooplist Vercel project" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$master = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
if (-not $master) { throw "No master secret given." }

$pin = Read-Host "Choose the bar's PIN (4 to 12 characters)"
if ($pin.Length -lt 4 -or $pin.Length -gt 12) { throw "PIN must be 4 to 12 characters." }

Write-Host ""
Write-Host "1/2  Creating the business on scooplist.glazedweb.com ..."
$env:SCOOPLIST_MASTER = $master
Push-Location $scooplist
try {
  node tools/create-org.mjs --url https://scooplist.glazedweb.com `
    --slug copper --name "Copper Athletic Club" --pin $pin `
    --preset tavern --categories "taps:On Tap,cocktails:Cocktails" `
    --locations "marshall:Copper Athletic Club"
  if ($LASTEXITCODE -ne 0) { throw "create-org failed (exit $LASTEXITCODE)." }
} finally {
  Pop-Location
  $env:SCOOPLIST_MASTER = $null
  $master = $null
}

Write-Host ""
Write-Host "2/2  Seeding the cocktail list and the Toast drink library ..."
$env:SCOOPLIST_ADMIN_PIN = $pin
Push-Location $copperac
try {
  node --experimental-strip-types tools/populate-scooplist.mjs https://scooplist.glazedweb.com
  if ($LASTEXITCODE -ne 0) { throw "populate failed (exit $LASTEXITCODE)." }
} finally {
  Pop-Location
  $env:SCOOPLIST_ADMIN_PIN = $null
}

Write-Host ""
Write-Host "Done."
Write-Host "  Bar sign-in:  https://scooplist.glazedweb.com/login/copper   (PIN: the one you chose)"
Write-Host "  TV board:     https://scooplist.glazedweb.com/board/copper/marshall"
Write-Host "  Site check:   https://copperac.vercel.app/api/status  (expect cocktails: live)"
