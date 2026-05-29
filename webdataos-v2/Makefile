.PHONY: install test lint run-api run-worker docker-up docker-down migrate sdk-python-build sdk-ts-build clean

install:
	pip install -e .[dev]

test:
	pytest -q

lint:
	ruff check .

run-api:
	uvicorn apps.api.main:app --reload --host 0.0.0.0 --port 8000

run-worker:
	python -m apps.worker.main

migrate:
	alembic upgrade head

docker-up:
	docker compose -f infra/docker-compose.yml up --build

docker-down:
	docker compose -f infra/docker-compose.yml down -v

sdk-python-build:
	cd sdks/python && python -m build

sdk-ts-build:
	cd sdks/typescript && npm install && npm run build

clean:
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	find . -type f -name '*.pyc' -delete
