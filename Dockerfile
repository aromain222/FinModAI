# Use Python 3.11.8 as specified in runtime.txt
FROM python:3.11.8-slim

# Set working directory
WORKDIR /app

# Copy requirements first to leverage Docker cache
COPY requirements.txt .

# Install dependencies properly
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir et-xmlfile==1.1.0 && \
    pip install --no-cache-dir openpyxl==3.1.2 && \
    pip install --no-cache-dir -r requirements.txt

# Verify critical dependencies are installed
RUN python -c "import et_xmlfile; print(f'✓ et-xmlfile {et_xmlfile.__version__} installed')" && \
    python -c "import openpyxl; print(f'✓ openpyxl {openpyxl.__version__} installed')" && \
    python -c "import pandas; print(f'✓ pandas {pandas.__version__} installed')" && \
    python -c "import numpy; print(f'✓ numpy {numpy.__version__} installed')" && \
    python -c "import yfinance; print(f'✓ yfinance {yfinance.__version__} installed')" && \
    python -c "import flask; print(f'✓ flask {flask.__version__} installed')" && \
    python -c "import gunicorn; print(f'✓ gunicorn {gunicorn.__version__} installed')"

# Copy application code
COPY . .

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash app && \
    chown -R app:app /app
USER app

# Expose port (Render will override with $PORT)
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD python -c "import requests; requests.get('http://localhost:8000/healthz', timeout=5)"

# Start command
CMD ["gunicorn", "minimal_app:app", "--config", "gunicorn_config.py", "--bind", "0.0.0.0:8000"]