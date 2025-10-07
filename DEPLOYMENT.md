# Deploying FinModAI to Render

## Quick Deployment Steps

1. **Push to GitHub**: Make sure all your files are committed and pushed to your GitHub repository.

2. **Connect to Render**:
   - Go to [render.com](https://render.com)
   - Sign up/login with your GitHub account
   - Click "New" → "Web Service"
   - Connect your GitHub repository

3. **Configure the Service**:
   - **Name**: `finmodai` (or your preferred name)
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python -m gunicorn --bind 0.0.0.0:$PORT --workers 1 --timeout 120 minimal_app:app`
   - **Plan**: Free (for testing)

   **Alternative**: If the above doesn't work, try:
   - **Start Command**: `python3 start.py`

4. **Environment Variables** (if needed):
   - `FLASK_ENV`: `production`
   - `PORT`: `10000` (Render will override this automatically)

5. **Deploy**: Click "Create Web Service" and wait for deployment.

## Files Ready for Deployment

✅ **render.yaml** - Render configuration
✅ **requirements.txt** - All dependencies including Flask and gunicorn
✅ **start.py** - Production startup script with gunicorn
✅ **minimal_app.py** - Main Flask application
✅ **templates/** - All HTML templates

## What the App Does

Your deployed app will provide:
- DCF (Discounted Cash Flow) analysis
- Historical financial data from yfinance
- Excel model downloads
- Professional financial modeling interface

## Access Your App

Once deployed, you'll get a URL like: `https://your-app-name.onrender.com`

## Troubleshooting

- **Build fails**: Check that all dependencies are in requirements.txt
- **App crashes**: Check the logs in Render dashboard
- **Port issues**: The start.py script handles Render's PORT environment variable automatically

## Local Testing

To test locally with the same setup as production:
```bash
pip install -r requirements.txt
python3 start.py
```

This will start the app with gunicorn on port 10000.