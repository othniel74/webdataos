.PHONY: help install test lint run-api run-worker dev up down build migrate migrate-local logs clean clean-docker deploy deploy-minimal sdk-python-build sdk-ts-build shell-api shell-db

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Local development ──

install: ## Install Python package with development dependencies
	pip install -e .[dev]

test: ## Run Python tests
	pytest -q

lint: ## Run Ruff lint checks
	ruff check .

run-api: ## Run API locally with reload
	uvicorn apps.api.main:app --reload --host 0.0.0.0 --port 8000

run-worker: ## Run worker locally
	python -m apps.worker.main

dev: ## Start in development mode (mock Bright Data)
	docker compose -f infra/docker-compose.yml up --build

up: ## Start services (detached)
	docker compose -f infra/docker-compose.yml up -d --build

down: ## Stop all services
	docker compose -f infra/docker-compose.yml down

logs: ## Tail logs
	docker compose -f infra/docker-compose.yml logs -f

# ── Database ──

migrate: ## Run Alembic migrations
	docker compose -f infra/docker-compose.yml exec api alembic upgrade head

migrate-local: ## Run migrations locally
	alembic upgrade head

# ── Production (Vultr) ──

deploy: ## Deploy with nginx reverse proxy + monitoring
	docker compose -f infra/docker-compose.yml --profile production --profile monitoring up -d --build

deploy-minimal: ## Deploy without monitoring stack
	docker compose -f infra/docker-compose.yml --profile production up -d --build

# ── Utilities ──

build: ## Build all images
	docker compose -f infra/docker-compose.yml build

clean: ## Remove Python caches and build artifacts
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	find . -type f -name '*.pyc' -delete
	rm -rf .pytest_cache .ruff_cache build dist *.egg-info

clean-docker: ## Remove Docker volumes and local images
	docker compose -f infra/docker-compose.yml down -v --rmi local

sdk-python-build: ## Build Python SDK package
	cd sdks/python && python -m build

sdk-ts-build: ## Install and build TypeScript SDK
	cd sdks/typescript && npm install && npm run build

shell-api: ## Shell into API container
	docker compose -f infra/docker-compose.yml exec api bash

shell-db: ## psql into database
	docker compose -f infra/docker-compose.yml exec postgres psql -U postgres -d webdata
