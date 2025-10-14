# ⚡ Deploy Cheat Sheet

## 🚀 Quick Deploy (After Setup)
```bash
./deploy.sh
```

## 🔧 One-Time Setup

### Get Fly Token
```bash
flyctl auth token
```

### Add to GitHub
1. Go to: https://github.com/aromain222/Bitcoin-Scraper/settings/secrets/actions
2. New secret: `FLY_API_TOKEN`
3. Paste your token
4. Save

## 📊 Monitor

### Watch Deploy
```
https://github.com/aromain222/Bitcoin-Scraper/actions
```

### Check App
```
https://finmodai-z9qvtg.fly.dev/
```

### View Logs
```bash
flyctl logs -a finmodai-z9qvtg
```

### Check Status
```bash
flyctl status -a finmodai-z9qvtg
```

## 🎯 What You Have

- ✅ 1,455 real SEC records
- ✅ 97 companies
- ✅ 4 model types
- ✅ Reliable CI/CD
- ✅ 45% smaller builds

## 💡 Common Commands

```bash
# Deploy
./deploy.sh

# Watch logs
flyctl logs -a finmodai-z9qvtg

# Check health
curl https://finmodai-z9qvtg.fly.dev/healthz

# SSH into container
flyctl ssh console -a finmodai-z9qvtg

# Scale machines
flyctl scale count 2 -a finmodai-z9qvtg
```

## 📚 Full Docs

- `READY_TO_DEPLOY.md` - Complete guide
- `DEPLOYMENT_SOLUTION.md` - Why it was hard
- `PROVIDER_HEALTH_GUIDE.md` - Provider system
- `SEC_EDGAR_README.md` - Data pipeline
- `EDGAR_COMPREHENSIVE_GUIDE.md` - Data usage

---

**Next deploy: Just run `./deploy.sh` - done!** 🎉

