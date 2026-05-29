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

PUBLIC_API_BASE_URL=https://api.your-domain.com
VITE_API_BASE_URL=https://api.your-domain.com
CORS_ALLOWED_ORIGINS=https://your-domain.com,https://your-vercel-app.vercel.app
TRUSTED_HOSTS=your-domain.com,api.your-domain.com,localhost,127.0.0.1,api,web

MOCK_BRIGHTDATA=false
BRIGHTDATA_API_KEY=...
BRIGHTDATA_API_ENDPOINT=https://api.brightdata.com/request
BRIGHTDATA_SCRAPER_ENDPOINT=https://api.brightdata.com/datasets/v3/trigger
BRIGHTDATA_SERP_ZONE=serp_api1
BRIGHTDATA_WEB_UNLOCKER_ZONE=web_unlocker2
BRIGHTDATA_SCRAPING_BROWSER_ZONE=scraping_browser2
BRIGHTDATA_MCP_ENDPOINT=...

OPENAI_API_KEY=...
COGNEE_ENDPOINT=
COGNEE_API_KEY=
NEO4J_ENABLED=false
```

Keep `.env` on the server only. Do not commit it.

## 3. Start the stack

Minimal production stack:

```bash
docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.vultr.yml \
  --profile production \
  up -d --build
```

With monitoring:

```bash
docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.vultr.yml \
  --profile production \
  --profile monitoring \
  up -d --build
```

Run migrations:

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.vultr.yml exec api alembic upgrade head
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
docker compose -f infra/docker-compose.yml -f infra/docker-compose.vultr.yml ps
docker compose -f infra/docker-compose.yml -f infra/docker-compose.vultr.yml logs -f api
docker compose -f infra/docker-compose.yml -f infra/docker-compose.vultr.yml pull
docker compose -f infra/docker-compose.yml -f infra/docker-compose.vultr.yml up -d --build
```
