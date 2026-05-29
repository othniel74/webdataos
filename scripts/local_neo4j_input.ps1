Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$envPath = Join-Path $repoRoot ".env"

function Get-EnvValue {
    param([string]$Name)
    if (!(Test-Path $envPath)) { return "" }
    $line = Get-Content $envPath | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -Last 1
    if (!$line) { return "" }
    return ($line -split "=", 2)[1]
}

function Set-EnvValues {
    param([hashtable]$Values)
    $lines = @()
    if (Test-Path $envPath) {
        $lines = @(Get-Content $envPath)
    }
    foreach ($key in $Values.Keys) {
        $replacement = "$key=$($Values[$key])"
        $found = $false
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match "^$([regex]::Escape($key))=") {
                $lines[$i] = $replacement
                $found = $true
            }
        }
        if (-not $found) {
            $lines += $replacement
        }
    }
    Set-Content -Path $envPath -Value $lines -Encoding UTF8
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "WebDataOS Neo4j Configuration"
$form.Size = New-Object System.Drawing.Size(560, 370)
$form.StartPosition = "CenterScreen"
$form.TopMost = $true

$font = New-Object System.Drawing.Font("Segoe UI", 9)
$form.Font = $font

$title = New-Object System.Windows.Forms.Label
$title.Text = "Paste your Neo4j Aura database connection details"
$title.Location = New-Object System.Drawing.Point(18, 16)
$title.Size = New-Object System.Drawing.Size(500, 24)
$title.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($title)

$hint = New-Object System.Windows.Forms.Label
$hint.Text = "Use the database connection URI and database password, not the Aura management API key."
$hint.Location = New-Object System.Drawing.Point(18, 44)
$hint.Size = New-Object System.Drawing.Size(505, 34)
$hint.ForeColor = [System.Drawing.Color]::DimGray
$form.Controls.Add($hint)

function Add-Label {
    param([string]$Text, [int]$Y)
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $Text
    $label.Location = New-Object System.Drawing.Point(20, $Y)
    $label.Size = New-Object System.Drawing.Size(130, 22)
    $form.Controls.Add($label)
}

function Add-TextBox {
    param([int]$Y, [string]$Value = "", [bool]$Password = $false)
    $box = New-Object System.Windows.Forms.TextBox
    $box.Location = New-Object System.Drawing.Point(155, $Y)
    $box.Size = New-Object System.Drawing.Size(360, 24)
    $box.Text = $Value
    if ($Password) { $box.UseSystemPasswordChar = $true }
    $form.Controls.Add($box)
    return $box
}

Add-Label "NEO4J_URI" 92
$uriBox = Add-TextBox 90 (Get-EnvValue "NEO4J_URI")

Add-Label "NEO4J_USERNAME" 128
$userBox = Add-TextBox 126 ((Get-EnvValue "NEO4J_USERNAME") -or (Get-EnvValue "NEO4J_USER"))

Add-Label "NEO4J_PASSWORD" 164
$passwordBox = Add-TextBox 162 "" $true

Add-Label "NEO4J_DATABASE" 200
$databaseBox = Add-TextBox 198 (Get-EnvValue "NEO4J_DATABASE")

$enabledCheck = New-Object System.Windows.Forms.CheckBox
$enabledCheck.Text = "Enable Neo4j graph projection"
$enabledCheck.Checked = $true
$enabledCheck.Location = New-Object System.Drawing.Point(155, 235)
$enabledCheck.Size = New-Object System.Drawing.Size(250, 24)
$form.Controls.Add($enabledCheck)

$status = New-Object System.Windows.Forms.Label
$status.Location = New-Object System.Drawing.Point(20, 270)
$status.Size = New-Object System.Drawing.Size(495, 22)
$status.ForeColor = [System.Drawing.Color]::DimGray
$form.Controls.Add($status)

$save = New-Object System.Windows.Forms.Button
$save.Text = "Save to .env"
$save.Location = New-Object System.Drawing.Point(315, 295)
$save.Size = New-Object System.Drawing.Size(96, 30)
$form.Controls.Add($save)

$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = "Cancel"
$cancel.Location = New-Object System.Drawing.Point(420, 295)
$cancel.Size = New-Object System.Drawing.Size(96, 30)
$form.Controls.Add($cancel)

$save.Add_Click({
    if ([string]::IsNullOrWhiteSpace($uriBox.Text) -or [string]::IsNullOrWhiteSpace($userBox.Text) -or [string]::IsNullOrWhiteSpace($passwordBox.Text)) {
        $status.ForeColor = [System.Drawing.Color]::Firebrick
        $status.Text = "URI, username, and password are required."
        return
    }
    Set-EnvValues @{
        "NEO4J_ENABLED" = $(if ($enabledCheck.Checked) { "true" } else { "false" })
        "NEO4J_URI" = $uriBox.Text.Trim()
        "NEO4J_USER" = $userBox.Text.Trim()
        "NEO4J_USERNAME" = $userBox.Text.Trim()
        "NEO4J_PASSWORD" = $passwordBox.Text
        "NEO4J_DATABASE" = $databaseBox.Text.Trim()
    }
    $status.ForeColor = [System.Drawing.Color]::ForestGreen
    $status.Text = "Saved. You can close this window."
})

$cancel.Add_Click({ $form.Close() })

[void]$form.ShowDialog()
