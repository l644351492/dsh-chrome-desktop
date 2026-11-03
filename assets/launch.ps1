# dsh-chrome-desktop launcher.
#
# Opens the DeepSeek Harness Web UI as a Chrome/Edge app window. When the
# backend is not running it is started silently first, while a small splash
# reports progress; the splash closes and the app window opens as soon as the
# port answers.
#
# launcher.config.json (written by the plugin) supplies the port, the node
# binary and the dsh entry point of the host that provisioned this launcher.
# Everything falls back to detection so the script still works standalone.
#
# Usage:
#   powershell -File launch.ps1               open the app window
#   powershell -File launch.ps1 -Probe        print detected state and exit
#   powershell -File launch.ps1 -Isolated     use a private browser profile
#   powershell -File launch.ps1 -NoOpen       start the backend only
param(
    [int]$Port = 0,
    [int]$WaitSeconds = 0,
    [string]$NodePath = '',
    [switch]$Probe,
    [switch]$Isolated,
    [switch]$NoOpen,
    [switch]$Restart
)

$ErrorActionPreference = 'Stop'

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $appDir 'launcher.config.json'
$prefsPath = Join-Path $appDir 'preferences.json'
$outLog = Join-Path $appDir 'backend.log'
$errLog = Join-Path $appDir 'backend.err.log'
$runLog = Join-Path $appDir 'launch.log'

$config = $null
if (Test-Path -LiteralPath $configPath) {
    try { $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json } catch { }
}

$preferences = $null
if (Test-Path -LiteralPath $prefsPath) {
    try { $preferences = Get-Content -LiteralPath $prefsPath -Raw | ConvertFrom-Json } catch { }
}

if ($Port -le 0) {
    if ($config -and $config.port) { $Port = [int]$config.port } else { $Port = 3080 }
}
if ($WaitSeconds -le 0) {
    if ($config -and $config.readinessTimeoutSeconds) { $WaitSeconds = [int]$config.readinessTimeoutSeconds } else { $WaitSeconds = 180 }
}
if (-not $NodePath -and $config -and $config.nodePath) { $NodePath = [string]$config.nodePath }

# Double-click behaviour: attach to a running backend (default) or always cycle
# it. preferences.json is the user-facing switch; launcher.config.json carries the
# deployment default, and -Restart overrides both for one run.
$restartOnLaunch = $false
if ($preferences -and ($preferences.PSObject.Properties.Name -contains 'restartOnLaunch')) {
    $restartOnLaunch = $preferences.restartOnLaunch -eq $true
} elseif ($config -and ($config.PSObject.Properties.Name -contains 'restartOnLaunch')) {
    $restartOnLaunch = $config.restartOnLaunch -eq $true
}
if ($Restart) { $restartOnLaunch = $true }

$Origin = "http://127.0.0.1:$Port"

function Write-RunLog {
    param([string]$Message)
    try {
        $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
        Add-Content -LiteralPath $runLog -Value $line -Encoding UTF8
    } catch { }
}

