# 🚀 Render + GitHub Actions Setup (Zero Pipeline Minutes)

This guide shows how to build your Docker image on GitHub Actions and deploy it to Render as a prebuilt image, **eliminating all Render pipeline minutes usage**.

---

## 📋 **Prerequisites**

1. GitHub repository: `aromain222/FinModAI`
2. Render account with a web service
3. GitHub Personal Access Token (PAT) with `read:packages` scope

---

## 🔧 **Step 1: GitHub Setup**

### **1.1 Enable GitHub Container Registry (GHCR)**

Your images will be stored at:
```
ghcr.io/aromain222/finmodai:main
```

### **1.2 Create GitHub Personal Access Token (PAT)**

1. Go to: https://github.com/settings/tokens
2. Click **"Generate new token (classic)"**
3. Name: `Render GHCR Pull Token`
4. Expiration: **No expiration** (or 1 year)
5. Scopes: Check **`read:packages`** only
6. Click **"Generate token"**
7. **Copy the token** (starts with `ghp_...`) - you'll need it for Render

### **1.3 Add Render Deploy Hook (Optional)**

1. Go to your Render dashboard
2. Select your service
3. Go to **Settings** → **Deploy Hook**
4. Copy the deploy hook URL (looks like: `https://api.render.com/deploy/srv-...`)
5. In GitHub repo, go to **Settings** → **Secrets and variables** → **Actions**
6. Click **"New repository secret"**
7. Name: `RENDER_DEPLOY_HOOK`
8. Value: Paste the deploy hook URL
9. Click **"Add secret"**

> **Note**: The `GITHUB_TOKEN` is automatically provided by GitHub Actions, no setup needed.

---

## 🐳 **Step 2: Verify Workflow**

### **2.1 Check Workflow File**

The workflow file is at `.github/workflows/build-push.yml` and will:
- ✅ Build Docker image on every push to `main`
- ✅ Push to GHCR with tag `main`
- ✅ Use GitHub Actions cache for fast builds
- ✅ Trigger Render deploy hook (if configured)
- ✅ Use **zero** Render pipeline minutes

### **2.2 Trigger First Build**

Commit and push the workflow:
```bash
git add .github/workflows/build-push.yml .dockerignore
git commit -m "Add GitHub Actions workflow for GHCR builds"
git push origin main
```

### **2.3 Monitor Build**

1. Go to: https://github.com/aromain222/FinModAI/actions
2. Watch the **"Build and Push Docker Image to GHCR"** workflow
3. Wait for ✅ success (first build: ~5-10 min, cached builds: ~2-3 min)

### **2.4 Verify Image in GHCR**

1. Go to: https://github.com/aromain222/FinModAI/pkgs/container/finmodai
2. You should see your image with tag `main`
3. Make the image **public** (optional but recommended):
   - Click on the package
   - **Package settings** → **Change visibility** → **Public**
   - This allows Render to pull without authentication

---

## 🎯 **Step 3: Render Configuration**

### **3.1 Switch to Private Image Service**

1. Go to your Render dashboard: https://dashboard.render.com
2. Select your service (currently: `finmodai-professional`)
3. Go to **Settings**

### **3.2 Change Service Type**

Scroll to **"Service Details"** section:

**Current:**
```
Environment: Docker
Build Command: (uses Dockerfile from repo)
```

**Change to:**
1. Click **"Switch to Private Image"** (or recreate service as "Private Image")
2. **Image URL**: 
   ```
   ghcr.io/aromain222/finmodai:main
   ```
3. **Registry Credentials** (if image is private):
   - **Username**: `aromain222` (your GitHub username)
   - **Password**: Paste your GitHub PAT (the `ghp_...` token)

### **3.3 Disable Auto-Deploy**

In **Settings** → **Build & Deploy**:
- ✅ **Disable** "Auto-Deploy" from Git pushes
- ✅ **Disable** "PR Previews"

> **Why?** You want Render to only pull your prebuilt image, not build from source.

### **3.4 Environment Variables**

Keep all your existing environment variables:
```
FLASK_ENV=production
FLASK_SECRET_KEY=(auto-generated)
PORT=8000
ALPHAVANTAGE_API_KEY=EQJS9ZZ669MZCWPC
FMP_API_KEY=6FxULbNNuO1VAt6pkbr7MgzCaMlAIZjK
FRED_API_KEY=4987b43f319ba1c5d862ddabbbc4ecf8
GOOGLE_FINANCE_EMAIL=aromain27@amherst.edu
GOOGLE_FINANCE_TOKEN=3bafe26dc9d0e1f9
FINNHUB_API_KEY=d3jkenpr01qkv9k03lf0d3jkenpr01qkv9k03lfg
SIMFIN_API_KEY=c2b86058-a089-45df-a646-f3782594235e
```

### **3.5 Manual Deploy**

1. Go to **Manual Deploy** section
2. Click **"Deploy latest image"**
3. Render will pull `ghcr.io/aromain222/finmodai:main` and run it
4. Wait for deployment to complete

---

