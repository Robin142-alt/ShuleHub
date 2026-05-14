param(
  [Parameter(Mandatory = $true)]
  [string]$OwnerEmail,
  [string]$OwnerDisplayName = "System Owner"
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function Convert-SecureStringToPlainText {
  param([Parameter(Mandatory = $true)][securestring]$SecureValue)

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

Write-Host "ShuleHub production auth cleanup" -ForegroundColor Cyan
Write-Host "This will purge operational tenant data and leave one platform owner." -ForegroundColor Yellow
Write-Host "Owner email captured from secure operator input."
Write-Host ""

$confirmation = (Read-Host "Type REMOVE_ALL_DEMO_DATA to continue").Trim()
if ($confirmation -ne "REMOVE_ALL_DEMO_DATA") {
  throw "Confirmation did not match. Cleanup aborted."
}

$secureDatabaseUrl = Read-Host "Paste DATABASE_URL" -AsSecureString
$secureOwnerPassword = Read-Host "Enter one-time owner password" -AsSecureString

$env:CONFIRM_PRODUCTION_DATA_PURGE = "REMOVE_ALL_DEMO_DATA"
$env:DATABASE_URL = Convert-SecureStringToPlainText -SecureValue $secureDatabaseUrl
$env:SYSTEM_OWNER_EMAIL = $OwnerEmail
$env:SYSTEM_OWNER_DISPLAY_NAME = $OwnerDisplayName
$env:SYSTEM_OWNER_PASSWORD = Convert-SecureStringToPlainText -SecureValue $secureOwnerPassword

try {
  Push-Location $repoRoot
  npm.cmd run auth:production-cleanup
} finally {
  Pop-Location
  Remove-Item Env:\CONFIRM_PRODUCTION_DATA_PURGE -ErrorAction SilentlyContinue
  Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:\SYSTEM_OWNER_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:\SYSTEM_OWNER_DISPLAY_NAME -ErrorAction SilentlyContinue
  Remove-Item Env:\SYSTEM_OWNER_PASSWORD -ErrorAction SilentlyContinue
}
