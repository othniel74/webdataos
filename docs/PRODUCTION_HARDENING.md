# Production Hardening Notes

This repository is now structured as a production-oriented MVP. It can run locally in mock mode and can be promoted to staging/production once API credentials and deployment infrastructure are provided.

## Added hardening

- API-key authentication using `X-API-Key` or `Authorization: Bearer`.
- In-memory rate limiting for demo/staging deployments.
- Request body size guard.
- Trusted host and CORS configuration.
- Bright Data adapter boundary with retries, timeout handling, upstream error shaping, and circuit breaker support.
- Alembic migration scaffold with an initial schema.
- CI workflow for backend tests/lint and TypeScript SDK build.
- Dedicated Python and TypeScript SDKs.
- Operational docs for deployment and API key setup.

## Before real production

Replace in-memory rate limiting and circuit-breaker state with Redis if you deploy multiple API instances. Use managed Postgres with backups. Store secrets in a proper secrets manager. Keep `API_AUTH_ENABLED=true`, restrict CORS, configure HTTPS, and run Alembic migrations instead of SQLAlchemy `create_all`.

## Tenancy hardening milestone

The next hardening pass is Clerk-backed tenancy and a safe public demo boundary. See `TENANCY_DEMO_GRAPH_PLAN.md`.

Production requirements for that milestone:

- verify Clerk JWTs on the backend;
- map every signed-in user to a tenant and role;
- scope all customer-owned tables by `tenant_id`;
- scope Neo4j nodes and relationships by `tenant_id`;
- keep public demo traffic in a dedicated demo tenant/session;
- rate-limit public demo monitor runs and Analyst chat;
- prevent demo users from changing provider credentials or triggering real external workflows;
- prove tenant isolation with automated tests before deployment.