## ✅ **Step 4: Verify Zero Pipeline Minutes**

### **4.1 Check Render Dashboard**

1. Go to: https://dashboard.render.com/billing
2. Look for **"Build Minutes Used"** section
3. After switching to prebuilt images, this should show:
   ```
   Build Minutes: 0 / 500 (0%)
   ```

### **4.2 Check Service Logs**

In your service logs, you should see:
```
Pulling image ghcr.io/aromain222/finmodai:main
Image pulled successfully
Starting container...
```

**NOT:**
```
Building from Dockerfile...
Installing dependencies...
```

---

## 🔄 **Step 5: Deployment Workflow**

### **New Workflow (Zero Render Minutes):**

```
1. Developer pushes to main
   ↓
2. GitHub Actions builds Docker image (free)
   ↓
3. Image pushed to GHCR (free)
   ↓
4. (Optional) Render deploy hook triggered
   ↓
5. Render pulls prebuilt image (0 build minutes)
   ↓
6. Render runs container
```

### **Manual Deploy:**

If you didn't set up the deploy hook:
1. Push to `main` → GitHub Actions builds image
2. Wait for GitHub Actions to finish
3. Go to Render dashboard → **Manual Deploy** → **"Deploy latest image"**

---

## 📊 **Cost Savings**

### **Before (Building on Render):**
- **Build time per deploy**: ~5-10 minutes
- **Deploys per month**: ~30 (1 per day)
- **Total build minutes**: ~150-300 minutes/month
- **Free tier**: 500 minutes/month
- **Risk**: Exceeding free tier → $0.10/minute overage

### **After (Prebuilt on GitHub Actions):**
- **Render build minutes**: **0**
- **GitHub Actions minutes**: Free (2,000 minutes/month for public repos)
- **Cost**: **$0**
- **Risk**: **None** (well within GitHub's free tier)

---

## 🐛 **Troubleshooting**

### **Issue: Render can't pull image**

**Error:** `Failed to pull image: authentication required`

**Solution:**
1. Make GHCR image public (recommended):
   - Go to: https://github.com/aromain222/FinModAI/pkgs/container/finmodai
   - **Package settings** → **Change visibility** → **Public**

2. OR add credentials in Render:
   - **Username**: `aromain222`
   - **Password**: Your GitHub PAT with `read:packages` scope

### **Issue: Image not found**

**Error:** `Failed to pull image: not found`

**Solution:**
1. Check GitHub Actions completed successfully
2. Verify image exists: https://github.com/aromain222/FinModAI/pkgs/container/finmodai
3. Ensure image tag is `main` (not `latest`)
4. Wait 1-2 minutes for GHCR to propagate

### **Issue: Old code running**

**Error:** Changes not reflected after deploy

**Solution:**
1. Verify GitHub Actions built new image (check Actions tab)
2. In Render, click **"Clear build cache"** (if option exists)
3. Manually trigger **"Deploy latest image"**
4. Check image SHA in Render logs matches GitHub Actions output

### **Issue: GitHub Actions fails**

**Error:** Build fails in GitHub Actions

**Solution:**
1. Check Actions logs: https://github.com/aromain222/FinModAI/actions
2. Common issues:
   - Missing dependencies in `requirements.txt`
   - Dockerfile syntax errors
   - Build context too large (check `.dockerignore`)

---

## 🎉 **Success Checklist**

- ✅ GitHub Actions workflow running on every push to `main`
- ✅ Image successfully pushed to GHCR
- ✅ Render service switched to "Private Image"
- ✅ Render pulling from `ghcr.io/aromain222/finmodai:main`
- ✅ Render build minutes showing **0 usage**
- ✅ Application running correctly on Render
- ✅ Deployments completing in <2 minutes (just image pull + start)

---

## 📚 **Additional Resources**

- **GitHub Actions Docs**: https://docs.github.com/en/actions
- **GHCR Docs**: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
- **Render Private Images**: https://render.com/docs/deploy-an-image
- **Docker Best Practices**: https://docs.docker.com/develop/dev-best-practices/

---

## 🔐 **Security Notes**

1. **Never commit secrets** to your repository
2. **Use GitHub Secrets** for sensitive values (deploy hooks, tokens)
3. **Rotate GitHub PATs** periodically (every 6-12 months)
4. **Use least-privilege** tokens (`read:packages` only for Render)
5. **Keep GHCR images private** if they contain proprietary code

---

## 📝 **Summary**

**What changed:**
- ✅ Docker builds moved from Render → GitHub Actions
- ✅ Render now pulls prebuilt images (no building)
- ✅ **0 Render pipeline minutes used**
- ✅ Faster deployments (2-3 min vs 5-10 min)
- ✅ Free GitHub Actions minutes (2,000/month)

**Your new workflow:**
```bash
# 1. Make code changes
git add .
git commit -m "Your changes"
git push origin main

# 2. GitHub Actions automatically builds and pushes image

# 3. (Optional) Render auto-deploys via webhook
# OR manually deploy in Render dashboard
```

**Result: Zero Render build minutes, forever! 🎉**