function Show-Failure {
    param([string]$Message)
    Write-RunLog "FAILED: $Message"
    if ($env:DSH_CHROME_DESKTOP_HEADLESS -eq '1') { return }
    try {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show(
            "$Message`n`nLog: $runLog",
            'DeepSeek Harness',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    } catch { }
}

function Find-Browser {
    $candidates = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($c in $candidates) { if (Test-Path -LiteralPath $c) { return $c } }
    return $null
}

function Get-NodeMajor {
    param([string]$Exe)
    try {
        $raw = & $Exe --version 2>$null
        if ("$raw" -match 'v(\d+)\.') { return [int]$Matches[1] }
    } catch { }
    return 0
}

# DSH imports node:util parseEnv, which needs Node 22+. Never trust bare `node`
# on PATH: a non-interactive host can resolve an old global install instead.
function Find-Node {
    param([string]$Preferred)

    if ($Preferred -and (Test-Path -LiteralPath $Preferred)) {
        $major = Get-NodeMajor -Exe $Preferred
        if ($major -ge 22) { return $Preferred }
        Write-RunLog "configured node $Preferred is v$major; looking for a newer one"
    }

    $candidates = New-Object System.Collections.Generic.List[string]
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { $candidates.Add($cmd.Source) }
    foreach ($c in @(
        'C:\Program Files\nodejs\node.exe',
        (Join-Path $env:LOCALAPPDATA 'nvs\node.exe'),
        (Join-Path $env:APPDATA 'nvm\node.exe')
    )) { $candidates.Add($c) }
    foreach ($root in @('C:\Dev\Env', (Join-Path $env:LOCALAPPDATA 'Volta'))) {
        if (Test-Path -LiteralPath $root) {
            Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
                ForEach-Object { $candidates.Add((Join-Path $_.FullName 'node.exe')) }
        }
    }

    $best = $null
    $bestMajor = 0
    foreach ($c in ($candidates | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $c)) { continue }
        $major = Get-NodeMajor -Exe $c
        if ($major -ge 22 -and $major -gt $bestMajor) { $best = $c; $bestMajor = $major }
    }
    return $best
}

function Find-DshBin {
    if ($config -and $config.dshBin -and (Test-Path -LiteralPath $config.dshBin)) { return $config.dshBin }

    $npxRoot = Join-Path $env:LOCALAPPDATA 'npm-cache\_npx'
    if (Test-Path -LiteralPath $npxRoot) {
        $dirs = Get-ChildItem -LiteralPath $npxRoot -Directory -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending
        foreach ($d in $dirs) {
            $p = Join-Path $d.FullName 'node_modules\@deepseek-ai\dsh\lib\bin.js'
            if (Test-Path -LiteralPath $p) { return $p }
        }
    }
    foreach ($p in @(
        (Join-Path $env:APPDATA 'npm\node_modules\@deepseek-ai\dsh\lib\bin.js'),
        (Join-Path $env:LOCALAPPDATA 'npm\node_modules\@deepseek-ai\dsh\lib\bin.js')
    )) { if (Test-Path -LiteralPath $p) { return $p } }
    return $null
}

function Get-RunningBackendPorts {
    param([int]$DefaultPort = 3080)
    $ports = New-Object System.Collections.Generic.List[int]
    foreach ($proc in (Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue)) {
        if (-not $proc.CommandLine) { continue }
        if ($proc.CommandLine -notmatch 'bin\.js"?\s+web\b') { continue }
        $m = [regex]::Match($proc.CommandLine, '--port\s+(\d+)')
        if ($m.Success) {
            $found = [int]$m.Groups[1].Value
            if (-not $ports.Contains($found)) { $ports.Add($found) }
        } elseif (-not $ports.Contains($DefaultPort)) {
            # No explicit --port: the backend listens on its profile default.
            $ports.Add($DefaultPort)
        }
    }
    return ,$ports
}

function Test-Backend {
    param([int]$OnPort = 0)
    $probe = if ($OnPort -gt 0) { "http://127.0.0.1:$OnPort/" } else { "$Origin/" }
    try {
        $null = Invoke-WebRequest -Uri $probe -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        return $true
    } catch {
        if ($_.Exception.Response) { return $true }
        return $false
    }
}

function Get-TokenUrl {
    if (-not (Test-Path -LiteralPath $outLog)) { return $null }
    $hit = Select-String -LiteralPath $outLog -Pattern 'dsh web:\s+(https?://\S+)' -ErrorAction SilentlyContinue |
        Select-Object -Last 1
    if ($hit) { return $hit.Matches[0].Groups[1].Value }
    return $null
}

