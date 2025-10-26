# Use Python 3.11 slim-bullseye for smaller base image
FROM python:3.11-slim-bullseye as builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Create venv and install dependencies
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Runtime stage
FROM python:3.11-slim-bullseye

# Copy venv from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 finmodai
USER finmodai

WORKDIR /app

# Copy application code
COPY --chown=finmodai:finmodai backend/ .

# Create necessary directories
RUN mkdir -p exports uploads

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    WEB_CONCURRENCY=2 \
    PORT=8080 \
    PYTHONPATH=/app

# Run application with gunicorn
CMD ["gunicorn","backend.app:app","--worker-class","uvicorn.workers.UvicornWorker","--bind","0.0.0.0:${PORT}","--workers","${WEB_CONCURRENCY}","--timeout","120","--graceful-timeout","30"]