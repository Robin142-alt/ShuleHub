param(
  [Parameter(Mandatory = $true)]
  [string]$OwnerEmail
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

Write-Host "ShuleHub production auth verification" -ForegroundColor Cyan
Write-Host "Owner email captured from secure operator input."
Write-Host ""

$secureDatabaseUrl = Read-Host "Paste DATABASE_URL" -AsSecureString

$env:DATABASE_URL = Convert-SecureStringToPlainText -SecureValue $secureDatabaseUrl
$env:SYSTEM_OWNER_EMAIL = $OwnerEmail

try {
  Push-Location $repoRoot
  npm.cmd run auth:production-verify
} finally {
  Pop-Location
  Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:\SYSTEM_OWNER_EMAIL -ErrorAction SilentlyContinue
}
