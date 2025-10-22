FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install gunicorn
RUN pip install --no-cache-dir gunicorn

# Copy application
COPY backend/ .

# Create necessary directories
RUN mkdir -p exports uploads

# Expose port
EXPOSE 8080

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV WEB_CONCURRENCY=2
ENV PORT=8080

# Run application with gunicorn
CMD ["sh", "-c", "gunicorn app:app --bind 0.0.0.0:${PORT} --workers ${WEB_CONCURRENCY} --timeout 120 --worker-class uvicorn.workers.UvicornWorker --access-logfile - --error-logfile -"]

