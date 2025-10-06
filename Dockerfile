FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y gcc g++ curl && rm -rf /var/lib/apt/lists/*

# Copy and install requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install gunicorn

# Copy application
COPY . .

# Create directories
RUN mkdir -p generated_models uploads

# Make startup script executable
RUN chmod +x docker-entrypoint.sh

# Simple startup
CMD ["./docker-entrypoint.sh"]

