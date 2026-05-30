# Deployment Guide

## Local demo

```bash
cp .env.example .env
make docker-up
```

Open:

- API: http://localhost:8000/docs
- Frontend: http://localhost:5173
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001

## Staging/production checklist

1. Set `APP_ENV=production`.
2. Set `API_AUTH_ENABLED=true`.
3. Set strong comma-separated `API_KEYS`.
4. Configure real Bright Data endpoints and `BRIGHTDATA_API_KEY`.
5. Set managed Postgres URLs.
6. Run `alembic upgrade head`.
7. Restrict `CORS_ALLOWED_ORIGINS` and `TRUSTED_HOSTS`.
8. Use HTTPS at the edge.
9. Enable OTEL exporter and Prometheus scraping.
10. Configure backups for Postgres and Neo4j if enabled.
