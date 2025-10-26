# Troubleshooting Guide for Local Development

If you're experiencing issues with running the application locally, follow this step-by-step troubleshooting guide.

## Connection Refused Issues

If you see "Connection refused" errors when trying to access localhost:

### Step 1: Check Dependencies

Run the dependency checker to make sure you have all required packages:

```bash
python3 check_dependencies.py
```

### Step 2: Test with Basic HTTP Server

Try running the basic HTTP server that uses only Python standard library (no dependencies):

```bash
python3 basic_server.py
```

Then visit http://localhost:8090 in your browser.

If this works, the issue is likely with FastAPI/Uvicorn, not with your network.

### Step 3: Test with Minimal FastAPI App

Try the minimal FastAPI app:

```bash
python3 minimal_test_app.py
```

Then visit http://localhost:8080 in your browser.

If this works but the full app doesn't, the issue is with the application code.

### Step 4: Check Port Availability

Make sure no other application is using the ports:

```bash
# For macOS/Linux
lsof -i :8080
lsof -i :8090

# For Windows (in PowerShell)
# netstat -ano | findstr :8080
# netstat -ano | findstr :8090
```

### Step 5: Try Different Ports

Edit the port numbers in the scripts if needed:

- In `run_local.py`: Change `os.environ["PORT"] = "8080"` to another port
- In `minimal_test_app.py`: Change `port=8080` to another port
- In `basic_server.py`: Change `PORT = int(os.environ.get("PORT", 8090))` to another port

### Step 6: Check Firewall Settings

Make sure your firewall isn't blocking the connections:

- On macOS: System Preferences > Security & Privacy > Firewall
- On Windows: Windows Defender Firewall
- On Linux: Check your distribution's firewall settings (ufw, firewalld, etc.)

### Step 7: Check Network Interface

Try binding to a specific interface instead of 0.0.0.0:

Edit the scripts to use:
- `host="127.0.0.1"` instead of `host="0.0.0.0"`

## Python Environment Issues

If you're having issues with Python or dependencies:

### Step 1: Check Python Version

```bash
python3 --version
```

Make sure you're using Python 3.6 or newer.

### Step 2: Create a Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r backend/requirements.txt
```

### Step 3: Install Core Dependencies Manually

```bash
pip install fastapi uvicorn
```

## Application-Specific Issues

If the basic servers work but the full app doesn't:

### Step 1: Check for Import Errors

Look for import errors in the console output.

### Step 2: Check Environment Variables

Make sure all required environment variables are set.

### Step 3: Try Running with Debug Mode

Edit `run_local.py` to include more debugging:

```python
uvicorn.run(
    app,
    host="127.0.0.1",  # Try localhost specifically
    port=port,
    log_level="debug",
    reload=True,
)
```

## Getting Help

If you've tried all these steps and still have issues:

1. Collect the error messages from the console
2. Note which steps you've tried and their results
3. Share this information when asking for help
