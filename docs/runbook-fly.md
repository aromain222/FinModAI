# Fly.io Runbook (Machines)

## Triage

- View logs (last 15m):
```
flyctl logs -a finmodai-z9qvtg --since 15m
```

- Check health checks:
```
flyctl checks list -a finmodai-z9qvtg
```

- SSH console:
```
flyctl ssh console -a finmodai-z9qvtg
```

## Common Failures & Fixes

- Worker failed to boot:
  - Wrong module path in Dockerfile CMD. Should be `backend.app:app`.
  - Missing dependency (ensure in backend/requirements.txt).
  - Env guard failed (production requires DATA_STALENESS_MAX_MIN). Fix via secrets.

- Platform mismatch (Nomad vs Machines):
```
flyctl apps update --machines -a finmodai-z9qvtg
```

- OOM (exit 137):
```
flyctl machine update <MACHINE_ID> --memory 1024 --cpus 1 -a finmodai-z9qvtg
```

- Port mismatch:
  - Ensure Gunicorn binds to `0.0.0.0:${PORT}` and internal_port=8080 in fly.toml.

## Rollback

From GitHub Actions (workflow_dispatch), provide the previous image tag.
Or locally:
```
flyctl deploy -a finmodai-z9qvtg --image registry.fly.io/finmodai-z9qvtg:<TAG> --strategy immediate
```

## Fast Deploys

```
TAG=$(date +%Y%m%d%H%M%S)
flyctl auth docker
docker buildx build --platform linux/amd64 -t registry.fly.io/finmodai-z9qvtg:$TAG -f backend/Dockerfile --push .
flyctl deploy -a finmodai-z9qvtg --image registry.fly.io/finmodai-z9qvtg:$TAG --strategy immediate
```


