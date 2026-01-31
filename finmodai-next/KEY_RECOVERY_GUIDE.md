# 🔑 API Key Recovery Guide

## ✅ Keys I Found

I found some of your keys in your project files. Here's what I recovered:

### Found Keys:
- ✅ **Supabase URL**: `https://thvbhrzavzjnwecwhbgj.supabase.co`
- ✅ **News API Key**: `d3da98f439d04ea590e73c8183b06ebd`
- ✅ **Finnhub Key**: `d3nth2hr01qtm4jea48gd3nth2hr01qtm4jea490` (for backend)
- ✅ **SEC Email**: `kingromain23@gmail.com`

### Missing Keys (Need to Recover):
- ❌ **Supabase Anon Key** - Need to get from Supabase dashboard
- ❌ **OpenAI API Key** - Need to get from OpenAI dashboard
- ❌ **Supabase Service Role Key** (optional)

## 🚀 Quick Setup Steps

### Step 1: Create .env.local file
```bash
cd /Users/averyromain/FinModAI/finmodai-next
cp .env.local.template .env.local
```

### Step 2: Get Your Supabase Keys
1. Go to: https://supabase.com/dashboard/project/thvbhrzavzjnwecwhbgj
2. Click **Settings** → **API**
3. Copy the **"anon public"** key
4. Paste it into `.env.local` as `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Step 3: Get Your OpenAI Key
1. Go to: https://platform.openai.com/api-keys
2. Click **"Create new secret key"**
3. Copy the key (you'll only see it once!)
4. Paste it into `.env.local` as `OPENAI_API_KEY`

### Step 4: Edit .env.local
Open the file and replace the placeholders:
```bash
nano .env.local
# or use VS Code: code .env.local
```

## 📋 Complete .env.local Template

```bash
# CapitalBase Environment Variables
NEXT_PUBLIC_SUPABASE_URL=https://thvbhrzavzjnwecwhbgj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=PASTE_YOUR_ANON_KEY_HERE

OPENAI_API_KEY=PASTE_YOUR_OPENAI_KEY_HERE
OPENAI_MODEL=gpt-4o-mini

NEWS_API_KEY=d3da98f439d04ea590e73c8183b06ebd
```

## ✅ Verify It Works

After setting up, restart your dev server:
```bash
npm run dev
```

Then test:
1. Visit http://localhost:3000
2. Try logging in or using guest mode
3. Test the chat/scenario engine

## 🔒 Security Note

**IMPORTANT**: I found some keys accidentally in your `.gitignore` file. You should:
1. Remove keys from `.gitignore` (keys shouldn't be there)
2. Make sure `.env.local` is in `.gitignore` (it already is ✅)
3. Never commit API keys to git

## 🆘 Still Missing Keys?

If you can't find your keys:
- **Supabase**: Check your Supabase dashboard (link above)
- **OpenAI**: Create a new key at platform.openai.com
- **Other keys**: Check your email for signup confirmations

