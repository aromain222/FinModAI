"""Gunicorn configuration with dependency preloading."""
import sys
import os

# Preload dependencies before forking workers
def on_starting(server):
    """Run before the master process is initialized."""
    print("="*60)
    print("Gunicorn starting - preloading critical dependencies...")
    print("="*60)
    
    # Test critical imports
    critical_imports = [
        'flask',
        'gunicorn', 
        'pandas',
        'numpy',
        'requests',
        'bs4',
        'et_xmlfile',
        'openpyxl',
    ]
    
    failed_imports = []
    for module_name in critical_imports:
        try:
            __import__(module_name)
            print(f"✓ {module_name} loaded successfully")
        except ImportError as e:
            print(f"✗ FAILED to import {module_name}: {e}")
            failed_imports.append(module_name)
    
    if failed_imports:
        print("="*60)
        print(f"ERROR: Failed to import critical modules: {', '.join(failed_imports)}")
        print("Cannot start application without required dependencies.")
        print("="*60)
        sys.exit(1)
    
    print("="*60)
    print("All critical dependencies loaded successfully!")
    print("="*60)
    
    # Run provider health checks
    try:
        from provider_health import run_startup_checks
        print("\n")
        run_startup_checks()
        print("\n")
    except Exception as e:
        print(f"⚠️  Warning: Provider health checks failed: {e}")
        print("Application will start but data providers may not be available")

def on_reload(server):
    """Run when workers are reloaded."""
    print("Workers reloading...")

def worker_int(worker):
    """Run when worker receives SIGINT or SIGQUIT."""
    print(f"Worker {worker.pid} interrupted")

def worker_abort(worker):
    """Run when worker receives SIGABRT."""
    print(f"Worker {worker.pid} aborted")

# Gunicorn config
bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"
workers = 2  # 2 workers for 512MB tier
worker_class = "sync"
timeout = 120
keepalive = 5
max_requests = 1000
max_requests_jitter = 50
preload_app = True  # Preload app before forking workers
accesslog = "-"
errorlog = "-"
loglevel = "info"

