=== ROOT-CAUSE REPORT (FinModAI) ===

## [1] Worker Boot Failure

### Crash loop cause:
- **Traceback**: `ModuleNotFoundError: No module named 'app'`
- **Module**: backend/Dockerfile (line 33)
- **Reason**: The Gunicorn command in the Dockerfile uses an incorrect module path (`app:app` instead of `backend.app:app`). When deployed to Fly.io, Gunicorn tries to import the `app` module from the root directory, but it should be importing from the `backend` package.

### Fix:
- Update the CMD in Dockerfile to use the correct module path:
```
CMD ["gunicorn","backend.app:app","--worker-class","uvicorn.workers.UvicornWorker","--bind","0.0.0.0:${PORT}","--workers","${WEB_CONCURRENCY}","--timeout","120","--graceful-timeout","30"]
```

### Verification:
- `docker run -e PORT=8080 -p 8080:8080 finmodai-local:debug` -> `/healthz` returns 200
- `flyctl logs` should show "Listening on 0.0.0.0:8080" without worker boot errors

## [2] Missing Dependency

### Cause:
- **Module**: backend/requirements.txt
- **Reason**: Gunicorn is not included in requirements.txt, making it easy to miss this dependency in local development or when someone else tries to run the app without the Dockerfile.

### Fix:
- Add gunicorn to requirements.txt:
```
gunicorn==21.2.0
```

### Verification:
- `pip install -r backend/requirements.txt` installs all necessary dependencies
- Application can be run locally with `gunicorn backend.app:app --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8080`

## [3] Environment Variable Validation

### Cause:
- **Module**: backend/config.py (line 98-99)
- **Reason**: The config validation properly raises an error if `DATA_STALENESS_MAX_MIN` is not set in production mode, but this needs to be enforced in CI and deployment.

### Fix:
- Ensure the required environment variables are set in Fly.io:
```
flyctl secrets set DATA_MODE=production DATA_STALENESS_MAX_MIN=30 REQUIRE_MIN_FUND_YEARS=3 -a finmodai-z9qvtg
```

### Verification:
- Application starts without configuration errors
- `flyctl logs` shows "✅ Production mode: Dummy data blocked"

## [4] CI Configuration

### Cause:
- **Module**: .github/workflows/mvp-ci.yml
- **Reason**: The CI is correctly set up with the required environment variables for testing, but could benefit from more explicit checks for the production environment.

### Fix:
- The CI configuration is already good, with proper environment variables set for testing:
```yaml
env:
  JWT_SECRET: "test-jwt-secret-for-ci-minimum-32-characters-long"
  DATA_MODE: "test"
  DATA_STALENESS_MAX_MIN: "30"
  REQUIRE_MIN_FUND_YEARS: "3"
```

### Verification:
- CI passes all checks
- real-data-enforcement job passes

## [5] Fly.io Configuration

### Cause:
- **Module**: fly.toml
- **Reason**: The fly.toml file uses the newer `[http_service]` format, which is good, but needs to ensure it's compatible with the Fly.io platform.

### Fix:
- The fly.toml configuration is already good, with proper settings:
```toml
[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true
```

### Verification:
- `flyctl deploy` completes successfully
- Application is accessible at https://finmodai-z9qvtg.fly.dev/

## Prevention Measures

1. **Module Import Path Standardization**:
   - Always use absolute imports (`from backend.module import x`)
   - Avoid relative imports (`from .module import x` or `from module import x`)
   - Document the correct module paths in README.md

2. **Dependency Management**:
   - Include all runtime dependencies in requirements.txt, even if they're installed in the Dockerfile
   - Use `pip-compile` or similar tools to maintain consistent dependencies
   - Add comments to requirements.txt to clarify why each dependency is needed

3. **Configuration Validation**:
   - Add startup preflight logging of critical environment variables
   - Fail fast if required environment variables are missing
   - Provide clear error messages for configuration issues

4. **CI Improvements**:
   - Add explicit checks for production environment variables
   - Add tests for configuration validation
   - Cache dependencies to speed up CI

5. **Dockerfile Best Practices**:
   - Use explicit CMD arrays instead of shell form
   - Copy and install requirements before copying the application code
   - Use .dockerignore to exclude unnecessary files

6. **Fly.io Deployment**:
   - Pin the platform version to avoid compatibility issues
   - Use health checks with appropriate grace periods
   - Monitor logs after deployment to catch any issues early

## Deployment Plan

1. **Build and test locally**:
```bash
docker build -t finmodai-local:debug -f backend/Dockerfile .
docker run -p 8080:8080 -e PORT=8080 finmodai-local:debug
curl -f http://localhost:8080/healthz
```

2. **Deploy to Fly.io**:
```bash
# Ensure we're on the Machines platform
flyctl apps update --machines -a finmodai-z9qvtg

# Set required secrets
flyctl secrets set DATA_MODE=production DATA_STALENESS_MAX_MIN=30 REQUIRE_MIN_FUND_YEARS=3 -a finmodai-z9qvtg

# Deploy with immediate strategy
flyctl deploy -a finmodai-z9qvtg --strategy immediate
```

3. **Verify deployment**:
```bash
# Check logs for successful startup
flyctl logs -a finmodai-z9qvtg

# Check health endpoint
curl -f https://finmodai-z9qvtg.fly.dev/healthz
```

## Conclusion

The primary issue causing the worker boot failures was an incorrect module path in the Gunicorn command. By updating the CMD in the Dockerfile to use `backend.app:app` instead of `app:app`, we ensure that Gunicorn can correctly import the FastAPI application. Additionally, adding Gunicorn to requirements.txt ensures that all dependencies are properly documented and installed.

With these fixes in place, the application should deploy successfully to Fly.io and remain stable in production.
