# AI Financial Analyst Setup Guide

This guide will help you set up the AI Financial Analyst feature, which allows you to ask natural language questions about stocks and get intelligent, data-driven answers.

## Overview

The AI Financial Analyst combines:
- **Polygon.io MCP Server**: Provides real-time market data as AI-usable tools
- **Claude 4 (Anthropic)**: Advanced reasoning and natural language understanding
- **Pydantic AI**: Structured, type-safe agent framework
- **Rich**: Beautiful terminal formatting

## Prerequisites

1. **Python 3.10+**
2. **UV package manager** (for MCP server)
3. **Polygon.io API key** ([Get one here](https://polygon.io/dashboard))
4. **Anthropic API key** ([Get one here](https://console.anthropic.com/))

## Installation

### 1. Install UV (if not already installed)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Or on macOS with Homebrew:
```bash
brew install uv
```

### 2. Install Python Dependencies

```bash
pip install -r requirements_ai_analyst.txt
```

### 3. Configure API Keys

Add your API keys to your `.env` file:

```bash
# Polygon.io API Key
POLYGON_API_KEY=your_polygon_api_key_here

# Anthropic API Key
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

## Usage

### Option 1: Interactive CLI

Run the interactive chat interface:

```bash
python ai_financial_analyst.py
```

Example queries:
- "Get the latest price of Tesla"
- "How is AAPL performing compared to AMZN?"
- "What's the total return on investment for Microsoft over the past 5 years?"
- "Search the latest news about crypto and explain recent market movements"
- "Compare Meta, Amazon, and Google based on returns, earnings, and market sentiment"

### Option 2: Flask API Integration

The AI analyst is integrated into your existing FinModAI platform via Flask API endpoints.

#### Health Check

```bash
curl https://finmodai-z9qvtg.fly.dev/api/v1/ai-analyst/health
```

#### Query Endpoint

```bash
curl -X POST https://finmodai-z9qvtg.fly.dev/api/v1/ai-analyst/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How is AAPL performing compared to AMZN?"
  }'
```

Response:
```json
{
  "success": true,
  "response": "Based on the latest market data...",
  "model": "claude-4-sonnet-20250514",
  "sources": ["polygon.io"],
  "query": "How is AAPL performing compared to AMZN?"
}
```

### Option 3: Programmatic Usage

```python
from ai_financial_analyst import single_query

# Execute a single query
response = await single_query("What is the current P/E ratio of Apple?")
print(response)
```

## Example Queries

### Simple Price Lookup
```
Get the latest price of Tesla
```

### Comparative Analysis
```
How is AAPL performing compared to AMZN?
```

### Historical Performance
```
Look back from today to five years ago. 
Return the total return on investment for Microsoft
```

### News Analysis
```
Crypto has been up and down recently. 
Search the latest news, and tell me why
```

### Multi-Stock Deep Analysis
```
Consider an investment between Meta, Amazon, and Google. 
Which one is the best bet based on returns, earnings, 
latest news, and market sentiment?
```

## Architecture

```
User Query (Natural Language)
    ↓
Pydantic AI Agent
    ↓
Claude 4 (Reasoning Engine)
    ↓
Polygon.io MCP Server (Data Tools)
    ↓
Polygon.io API (Real-time Data)
    ↓
Structured Response
```

## Features

- ✅ **Natural Language Queries**: Ask questions in plain English
- ✅ **Real-time Data**: Access to live market data via Polygon.io
- ✅ **Multi-ticker Analysis**: Compare multiple stocks
- ✅ **Historical Analysis**: Analyze performance over time
- ✅ **News Integration**: Access to latest financial news
- ✅ **Structured Output**: Type-safe, predictable responses
- ✅ **Conversation History**: Maintains context across queries

## Troubleshooting

### "POLYGON_API_KEY not found"
- Make sure you've added your Polygon.io API key to the `.env` file
- Restart your application after adding the key

### "ANTHROPIC_API_KEY not found"
- Make sure you've added your Anthropic API key to the `.env` file
- Restart your application after adding the key

### "UV not found"
- Install UV using the command in the Installation section
- Make sure UV is in your PATH

### Slow Responses
- Complex queries may take 10-30 seconds to process
- The AI is making multiple API calls to gather comprehensive data
- This is normal behavior

## Cost Considerations

### Polygon.io
- Free tier: 5 API calls per minute
- Paid plans: Higher rate limits and more features
- [Pricing details](https://polygon.io/pricing)

### Anthropic Claude
- Claude 4 Sonnet: $3/million input tokens, $15/million output tokens
- Typical query: ~$0.01-0.05 per query
- [Pricing details](https://www.anthropic.com/pricing)

## Next Steps

1. **Test the CLI**: Run `python ai_financial_analyst.py` and try some queries
2. **Integrate into UI**: Add a chat interface to your web app
3. **Customize Prompts**: Modify the system prompt for your specific use case
4. **Add Features**: Extend with additional data sources or analysis capabilities

## Resources

- [Polygon.io Documentation](https://polygon.io/docs)
- [Polygon.io MCP Server](https://github.com/polygon-io/mcp_polygon)
- [Pydantic AI Documentation](https://ai.pydantic.dev/)
- [Anthropic Claude Documentation](https://docs.anthropic.com/)
- [Original Tutorial](https://github.com/polygon-io/community/tree/main/examples/rest/market-parser-polygon-mcp)

## Support

For issues or questions:
- Check the [Polygon.io Community](https://github.com/polygon-io/community)
- Review the [Pydantic AI GitHub](https://github.com/pydantic/pydantic-ai)
- Contact Polygon.io support for API issues

