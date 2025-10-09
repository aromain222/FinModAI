# ⚡ Quick GHCR Setup (5 Minutes)

## 🎯 Goal
**Zero Render build minutes** by using GitHub Actions to build Docker images.

---

## 📝 **Step-by-Step**

### **1. GitHub Personal Access Token (PAT)**
```
1. Go to: https://github.com/settings/tokens
2. "Generate new token (classic)"
3. Scopes: ✅ read:packages
4. Copy token (ghp_...)
```

### **2. Add Deploy Hook to GitHub (Optional)**
```
1. Render Dashboard → Your Service → Settings → Deploy Hook
2. Copy URL
3. GitHub Repo → Settings → Secrets → Actions
4. New secret: RENDER_DEPLOY_HOOK = <paste URL>
```

### **3. Push Workflow**
```bash
git add .github/workflows/build-push.yml .dockerignore
git commit -m "Add GHCR workflow"
git push origin main
```

### **4. Wait for Build**
```
Go to: https://github.com/aromain222/FinModAI/actions
Wait for ✅ (5-10 min first time)
```

### **5. Make Image Public (Recommended)**
```
1. Go to: https://github.com/aromain222/FinModAI/pkgs/container/finmodai
2. Package settings → Change visibility → Public
```

### **6. Update Render Service**
```
Render Dashboard → Your Service → Settings:

Image URL: ghcr.io/aromain222/finmodai:main

Registry Credentials (if private):
  Username: aromain222
  Password: <your PAT from step 1>

Disable:
  ❌ Auto-Deploy from Git
  ❌ PR Previews
```

### **7. Deploy**
```
Render Dashboard → Manual Deploy → "Deploy latest image"
```

---

## ✅ **Verification**

### **Check Build Minutes:**
```
Render Dashboard → Billing
Build Minutes: 0 / 500 (0%) ✅
```

### **Check Logs:**
```
Should see:
  "Pulling image ghcr.io/aromain222/finmodai:main" ✅

Should NOT see:
  "Building from Dockerfile..." ❌
```

---

## 🔄 **Daily Workflow**

```bash
# Make changes
git add .
git commit -m "Your changes"
git push origin main

# GitHub Actions builds (automatic)
# Render deploys (automatic if webhook set up)
# OR manually: Render Dashboard → Deploy latest image
```

---

## 📊 **Savings**

| Before | After |
|--------|-------|
| 150-300 min/month | **0 min/month** |
| Risk of overage | **No risk** |
| 5-10 min deploys | **2-3 min deploys** |

---

## 🆘 **Quick Fixes**

**Image not found?**
```
Wait 2 min, check: https://github.com/aromain222/FinModAI/actions
```

**Can't pull image?**
```
Make image public OR add PAT credentials in Render
```

**Old code running?**
```
Render → Manual Deploy → "Deploy latest image"
```

---

## 🎉 **Done!**

Your app now:
- ✅ Builds on GitHub (free)
- ✅ Deploys to Render (0 build minutes)
- ✅ Saves money
- ✅ Deploys faster

**Image URL:** `ghcr.io/aromain222/finmodai:main`

