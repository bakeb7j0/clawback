.PHONY: lint format test test-js test-integration run build up clean

lint:
	ruff check .

format:
	ruff format .

test: test-js
	python -m pytest tests/unit/ -v

test-js:
	node tests/unit/js/test_parser.js
	node tests/unit/js/test_playback.js
	node tests/unit/js/test_renderer.js
	node tests/unit/js/test_scroller.js
	node tests/unit/js/test_annotations.js
	node tests/unit/js/test_app.js

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
