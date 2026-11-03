# dsh-chrome-desktop management actions used by the settings row.
# Every action is idempotent and only touches paths this plugin created.
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('shortcuts', 'autostart-on', 'autostart-off', 'remove-shortcuts')]
    [string]$Action,
    [Parameter(Mandatory = $true)][string]$HomeDir,
    [string]$Name = 'DeepSeek Harness'
)

$ErrorActionPreference = 'Stop'

function Get-LinkPath {
    param([string]$Folder)
    if (-not $Folder) { return $null }
    return Join-Path $Folder "$Name.lnk"
}

$desktop = [Environment]::GetFolderPath('Desktop')
$programs = [Environment]::GetFolderPath('Programs')
$startup = [Environment]::GetFolderPath('Startup')

switch ($Action) {
    'shortcuts' {
        $script = Join-Path $HomeDir 'create-shortcuts.ps1'
        if (-not (Test-Path -LiteralPath $script)) { throw "create-shortcuts.ps1 not found in $HomeDir" }
        & $script -HomeDir $HomeDir -Name $Name
    }

    'autostart-on' {
        $vbs = Join-Path $HomeDir 'launch.vbs'
        $icon = Join-Path $HomeDir 'icon.ico'
        if (-not (Test-Path -LiteralPath $vbs)) { throw "launch.vbs not found in $HomeDir" }
        $path = Get-LinkPath $startup
        $shell = New-Object -ComObject WScript.Shell
        $link = $shell.CreateShortcut($path)
        $link.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
        $link.Arguments = '"' + $vbs + '"'
        $link.WorkingDirectory = $HomeDir
        if (Test-Path -LiteralPath $icon) { $link.IconLocation = "$icon,0" }
        $link.Description = "$Name (dsh-chrome-desktop)"
        $link.Save()
        Write-Output $path
    }

    'autostart-off' {
        $path = Get-LinkPath $startup
        if ($path -and (Test-Path -LiteralPath $path)) {
            Remove-Item -LiteralPath $path -Force
            Write-Output "removed $path"
        } else {
            Write-Output 'no startup shortcut'
        }
    }

    'remove-shortcuts' {
        $vbs = Join-Path $HomeDir 'launch.vbs'
        $removed = @()
        foreach ($folder in @($desktop, $programs, $startup)) {
            $path = Get-LinkPath $folder
            if (-not $path -or -not (Test-Path -LiteralPath $path)) { continue }
            # Only delete links that still point at this launcher.
            try {
                $shell = New-Object -ComObject WScript.Shell
                $existing = $shell.CreateShortcut($path)
                if ($existing.Arguments -and $existing.Arguments.Contains($vbs)) {
                    Remove-Item -LiteralPath $path -Force
                    $removed += $path
                }
            } catch { }
        }
        Remove-Item (Join-Path $HomeDir 'create-shortcuts.ps1') -Force -ErrorAction SilentlyContinue
        $removed | ForEach-Object { Write-Output $_ }
        if ($removed.Count -eq 0) { Write-Output 'no shortcuts removed' }
    }
}