function Start-DshBackend {
    $node = Find-Node -Preferred $NodePath
    $bin = Find-DshBin
    if (-not $node) { throw 'No Node.js 22 or newer was found (DSH imports node:util parseEnv). Install Node 22+ and retry.' }
    if (-not $bin) { throw 'The @deepseek-ai/dsh package was not found. Run DSH once through npx, or set dshBin in launcher.config.json.' }

    # Put the chosen Node first for the whole process tree, so `node`, the npx
    # `dsh` shim and anything the backend spawns run on v22+.
    $nodeDir = Split-Path -Parent $node
    $currentPath = [Environment]::GetEnvironmentVariable('Path', 'Process')
    $rest = @($currentPath -split ';' | Where-Object { $_ -and ($_ -ne $nodeDir) })
    $env:Path = (@($nodeDir) + $rest) -join ';'
    $env:NODE_HOME = $nodeDir

    Write-RunLog "starting backend: $node $bin web --no-open --port $Port"
    foreach ($f in @($outLog, $errLog)) {
        if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue }
    }

    $workdir = $appDir
    if ($config -and $config.workingDir -and (Test-Path -LiteralPath $config.workingDir)) { $workdir = $config.workingDir }

    $proc = Start-Process -FilePath $node `
        -ArgumentList "`"$bin`" web --no-open --port $Port" `
        -WorkingDirectory $workdir `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -WindowStyle Hidden `
        -PassThru
    Write-RunLog "backend pid $($proc.Id) (cwd $workdir)"
    return $proc
}

function Show-Splash {
    $splash = Join-Path $appDir 'splash.ps1'
    if (-not (Test-Path -LiteralPath $splash)) { return }
    Write-RunLog 'showing startup splash'
    $shell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    Start-Process -FilePath $shell `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
            '-File', "`"$splash`"", '-Port', $Port, '-TimeoutSeconds', $WaitSeconds) `
        -WindowStyle Hidden | Out-Null
}

function Open-AppWindow {
    param([string]$Url)
    $browser = Find-Browser
    if (-not $browser) { throw 'Neither Chrome nor Edge was found. Install one, or open the URL manually.' }
    $arguments = @("--app=$Url", '--no-first-run', '--no-default-browser-check', '--window-size=1440,920')
    if ($Isolated) { $arguments += "--user-data-dir=$appDir\browser-profile" }
    Write-RunLog "opening $browser --app=$Url"
    Start-Process -FilePath $browser -ArgumentList $arguments | Out-Null
}

