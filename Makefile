.PHONY: dev dev-api dev-ui dev-tunnel clean init diag:data

dev: dev-api

dev-api:
	@echo "==> Finding available port..."
	@mkdir -p scripts
	@PORT=$$(python3 scripts/find_port.py) && \
	echo "==> Starting backend on port $$PORT" && \
	export $$(grep -v '^#' env/.env.development | xargs) && \
	python3 -m uvicorn backend.app:app --host 0.0.0.0 --port $$PORT --reload

dev-tunnel:
	@which npx >/dev/null || (echo "Install Node/npm for ngrok step (optional)"; exit 1)
	@export PORT=$${PORT:-8080}; \
	echo "==> Launching ngrok tunnel to http://localhost:$$PORT"; \
	npx ngrok http $$PORT

clean:
	@find . -name '__pycache__' -o -name '*.pyc' -o -name '.pytest_cache' | xargs rm -rf || true

# Create environment files if they don't exist
init:
	@mkdir -p env
	@if [ ! -f env/.env.development ]; then \
		echo "Creating env/.env.development..."; \
		echo "DATA_MODE=development\nDATA_STALENESS_MAX_MIN=30\nREQUIRE_MIN_FUND_YEARS=3\nPORT=8080\nDATABASE_URL=sqlite:///local.db" > env/.env.development; \
	fi
	@if [ ! -f env/.env.example ]; then \
		echo "Creating env/.env.example..."; \
		echo "DATA_MODE=development\nDATA_STALENESS_MAX_MIN=30\nREQUIRE_MIN_FUND_YEARS=3\nPORT=8080\nDATABASE_URL=sqlite:///local.db\n\n# Required API keys (do not commit)\n#POLYGON_API_KEY=REDACTED
	fi

diag:data:
	@echo "Running data provider diagnostics for TICKER=$(TICKER)..."
	@python scripts/diagnose_data.py $(TICKER)