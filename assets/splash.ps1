# dsh-chrome-desktop startup splash.
# Shows "正在启动 DSH…" with a marquee bar and closes itself as soon as the
# backend port accepts connections (or turns into a timeout notice).
param(
    [int]$Port = 3080,
    [int]$TimeoutSeconds = 180,
    [string]$LogPath = ''
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = 'DeepSeek Harness'
$form.ClientSize = New-Object System.Drawing.Size(400, 150)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true
$form.ShowInTaskbar = $true

$title = New-Object System.Windows.Forms.Label
$title.Text = '正在启动 DSH…'
$title.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 14, [System.Drawing.FontStyle]::Regular)
$title.AutoSize = $false
$title.TextAlign = 'MiddleCenter'
$title.Location = New-Object System.Drawing.Point(20, 30)
$title.Size = New-Object System.Drawing.Size(360, 40)
$form.Controls.Add($title)

$hint = New-Object System.Windows.Forms.Label
$hint.Text = '首次启动约需 10 秒，窗口随后自动打开'
$hint.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9)
$hint.ForeColor = [System.Drawing.Color]::DimGray
$hint.TextAlign = 'MiddleCenter'
$hint.Location = New-Object System.Drawing.Point(20, 72)
$hint.Size = New-Object System.Drawing.Size(360, 24)
$form.Controls.Add($hint)

$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Style = 'Marquee'
$bar.MarqueeAnimationSpeed = 25
$bar.Location = New-Object System.Drawing.Point(40, 106)
$bar.Size = New-Object System.Drawing.Size(320, 14)
$form.Controls.Add($bar)

$script:elapsed = 0

function Test-Port {
    param([int]$P)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect('127.0.0.1', $P, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne(400)) { return $false }
        $client.EndConnect($async)
        return $client.Connected
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 600
$timer.Add_Tick({
    $script:elapsed += 600
    if (Test-Port -P $Port) { $timer.Stop(); $form.Close(); return }
    if ($script:elapsed -ge ($TimeoutSeconds * 1000)) {
        $timer.Stop()
        $title.Text = '启动超时'
        if ($LogPath) {
            $hint.Text = "请查看 $LogPath"
        } else {
            $hint.Text = '请查看启动器目录下的 launch.log'
        }
        $bar.Style = 'Blocks'
    }
})
$timer.Start()

[void]$form.ShowDialog()
$timer.Stop()
