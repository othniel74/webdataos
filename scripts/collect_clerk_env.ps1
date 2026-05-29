Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$root = "C:\othniel74\webdataos"

function Set-EnvValue($path, $key, $value) {
  if (!(Test-Path $path)) {
    New-Item -ItemType File -Path $path -Force | Out-Null
  }
  $lines = Get-Content $path -ErrorAction SilentlyContinue
  $escaped = [regex]::Escape($key)
  $line = "$key=$value"
  $found = $false
  $updated = foreach ($existing in $lines) {
    if ($existing -match "^$escaped=") {
      $found = $true
      $line
    } else {
      $existing
    }
  }
  if (-not $found) {
    $updated = @($updated) + $line
  }
  Set-Content -Path $path -Value $updated -Encoding UTF8
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "WebDataOS Clerk configuration"
$form.Size = New-Object System.Drawing.Size(720, 430)
$form.StartPosition = "CenterScreen"
$form.TopMost = $true

$fields = @(
  @{ Key = "VITE_CLERK_PUBLISHABLE_KEY"; Text = "Publishable key"; Optional = $false },
  @{ Key = "CLERK_DOMAIN_URL"; Text = "Clerk domain / issuer URL"; Optional = $false },
  @{ Key = "CLERK_JWKS_URL"; Text = "JWKS URL (auto if blank)"; Optional = $true },
  @{ Key = "CLERK_SECRET_KEY"; Text = "Secret key (optional)"; Optional = $true },
  @{ Key = "CLERK_AUDIENCE"; Text = "Audience (optional)"; Optional = $true }
)

$boxes = @{}
$y = 22
foreach ($item in $fields) {
  $label = New-Object System.Windows.Forms.Label
  $label.Text = $item.Text
  $label.Location = New-Object System.Drawing.Point(22, $y)
  $label.Size = New-Object System.Drawing.Size(180, 22)
  $form.Controls.Add($label)

  $box = New-Object System.Windows.Forms.TextBox
  $box.Location = New-Object System.Drawing.Point(210, ($y - 2))
  $box.Size = New-Object System.Drawing.Size(470, 24)
  if ($item.Key -eq "CLERK_SECRET_KEY") {
    $box.UseSystemPasswordChar = $true
  }
  $form.Controls.Add($box)
  $boxes[$item.Key] = $box
  $y += 48
}

$note = New-Object System.Windows.Forms.Label
$note.Text = "Use your Clerk domain, for example https://your-instance.clerk.accounts.dev. The form saves CLERK_ISSUER and derives CLERK_JWKS_URL when blank."
$note.Location = New-Object System.Drawing.Point(22, $y)
$note.Size = New-Object System.Drawing.Size(660, 38)
$note.ForeColor = [System.Drawing.Color]::FromArgb(90, 90, 90)
$form.Controls.Add($note)

$save = New-Object System.Windows.Forms.Button
$save.Text = "Save Clerk env"
$save.Location = New-Object System.Drawing.Point(470, 330)
$save.Size = New-Object System.Drawing.Size(120, 32)
$form.Controls.Add($save)

$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = "Cancel"
$cancel.Location = New-Object System.Drawing.Point(600, 330)
$cancel.Size = New-Object System.Drawing.Size(80, 32)
$form.Controls.Add($cancel)

$save.Add_Click({
  $missing = @()
  foreach ($item in $fields) {
    if (-not $item.Optional -and [string]::IsNullOrWhiteSpace($boxes[$item.Key].Text)) {
      $missing += $item.Text
    }
  }
  if ($missing.Count -gt 0) {
    [System.Windows.Forms.MessageBox]::Show("Please fill: " + ($missing -join ", "), "Missing values") | Out-Null
    return
  }

  $envPath = Join-Path $root ".env"
  $localPath = Join-Path $root ".env.local"
  $webLocalPath = Join-Path $root "apps\web\.env.local"
  Set-EnvValue $envPath "AUTH_MODE" "mixed"

  foreach ($item in $fields) {
    $value = $boxes[$item.Key].Text.Trim()
    if ([string]::IsNullOrWhiteSpace($value)) {
      continue
    }
    if ($item.Key -eq "VITE_CLERK_PUBLISHABLE_KEY") {
      Set-EnvValue $localPath "VITE_CLERK_PUBLISHABLE_KEY" $value
      Set-EnvValue $webLocalPath "VITE_CLERK_PUBLISHABLE_KEY" $value
      Set-EnvValue $envPath "CLERK_PUBLISHABLE_KEY" $value
    } elseif ($item.Key -eq "CLERK_DOMAIN_URL") {
      $issuer = $value.TrimEnd("/")
      Set-EnvValue $envPath "CLERK_ISSUER" $issuer
      if ([string]::IsNullOrWhiteSpace($boxes["CLERK_JWKS_URL"].Text)) {
        Set-EnvValue $envPath "CLERK_JWKS_URL" "$issuer/.well-known/jwks.json"
      }
    } else {
      Set-EnvValue $envPath $item.Key $value
    }
  }

  [System.Windows.Forms.MessageBox]::Show("Saved Clerk configuration.", "WebDataOS") | Out-Null
  $form.Close()
})

$cancel.Add_Click({ $form.Close() })

[void]$form.ShowDialog()
