Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot ".env"

function Get-EnvValue {
    param([string]$Name)
    if (!(Test-Path $envPath)) { return "" }
    $line = Get-Content $envPath | Where-Object { $_ -match "^\s*$Name\s*=" } | Select-Object -Last 1
    if (!$line) { return "" }
    return ($line -replace "^\s*$Name\s*=", "").Trim()
}

function Set-EnvValue {
    param([string]$Name, [string]$Value)
    if (!(Test-Path $envPath)) { New-Item -ItemType File -Path $envPath -Force | Out-Null }
    $lines = [System.Collections.Generic.List[string]]::new()
    foreach ($line in Get-Content $envPath) {
        if ($line -notmatch "^\s*$Name\s*=") {
            $lines.Add($line)
        }
    }
    $lines.Add("$Name=$Value")
    Set-Content -Path $envPath -Value $lines -Encoding UTF8
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "WebDataOS local LLM keys"
$form.Size = New-Object System.Drawing.Size(560, 330)
$form.StartPosition = "CenterScreen"
$form.TopMost = $true
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false

$font = New-Object System.Drawing.Font("Segoe UI", 10)
$form.Font = $font

$title = New-Object System.Windows.Forms.Label
$title.Text = "Paste local test keys"
$title.Font = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
$title.Location = New-Object System.Drawing.Point(18, 14)
$title.Size = New-Object System.Drawing.Size(500, 28)
$form.Controls.Add($title)

$note = New-Object System.Windows.Forms.Label
$note.Text = "Keys are written to .env only. They are not printed to the terminal."
$note.Location = New-Object System.Drawing.Point(20, 45)
$note.Size = New-Object System.Drawing.Size(500, 22)
$form.Controls.Add($note)

function Add-Field {
    param(
        [string]$Label,
        [string]$Name,
        [int]$Y,
        [bool]$Secret = $true,
        [string]$Default = ""
    )
    $labelControl = New-Object System.Windows.Forms.Label
    $labelControl.Text = $Label
    $labelControl.Location = New-Object System.Drawing.Point(20, $Y)
    $labelControl.Size = New-Object System.Drawing.Size(165, 24)
    $form.Controls.Add($labelControl)

    $box = New-Object System.Windows.Forms.TextBox
    $box.Name = $Name
    $box.Location = New-Object System.Drawing.Point(190, ($Y - 2))
    $box.Size = New-Object System.Drawing.Size(320, 24)
    $box.Text = $Default
    if ($Secret) { $box.UseSystemPasswordChar = $true }
    $form.Controls.Add($box)
    return $box
}

$openaiBox = Add-Field "OpenAI API key" "openai" 86 $true ""
$aimlapiBox = Add-Field "AIMLAPI API key" "aimlapi" 126 $true ""
$openaiModelBox = Add-Field "OpenAI model" "openai_model" 166 $false $(Get-EnvValue "OPENAI_MODEL")
$aimlapiModelBox = Add-Field "AIMLAPI model" "aimlapi_model" 206 $false $(Get-EnvValue "AIMLAPI_MODEL")
if (!$openaiModelBox.Text) { $openaiModelBox.Text = "gpt-4o-mini" }
if (!$aimlapiModelBox.Text) { $aimlapiModelBox.Text = "gpt-4o" }

$save = New-Object System.Windows.Forms.Button
$save.Text = "Save"
$save.Location = New-Object System.Drawing.Point(330, 248)
$save.Size = New-Object System.Drawing.Size(85, 30)
$save.Add_Click({
    if ($openaiBox.Text.Trim()) { Set-EnvValue "OPENAI_API_KEY" $openaiBox.Text.Trim() }
    if ($aimlapiBox.Text.Trim()) { Set-EnvValue "AIMLAPI_API_KEY" $aimlapiBox.Text.Trim() }
    if ($openaiModelBox.Text.Trim()) { Set-EnvValue "OPENAI_MODEL" $openaiModelBox.Text.Trim() }
    if ($aimlapiModelBox.Text.Trim()) { Set-EnvValue "AIMLAPI_MODEL" $aimlapiModelBox.Text.Trim() }
    [System.Windows.Forms.MessageBox]::Show("Saved to .env. You can close this dialog.", "WebDataOS", "OK", "Information") | Out-Null
    $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Close()
})
$form.Controls.Add($save)

$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = "Cancel"
$cancel.Location = New-Object System.Drawing.Point(425, 248)
$cancel.Size = New-Object System.Drawing.Size(85, 30)
$cancel.Add_Click({
    $form.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $form.Close()
})
$form.Controls.Add($cancel)

$form.AcceptButton = $save
$form.CancelButton = $cancel
[void]$form.ShowDialog()
