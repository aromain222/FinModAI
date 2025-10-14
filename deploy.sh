#!/bin/bash
# Simple deployment script for FinModAI
# This will commit your changes and trigger automatic deployment

set -e

echo "========================================================================"
echo "  FinModAI Deployment Script"
echo "========================================================================"
echo ""

# Check if we're in git repo
if [ ! -d .git ]; then
    echo "✗ Not in a git repository"
    exit 1
fi

# Check for changes
if [[ -z $(git status -s) ]]; then
    echo "✓ No changes to commit"
    echo "  Checking GitHub Actions status..."
    echo ""
    echo "Visit: https://github.com/aromain222/Bitcoin-Scraper/actions"
    echo ""
    exit 0
fi

echo "📝 Changes detected:"
git status -s | head -10
echo ""

# Ask for commit message
read -p "Commit message (or press Enter for default): " COMMIT_MSG
if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="Deploy: $(date '+%Y-%m-%d %H:%M')"
fi

echo ""
echo "📦 Committing changes..."
git add .
git commit -m "$COMMIT_MSG"

echo ""
echo "🚀 Pushing to GitHub (will trigger deployment)..."
git push origin main

echo ""
echo "========================================================================"
echo "  ✅ Pushed successfully!"
echo "========================================================================"
echo ""
echo "🔄 GitHub Actions will now:"
echo "  1. Build Docker image and push to GHCR (~2 min)"
echo "  2. Deploy to Fly.io (~1 min)"
echo "  3. Run health checks"
echo ""
echo "📊 Watch progress:"
echo "  https://github.com/aromain222/Bitcoin-Scraper/actions"
echo ""
echo "🌐 Your app will be live at:"
echo "  https://finmodai-z9qvtg.fly.dev/"
echo ""
echo "✓ Deployment initiated!"

