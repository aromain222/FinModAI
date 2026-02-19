# FinModAI Environment Setup Guide

## Required Environment Variables

Create a `.env.local` file in the root of the project with the following variables:

### 🔴 **REQUIRED** for Chat/Scenario Engine to work:

```bash
# OpenAI API Key (REQUIRED for chat functionality)
OPENAI_API_KEY=REDACTED

# Optional: Specify OpenAI model (defaults to gpt-4o-mini if not set)
OPENAI_MODEL=gpt-4o-mini
```

### 🟢 **REQUIRED** for Supabase Auth:

```bash
# Supabase Configuration (REQUIRED for login/auth)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=REDACTED
```

### 🟡 **OPTIONAL** for Enhanced Features:

```bash
# Perigon API key (optional - preferred provider for live headlines)
PERIGON_API_KEY=your-perigon-api-key-here

# NewsAPI key (optional fallback provider)
NEWSAPI_KEY=your-newsapi-key-here

# Supabase Service Role Key (optional - for macro indicators from database)
SUPABASE_SERVICE_ROLE_KEY=REDACTED
```

## Quick Start

1. Copy this template to `.env.local`:
   ```bash
   cp ENV_SETUP_GUIDE.md .env.local
   ```

2. Edit `.env.local` and replace the placeholder values with your actual API keys.

3. Restart the dev server:
   ```bash
   npm run dev
   ```

## Getting API Keys

### OpenAI API Key
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Copy and paste it into `OPENAI_API_KEY`

### Supabase Keys
1. Go to your Supabase project dashboard
2. Navigate to Settings → API
3. Copy the "Project URL" and "anon public" key
4. Paste them into `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### News API Key (Optional)
1. Go to https://newsapi.org/register
2. Sign up for a free account
3. Copy your API key

## Testing the Setup

After setting up your `.env.local`:

1. Visit http://localhost:3000/auth/login
2. Click "Continue as guest"
3. Click "Open Scenario Engine"
4. Try asking: "Tell me about AAPL"

If you see a response, everything is working! 🎉

If you see an error about missing API keys, double-check your `.env.local` file.
