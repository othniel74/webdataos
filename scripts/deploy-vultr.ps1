param(
  [string]$Region = "lhr",
  [string]$Plan = "vc2-2c-4gb",
  [string]$Label = "webdataos-prod",
  [string]$Branch = "main",
  [string]$RepoUrl = "https://github.com/othniel74/webdataos.git",
  [string]$FirewallGroupId = "",
  [string]$SshKeyId = ""
)

$ErrorActionPreference = "Stop"

$token = $env:VULTR_API_KEY
if (-not $token) { $token = $env:VULTR_API_TOKEN }
if (-not $token) {
  throw "Set VULTR_API_KEY or VULTR_API_TOKEN before running this script."
}

$repoEnv = Join-Path (Resolve-Path ".").Path ".env"
if (-not (Test-Path $repoEnv)) {
  throw "Missing .env. Copy .env.example to .env and fill production values first."
}

$envText = Get-Content -LiteralPath $repoEnv -Raw
$required = @("API_KEYS", "VITE_API_KEY")
foreach ($name in $required) {
  if ($envText -notmatch "(?m)^$name=.+") {
    throw ".env must include $name before deployment."
  }
}

$startup = @"
#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl git gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=`$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu `$VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

mkdir -p /opt/webdataos
if [ ! -d /opt/webdataos/.git ]; then
  git clone --branch $Branch $RepoUrl /opt/webdataos
else
  cd /opt/webdataos
  git fetch origin $Branch
  git checkout $Branch
  git pull --ff-only origin $Branch
fi

cat > /opt/webdataos/.env <<'WEB_DATA_OS_ENV'
$envText
WEB_DATA_OS_ENV
chmod 600 /opt/webdataos/.env

cd /opt/webdataos
docker compose --env-file .env -f infra/docker-compose.yml -f infra/docker-compose.vultr.yml --profile production up -d postgres
until docker compose --env-file .env -f infra/docker-compose.yml -f infra/docker-compose.vultr.yml exec -T postgres pg_isready -U postgres -d postgres; do
  sleep 2
done
DB_URL=`$( (grep -E '^DATABASE_URL=' .env || true) | tail -n1 | cut -d= -f2-)
DB_CREDENTIALS=
DB_APP_PASSWORD=
DB_TARGET=webdata
if [ -n "`$DB_URL" ]; then
  DB_CREDENTIALS=`${DB_URL#*://}
  DB_CREDENTIALS=`${DB_CREDENTIALS%%@*}
  DB_APP_PASSWORD=`${DB_CREDENTIALS#*:}
  DB_URL_NO_QUERY=`${DB_URL%%\?*}
  DB_PATH=`${DB_URL_NO_QUERY##*/}
  if [ -n "`$DB_PATH" ] && [ "`$DB_PATH" != "`$DB_URL_NO_QUERY" ]; then
    DB_TARGET=`$DB_PATH
  fi
fi
if ! docker compose --env-file .env -f infra/docker-compose.yml -f infra/docker-compose.vultr.yml exec -T postgres psql -U postgres -d postgres -Atc "select 1 from pg_database where datname='`$DB_TARGET'" | grep -q 1; then
  docker compose --env-file .env -f infra/docker-compose.yml -f infra/docker-compose.vultr.yml exec -T postgres createdb -U postgres "`$DB_TARGET"
fi
if [ -n "`$DB_APP_PASSWORD" ] && [ "`$DB_APP_PASSWORD" != "`$DB_CREDENTIALS" ]; then
  POSTGRES_APP_PASSWORD=`$DB_APP_PASSWORD
else
  POSTGRES_APP_PASSWORD=`$( (grep -E '^POSTGRES_PASSWORD=' .env || true) | tail -n1 | cut -d= -f2-)
  if [ -z "`$POSTGRES_APP_PASSWORD" ]; then
    POSTGRES_APP_PASSWORD=postgres
  fi
fi
POSTGRES_APP_PASSWORD_SQL=`$(printf "%s" "`$POSTGRES_APP_PASSWORD" | sed "s/'/''/g")
docker compose --env-file .env -f infra/docker-compose.yml -f infra/docker-compose.vultr.yml exec -T postgres psql -U postgres -d postgres -c "ALTER USER postgres WITH PASSWORD '`$POSTGRES_APP_PASSWORD_SQL';"
docker compose --env-file .env -f infra/docker-compose.yml -f infra/docker-compose.vultr.yml --profile production up -d --build
docker compose --env-file .env -f infra/docker-compose.yml -f infra/docker-compose.vultr.yml exec -T api alembic upgrade head || true
"@

$startupEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($startup))

$body = @{
  region = $Region
  plan = $Plan
  os_id = 1743
  label = $Label
  hostname = $Label
  enable_ipv6 = $true
  user_data = $startupEncoded
}

if ($FirewallGroupId) { $body.firewall_group_id = $FirewallGroupId }
if ($SshKeyId) { $body.sshkey_id = @($SshKeyId) }

$json = $body | ConvertTo-Json -Depth 8
$headers = @{
  Authorization = "Bearer $token"
  "Content-Type" = "application/json"
}

try {
  $instance = Invoke-RestMethod -Method Post -Uri "https://api.vultr.com/v2/instances" -Headers $headers -Body $json
} catch {
  $response = $_.Exception.Response
  if ($response -and $response.GetResponseStream()) {
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    $bodyText = $reader.ReadToEnd()
    throw "Vultr API create instance failed: $bodyText"
  }
  throw
}
$id = $instance.instance.id
Write-Host "Created Vultr instance: $id"
Write-Host "Waiting for IP..."

for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 5
  $fresh = Invoke-RestMethod -Method Get -Uri "https://api.vultr.com/v2/instances/$id" -Headers $headers
  $ip = $fresh.instance.main_ip
  if ($ip -and $ip -ne "0.0.0.0") {
    Write-Host "Instance IP: $ip"
    Write-Host "Health check: http://$ip/health"
    exit 0
  }
}

throw "Instance was created but no public IP was available yet. Check Vultr instance $id."
