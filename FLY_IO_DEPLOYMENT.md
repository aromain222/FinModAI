# 🚀 Fly.io Deployment Guide

## ⚠️ Known Issue: IPv6 Connectivity in SJC Region

Fly.io has identified IPv6 connectivity issues in their SJC region due to a faulty network switch. This affects outbound IPv6 traffic.

### Solution: Change Region

We've configured the app to use the **IAD (Washington D.C.)** region instead of SJC to avoid these issues.

---

## 🚀 Deploy to Fly.io

### 1. Install Fly CLI
```bash
# macOS
brew install flyctl

# Or download from https://fly.io/docs/hands-on/install-flyctl/
```

### 2. Login to Fly.io
```bash
fly auth login
```

### 3. Create App
```bash
fly apps create finmodai-backend --region iad
```

### 4. Set Secrets
```bash
# Generate JWT secret
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Set secrets
fly secrets set JWT_SECRET="your-generated-secret-here"
fly secrets set ALPHAVANTAGE_API_KEY="your-key-here"
fly secrets set FINNHUB_API_KEY="your-key-here"
fly secrets set POLYGON_API_KEY="your-key-here"
```

### 5. Set Database URL (Optional)
```bash
# For SQLite (default)
fly secrets set DATABASE_URL="sqlite:///./finmodai.db"

# For PostgreSQL (recommended for production)
fly postgres create --name finmodai-db --region iad
fly secrets set DATABASE_URL="postgresql://user:pass@host:5432/finmodai"
```

### 6. Deploy
```bash
fly deploy
```

### 7. Check Status
```bash
fly status
fly logs
```

---

## 🔧 Configuration

### Region Selection
The app is configured to use **IAD (Washington D.C.)** region to avoid IPv6 issues in SJC.

To change region:
```bash
fly regions set iad
```

### Scaling
```bash
# Scale to 1 machine
fly scale count 1

# Scale to multiple machines
fly scale count 3

# Scale memory
fly scale memory 1024
```

### Monitoring
```bash
# View logs
fly logs

# View metrics
fly dashboard

# SSH into machine
fly ssh console
```

---

## 🐛 Troubleshooting

### Issue: IPv6 connectivity errors
**Solution**: Already fixed by using IAD region instead of SJC

### Issue: App won't start
**Solution**: Check logs
```bash
fly logs
```

### Issue: Database connection failed
**Solution**: Check DATABASE_URL secret
```bash
fly secrets list
```

### Issue: Out of memory
**Solution**: Scale memory
```bash
fly scale memory 1024
```

---

## 📊 Post-Deployment

### Test the API
```bash
# Get app URL
fly info

# Test health
curl https://your-app.fly.dev/health

# Test API docs
open https://your-app.fly.dev/api/docs
```

### Monitor Performance
```bash
# View metrics
fly dashboard

# View logs
fly logs -a finmodai-backend
```

---

## 🔒 Security

### HTTPS
- Automatically enabled by Fly.io
- SSL certificate managed by Fly.io
- Force HTTPS enabled in `fly.toml`

### Secrets
- Never commit secrets to git
- Use `fly secrets set` to manage secrets
- Secrets are encrypted at rest

---

## 💰 Cost Optimization

### Auto-scaling
```toml
auto_stop_machines = true
auto_start_machines = true
min_machines_running = 0
```

This configuration:
- Stops machines when idle
- Starts machines on demand
- Saves costs when not in use

### Resource Limits
```toml
[vm]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
```

Adjust based on usage:
- Low traffic: 256mb, 1 CPU
- Medium traffic: 512mb, 1 CPU
- High traffic: 1gb, 2 CPUs

---

## 🚀 Quick Deploy Commands

```bash
# Deploy
fly deploy

# Deploy with remote builder
fly deploy --remote-only

# Deploy specific image
fly deploy --image your-image:tag

# Rollback
fly deploy --image registry.fly.io/finmodai-backend:deployment-123

# Restart
fly apps restart finmodai-backend
```

---

## 📞 Support

### Fly.io Status
- Check: https://status.fly.io
- Known issues: IPv6 in SJC region

### Documentation
- Fly.io Docs: https://fly.io/docs
- FinModAI Docs: See README.md

---

**Built with ❤️ for FinModAI**

**Ready for Fly.io deployment! 🚀**

