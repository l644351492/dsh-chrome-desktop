# dsh-chrome-desktop backend restart.
#
# The launcher starts the backend detached (no console), so nothing closes it
# when a window goes away. This script is the deliberate way to cycle it: it
# stops whatever listens on the port, waits for the socket to be released, then
# relaunches through the normal shortcut path (splash + app window).
param(
    [int]$Port = 0,
    [switch]$NoOpen,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $appDir 'launcher.config.json'
$log = Join-Path $appDir 'launch.log'

if ($Port -le 0) {
    $Port = 3080
    if (Test-Path -LiteralPath $configPath) {
        try {
            $cfg = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
            if ($cfg.port) { $Port = [int]$cfg.port }
        } catch { }
    }
}

function Write-Log {
    param([string]$Message)
    try {
        Add-Content -LiteralPath $log -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message) -Encoding UTF8
    } catch { }
}

Write-Log "---- restart requested (port $Port) ----"

$stopped = 0
$pids = @((Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).OwningProcess | Where-Object { $_ -and $_ -gt 0 } | Select-Object -Unique)
foreach ($id in $pids) {
    try {
        Stop-Process -Id $id -Force -ErrorAction Stop
        $stopped++
        Write-Log "stopped pid $id"
    } catch {
        Write-Log "could not stop pid ${id}: $($_.Exception.Message)"
    }
}
if ($stopped -eq 0) { Write-Log 'nothing was listening; starting a fresh backend' }

# Wait for the socket to be released before starting the replacement.
$deadline = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $deadline) {
    $still = (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count
    if ($still -eq 0) { break }
    Start-Sleep -Milliseconds 250
}

$vbs = Join-Path $appDir 'launch.vbs'
if (-not (Test-Path -LiteralPath $vbs)) { throw "launch.vbs not found in $appDir" }

$runner = Join-Path $appDir 'launch.ps1'
$args = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$runner`"", '-Port', $Port)
if ($NoOpen) { $args += '-NoOpen' }
Start-Process -FilePath (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList $args -WindowStyle Hidden | Out-Null

if (-not $Quiet) { Write-Output "restarted on port $Port" }
