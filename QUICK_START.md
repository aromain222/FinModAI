# 🚀 FinModAI - Quick Start Guide

## ⚡ 3-Step Setup (Takes 5 Minutes)

### Step 1: Run Setup Script
```bash
cd backend
chmod +x setup.sh
./setup.sh
```

This will:
- ✅ Check Python version
- ✅ Create virtual environment
- ✅ Install all dependencies
- ✅ Create `.env` file with secure JWT secret
- ✅ Initialize database
- ✅ Run tests
- ✅ Verify everything works

### Step 2: Start Server
```bash
chmod +x start.sh
./start.sh
```

Or manually:
```bash
source venv/bin/activate
python app.py
```

### Step 3: Test It
```bash
# Open in browser
open http://localhost:8000/api/docs

# Or test with curl
curl http://localhost:8000/health
```

---

## 🎯 Quick Test

### Test Everything Works
```bash
cd backend
chmod +x quick_test.sh
./quick_test.sh
```

This tests:
- ✅ Imports
- ✅ Configuration
- ✅ Database
- ✅ Model generation
- ✅ Export functionality
- ✅ Validation
- ✅ Authentication

---

## 📊 Test DCF Model

### 1. Sign Up
```bash
curl -X POST http://localhost:8000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!",
    "name": "Test User"
  }'
```

### 2. Login
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!"
  }'
```

**Save the `access_token` from the response!**

### 3. Generate DCF Model
```bash
curl -X POST http://localhost:8000/api/v1/models/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer REDACTED_TOKEN" \
  -d '{
    "model_type": "dcf",
    "ticker": "AAPL",
    "custom_assumptions": {
      "wacc": 0.095,
      "terminal_growth": 0.025,
      "revenue_cagr_1_5": 0.07
    }
  }'
```

**Save the `model_id` from the response!**

### 4. Download Excel
```bash
curl -X GET http://localhost:8000/api/v1/models/YOUR_MODEL_ID/excel \
  -H "Authorization: Bearer REDACTED_TOKEN" \
  --output aapl_dcf.xlsx

# Open it
open aapl_dcf.xlsx
```

### 5. Download PDF
```bash
curl -X GET http://localhost:8000/api/v1/models/YOUR_MODEL_ID/pdf \
  -H "Authorization: Bearer REDACTED_TOKEN" \
  --output aapl_dcf.pdf

# Open it
open aapl_dcf.pdf
```

---

## 🐳 Alternative: Docker

If you prefer Docker:

```bash
# From project root
docker-compose up -d

# Check logs
docker-compose logs -f backend

# Test
curl http://localhost:8000/health
```

---

## 🔧 Troubleshooting

### Issue: `command not found: python3`
**Solution**: Install Python 3.11+ from python.org

### Issue: `ModuleNotFoundError`
**Solution**: Run `./setup.sh` to install dependencies

### Issue: `JWT_SECRET not set`
**Solution**: Run `./setup.sh` to create .env file

### Issue: `Database locked`
**Solution**: Delete `finmodai.db` and run `./setup.sh` again

### Issue: Port 8000 already in use
**Solution**: 
```bash
# Kill process on port 8000
lsof -ti:8000 | xargs kill -9

# Or change port in app.py
```

---

## 📚 Next Steps

### Test More Features
- Try different tickers (MSFT, GOOGL, etc.)
- Try custom assumptions
- Test validation (try invalid inputs)
- Generate multiple models

### Deploy to Production
- See `DEPLOYMENT_GUIDE.md`
- Options: Fly.io, Render.com, Railway
- All configurations included

### Integrate with Frontend
- API base URL: `http://localhost:8000`
- Use JWT tokens for authentication
- All endpoints documented at `/api/docs`

---

## 🎉 Success Criteria

You'll know it's working when:
- ✅ Setup script completes without errors
- ✅ Server starts on port 8000
- ✅ Health check returns `{"status": "healthy"}`
- ✅ You can sign up and login
- ✅ You can generate a DCF model for AAPL
- ✅ You can download Excel and PDF files
- ✅ Files open correctly

---

## 🆘 Need Help?

### Check Logs
```bash
# Server logs
python app.py

# Test logs
./quick_test.sh
```

### Check Documentation
- `README.md` - Main documentation
- `backend/README.md` - Backend guide
- `DEPLOYMENT_GUIDE.md` - Deployment guide
- `MVP_FINAL_SUMMARY.md` - Complete feature list

### Common Commands
```bash
# Run setup
cd backend && ./setup.sh

# Run tests
cd backend && ./quick_test.sh

# Start server
cd backend && ./start.sh

# Check health
curl http://localhost:8000/health

# View API docs
open http://localhost:8000/api/docs
```

---

**Built with ❤️ for FinModAI**

**Ready to test tomorrow! 🚀**

