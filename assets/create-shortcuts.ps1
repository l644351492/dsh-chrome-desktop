# dsh-chrome-desktop shortcut creator.
# Rewrites the desktop and start-menu shortcuts for the launcher. Idempotent:
# running it repeatedly just refreshes the same two links.
param(
    [Parameter(Mandatory = $true)][string]$HomeDir,
    [string]$Name = 'DeepSeek Harness'
)
# $HOME is read-only in PowerShell, so the path parameter is named HomeDir.
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $HomeDir)) { throw "launcher home not found: $HomeDir" }

$vbs = Join-Path $HomeDir 'launch.vbs'
$icon = Join-Path $HomeDir 'icon.ico'
if (-not (Test-Path -LiteralPath $vbs)) { throw "launch.vbs not found in $HomeDir" }

$shell = New-Object -ComObject WScript.Shell
$created = @()

foreach ($folder in @(
    [Environment]::GetFolderPath('Desktop'),
    [Environment]::GetFolderPath('Programs')
)) {
    if (-not $folder) { continue }
    $path = Join-Path $folder "$Name.lnk"
    $link = $shell.CreateShortcut($path)
    $link.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
    $link.Arguments = '"' + $vbs + '"'
    $link.WorkingDirectory = $HomeDir
    if (Test-Path -LiteralPath $icon) { $link.IconLocation = "$icon,0" }
    $link.Description = "$Name (dsh-chrome-desktop)"
    $link.WindowStyle = 1
    $link.Save()
    $created += $path
}

$created | ForEach-Object { Write-Output $_ }
