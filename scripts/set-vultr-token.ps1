$ErrorActionPreference = "Stop"
$secure = Read-Host "Paste Vultr API token" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
)
[Environment]::SetEnvironmentVariable("VULTR_API_KEY", $plain, "User")
$env:VULTR_API_KEY = $plain
Write-Host "VULTR_API_KEY saved to your Windows user environment for future terminals."
