# Deploy WebDataOS on Vultr

This path runs the backend, worker, web UI, Postgres, and reverse proxy on one Vultr Docker host.

## 1. Create the server

Use Ubuntu 22.04 or 24.04 on Vultr. The easiest route is Vultr's Docker Marketplace app; otherwise install Docker Engine and the Docker Compose plugin on a normal Ubuntu instance.

Open firewall ports:

- `22/tcp` for SSH from your IP only
- `80/tcp` for HTTP
- `443/tcp` when TLS is added

## 2. Copy the repo

```bash
git clone https://github.com/othniel74/webdataos.git
cd webdataos
cp .env.example .env
```

Edit `.env` for production:

```env
APP_ENV=production
API_AUTH_ENABLED=true
API_KEYS=replace-with-a-long-random-key
VITE_API_KEY=replace-with-the-same-or-public-demo-key
VITE_CLERK_PUBLISHABLE_KEY=pk_test_or_pk_live_from_clerk
CLERK_PUBLISHABLE_KEY=pk_test_or_pk_live_from_clerk
CLERK_ISSUER=https://your-clerk-instance.clerk.accounts.dev
CLERK_JWKS_URL=https://your-clerk-instance.clerk.accounts.dev/.well-known/jwks.json

# Leave PUBLIC_API_BASE_URL empty when serving the frontend and API from the same Vultr host.
# Set it only when the browser should call a separate API domain.
PUBLIC_API_BASE_URL=
VITE_API_BASE_URL=
CORS_ALLOWED_ORIGINS=https://your-domain.com,https://your-vercel-app.vercel.app
TRUSTED_HOSTS=your-domain.com,api.your-domain.com,localhost,127.0.0.1,api,web

MOCK_BRIGHTDATA=false
BRIGHTDATA_API_KEY=...
BRIGHTDATA_API_ENDPOINT=https://api.brightdata.com/request
BRIGHTDATA_SCRAPER_ENDPOINT=https://api.brightdata.com/datasets/v3/trigger
BRIGHTDATA_SERP_ZONE=serp_api1
BRIGHTDATA_WEB_UNLOCKER_ZONE=web_unlocker2
BRIGHTDATA_SCRAPING_BROWSER_ZONE=scraping_browser2
BRIGHTDATA_SCRAPING_BROWSER_ENDPOINT=wss://USER:PASS@brd.superproxy.io:9222
BRIGHTDATA_SELENIUM_ENDPOINT=https://USER:PASS@brd.superproxy.io:9515
BRIGHTDATA_MCP_ENDPOINT=...

OPENAI_API_KEY=...
AIMLAPI_API_KEY=
AIMLAPI_BASE_URL=https://api.aimlapi.com/v1
AIMLAPI_MODELS_URL=https://api.aimlapi.com/models
AIMLAPI_MODEL=gpt-4o
COGNEE_ENDPOINT=
COGNEE_API_KEY=
COGNEE_UI_PORT=3200
COGNEE_LLM_MODEL=openai/gpt-4o-mini
COGNEE_EMBEDDING_MODEL=openai/text-embedding-3-small
SPEECHMATICS_ENDPOINT=https://asr.api.speechmatics.com/v2/jobs
TRIGGERWARE_ENDPOINT=
NEO4J_ENABLED=false
```

Keep `.env` on the server only. Do not commit it.

## 3. Start the stack

Minimal production stack:

```bash
docker compose --env-file .env \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.vultr.yml \
  --profile production \
  up -d --build
```

The `--env-file .env` flag is required. The Vite frontend is a static build, so browser-visible values such as `VITE_CLERK_PUBLISHABLE_KEY` must be available during image build, not only at container runtime.

## Vultr API deployment from this workstation

Set the Vultr token locally:

```powershell
.\scripts\set-vultr-token.ps1
```

Then create a Vultr Docker host and bootstrap WebDataOS:

```powershell
.\scripts\deploy-vultr.ps1 -Region lhr -Plan vc2-2c-4gb -Label webdataos-prod
```

Optional flags:

```powershell
.\scripts\deploy-vultr.ps1 `
  -Region ewr `
  -Plan vc2-2c-4gb `
  -Label webdataos-prod `
  -FirewallGroupId YOUR_FIREWALL_GROUP_ID `
  -SshKeyId YOUR_SSH_KEY_ID
```

With monitoring:

```bash
docker compose --env-file .env \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.vultr.yml \
  --profile production \
  --profile monitoring \
  up -d --build
```

Run migrations:

```bash
docker compose --env-file .env -f infra/docker-compose.yml -f infra/docker-compose.vultr.yml exec api alembic upgrade head
```

## 4. Verify

```bash
curl http://YOUR_SERVER_IP/health
curl -H "X-API-Key: YOUR_API_KEY" http://YOUR_SERVER_IP/workspaces/packages
```

The same nginx reverse proxy serves:

- `/` -> web UI
- `/health`, `/workspaces`, `/agent`, `/gateway`, etc. -> FastAPI backend
- `/api/*` -> FastAPI backend with the `/api` prefix stripped

## 5. TLS

Point DNS at the Vultr server first. Then put a TLS reverse proxy in front of nginx, or replace the nginx service with Caddy/Traefik. Until TLS is configured, use HTTP only for testing.

## Operations

```bash
docker compose --env-file .env -f infra/docker-compose.yml -f infra/docker-compose.vultr.yml ps
docker compose --env-file .env -f infra/docker-compose.yml -f infra/docker-compose.vultr.yml logs -f api
docker compose --env-file .env -f infra/docker-compose.yml -f infra/docker-compose.vultr.yml pull
docker compose --env-file .env -f infra/docker-compose.yml -f infra/docker-compose.vultr.yml up -d --build
```
