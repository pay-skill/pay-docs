# pay CLI installer for Windows — https://pay-skill.com
# Usage: irm https://pay-skill.com/install.ps1 | iex
$ErrorActionPreference = 'Stop'

$Repo = "pay-skill/pay-cli"
$InstallDir = if ($env:PAY_INSTALL_DIR) { $env:PAY_INSTALL_DIR } else { "$env:USERPROFILE\bin" }

function Get-LatestVersion {
    $release = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest"
    return $release.tag_name
}

$Version = Get-LatestVersion
$Binary = "pay-windows-amd64.exe"
$Url = "https://github.com/$Repo/releases/download/$Version/$Binary"

Write-Host "Installing pay $Version (windows/amd64)..."

if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$OutPath = Join-Path $InstallDir "pay.exe"
Invoke-WebRequest -Uri $Url -OutFile $OutPath -UseBasicParsing

Write-Host "Installed pay to $OutPath"

$UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($UserPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("PATH", "$InstallDir;$UserPath", "User")
    Write-Host "Added $InstallDir to user PATH (restart terminal to take effect)"
}

& $OutPath --version 2>$null