try {
    Write-RunLog "---- launch requested (port $Port) ----"

    if ($Probe) {
        $n = Find-Node -Preferred $NodePath
        Write-Output "browser=$(Find-Browser)"
        Write-Output "backendAlive=$(Test-Backend)"
        Write-Output "dshBin=$(Find-DshBin)"
        Write-Output "node=$n"
        if ($n) { Write-Output "nodeVersion=$(& $n --version)" }
        Write-Output "config=$configPath"
        exit 0
    }

    # Repeated double-clicks must not race two backends into the same profile.
    $mutex = New-Object System.Threading.Mutex($false, "Local\dsh-chrome-desktop-$Port")
    if (-not $mutex.WaitOne(0)) {
        Write-RunLog 'another launch is already in progress; exiting quietly'
        exit 0
    }

    try {
        # Attach mode (restartOnLaunch off): open whatever port a DSH backend is
        # actually listening on, not the configured one. Otherwise a backend that
        # was started elsewhere (another shell, an older port) would be ignored and
        # we would spawn a second instance that fights over the session.
        if (-not $restartOnLaunch) {
            $runningPorts = Get-RunningBackendPorts -DefaultPort $Port
            if ($runningPorts.Count -gt 0 -and -not $runningPorts.Contains($Port)) {
                $attachPort = $runningPorts[0]
                Write-RunLog "attaching to the running backend on port $attachPort (configured $Port)"
                $Port = $attachPort
                $Origin = "http://127.0.0.1:$Port"
            }
        }

        $alive = Test-Backend
        Write-RunLog "backend alive before launch: $alive (restartOnLaunch=$restartOnLaunch)"

        if ($restartOnLaunch) {
            Write-RunLog 'restart-on-launch: stopping every running DSH backend'
            # Kill by process, not by port. A leftover backend on another port keeps
            # owning the session and the new window would open onto "session in use".
            foreach ($proc in (Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue)) {
                if (-not $proc.CommandLine) { continue }
                if ($proc.CommandLine -notmatch 'bin\.js"?\s+web\b') { continue }
                try {
                    Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
                    Write-RunLog "restart-on-launch: stopped pid $($proc.ProcessId)"
                } catch {
                    Write-RunLog "restart-on-launch: could not stop pid $($proc.ProcessId) — $($_.Exception.Message)"
                }
            }
            # Belt and braces: whatever still holds the configured port goes too.
            $pids = @((Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).OwningProcess |
                Where-Object { $_ -and $_ -gt 0 } | Select-Object -Unique)
            foreach ($id in $pids) {
                try {
                    Stop-Process -Id $id -Force -ErrorAction Stop
                    Write-RunLog "restart-on-launch: stopped port holder $id"
                } catch {
                    Write-RunLog "restart-on-launch: could not stop pid ${id} — $($_.Exception.Message)"
                }
            }
            $freeDeadline = (Get-Date).AddSeconds(20)
            while ((Get-Date) -lt $freeDeadline) {
                if (((Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) | Measure-Object).Count -eq 0) {
                    $alive = $false
                    break
                }
                Start-Sleep -Milliseconds 250
            }
            if ($alive) { Write-RunLog 'restart-on-launch: port still busy after 20s; continuing anyway' }
        }
        elseif ($alive) {
            # Attaching is fine, but a stray backend on another port is the exact
            # situation that produces cross-instance session conflicts later.
            $stray = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
                Where-Object { $_.CommandLine -and $_.CommandLine -match 'bin\.js"?\s+web\b' } |
                ForEach-Object { $_.ProcessId })
            if ($stray.Count -gt 1) {
                Write-RunLog "warning: $($stray.Count) DSH backends are running ($($stray -join ', ')); reopen with -Restart to collapse them into one"
            }
        }

        $target = $Origin
        if (-not $alive) {
            Show-Splash
            $backend = Start-DshBackend
            $deadline = (Get-Date).AddSeconds($WaitSeconds)
            $ready = $false
            while ((Get-Date) -lt $deadline) {
                Start-Sleep -Milliseconds 700
                $token = Get-TokenUrl
                if ($token) { $target = $token }
                if (Test-Backend) { $ready = $true; break }
                if ($backend -and $backend.HasExited) {
                    $tail = ''
                    if (Test-Path -LiteralPath $errLog) {
                        $tail = (Get-Content -LiteralPath $errLog -Tail 8 -ErrorAction SilentlyContinue) -join ' | '
                    }
                    throw "The DSH backend exited immediately (code $($backend.ExitCode)). $tail"
                }
            }
            if (-not $ready) {
                $tail = ''
                if (Test-Path -LiteralPath $errLog) {
                    $tail = (Get-Content -LiteralPath $errLog -Tail 5 -ErrorAction SilentlyContinue) -join ' | '
                }
                throw "The DSH backend did not answer on port $Port within $WaitSeconds seconds. $tail"
            }

            # The launch token is printed when the loader finishes, which can be a
            # moment after the port starts answering. Prefer it over the plain
            # origin: the token URL mints a fresh browser cookie, so a window that
            # opens right after a restart never lands on a stale or half-ready page.
            if ($target -eq $Origin) {
                $tokenDeadline = (Get-Date).AddSeconds(10)
                while ((Get-Date) -lt $tokenDeadline) {
                    $token = Get-TokenUrl
                    if ($token) { $target = $token; break }
                    Start-Sleep -Milliseconds 300
                }
            }
            Write-RunLog "backend ready; opening $target"
        }

        if (-not $NoOpen) { Open-AppWindow -Url $target }
        Write-RunLog 'done'
    }
    finally {
        $mutex.ReleaseMutex()
        $mutex.Dispose()
    }
}
catch {
    Show-Failure $_.Exception.Message
    exit 1
}
