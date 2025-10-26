# Local Testing Guide for FinModAI

This guide explains how to run the FinModAI application locally for testing without deploying to Fly.io.

## Quick Start

Run the app with a single command:

```bash
./run_local.sh
```

This will:
1. Activate your virtual environment (if it exists)
2. Set required environment variables
3. Start the FastAPI server on port 8000
4. Enable auto-reload for development

## Access the App

Once running, you can access:

- **API Documentation**: http://localhost:8080/docs
- **Health Check**: http://localhost:8080/healthz
- **Main Page**: http://localhost:8080/

## Manual Setup

If you prefer to set up manually:

1. **Activate your virtual environment**:
   ```bash
   source .venv/bin/activate  # or venv/bin/activate
   ```

2. **Install dependencies**:
   ```bash
   pip install -r backend/requirements.txt
   ```

3. **Run the development server**:
   ```bash
   python run_local.py
   ```

## Environment Variables

The local setup uses these default environment variables:

- `PORT=8080` - The port to run the server on
- `DATA_MODE=test` - Use test mode for development
- `DATA_STALENESS_MAX_MIN=30` - Allow data up to 30 minutes old
- `REQUIRE_MIN_FUND_YEARS=3` - Require at least 3 years of fundamental data
- `JWT_SECRET=local-dev-secret-key-for-testing-only` - JWT secret for authentication
- `DATABASE_URL=sqlite:///./finmodai_local.db` - Local SQLite database

You can override these by setting environment variables before running the script.

## Troubleshooting

If you encounter import errors:

1. Make sure you're running from the project root directory
2. Check that the virtual environment has all dependencies installed
3. Try running with Python's module path:
   ```bash
   PYTHONPATH=. python run_local.py
   ```

## Docker Alternative

If you prefer Docker, you can build and run the app in a container:

```bash
# Build the Docker image
docker build -t finmodai -f backend/Dockerfile .

# Run the container
docker run -p 8000:8000 -e PORT=8000 finmodai
```
