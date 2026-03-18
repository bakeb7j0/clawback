.PHONY: lint format test test-integration run build up clean

lint:
	ruff check .

format:
	ruff format .

test:
	python -m pytest tests/unit/ -v

test-integration:
	python -m pytest tests/integration/ -v

run:
	FLASK_DEBUG=true python -m flask --app app run --host 0.0.0.0 --port 8080

build:
	docker build -t clawback .

up:
	docker compose up

clean:
	docker compose down
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
