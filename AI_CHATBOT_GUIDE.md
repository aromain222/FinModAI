# AI Investment Advisor Chatbot Guide

## Overview

The AI Investment Advisor Chatbot provides intelligent, real-time investment advice, financial concept explanations, company analysis, and model interpretation using Claude 4 and Polygon.io real-time market data.

## Features

### 1. **Investment Advice**
Ask any investment-related question and get intelligent, data-driven answers.

**Examples:**
- "Which tech companies are performing well?"
- "Should I invest in TSLA?"
- "What's the outlook for the EV market?"
- "Which sectors are trending?"

### 2. **Financial Concept Explanations**
Get clear, simple explanations of financial terms and concepts.

**Examples:**
- "What is CapEx?"
- "What does EBITDA mean?"
- "Explain free cash flow"
- "What is the P/E ratio?"
- "What is net debt?"

### 3. **Company Performance Analysis**
Get comprehensive analysis of any company's performance.

**Examples:**
- Analyze AAPL
- How is TSLA performing?
- Compare MSFT vs GOOGL

### 4. **Model Interpretation**
Understand what your financial model outputs mean.

**Examples:**
- "What does this DCF model mean?"
- "Is this EV/EBITDA ratio good?"
- "Explain this IRR calculation"

### 5. **Market Insights**
Get current market trends and insights.

**Examples:**
- "What are current market trends?"
- "Which sectors are hot?"
- "What's driving the market?"

## API Endpoints

### 1. Ask Investment Question

```bash
POST /api/v1/ai-chatbot/ask
Content-Type: application/json

{
  "question": "Which tech companies are performing well?",
  "type": "investment"
}
```

**Response:**
```json
{
  "success": true,
  "response": "Based on current market data...",
  "type": "investment",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### 2. Explain Financial Concept

```bash
POST /api/v1/ai-chatbot/explain
Content-Type: application/json

{
  "concept": "CapEx"
}
```

**Response:**
```json
{
  "success": true,
  "response": "CapEx (Capital Expenditures) refers to...",
  "concept": "CapEx"
}
```

### 3. Analyze Company

```bash
GET /api/v1/ai-chatbot/analyze/AAPL
```

**Response:**
```json
{
  "success": true,
  "response": "AAPL is currently trading at...",
  "ticker": "AAPL"
}
```

### 4. Interpret Model

```bash
POST /api/v1/ai-chatbot/interpret
Content-Type: application/json

{
  "model_type": "DCF",
  "output_data": {
    "ev": 1000000,
    "equity_value": 800000,
    "implied_price": 150
  }
}
```

**Response:**
```json
{
  "success": true,
  "response": "This DCF model shows...",
  "model_type": "DCF"
}
```

### 5. Market Insights

```bash
GET /api/v1/ai-chatbot/market-insights
```

**Response:**
```json
{
  "success": true,
  "response": "Current market conditions show...",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### 6. Health Check

```bash
GET /api/v1/ai-chatbot/health
```

**Response:**
```json
{
  "status": "healthy",
  "polygon_configured": true,
  "anthropic_configured": true,
  "service": "AI Investment Advisor Chatbot",
  "model": "claude-4-sonnet-20250514"
}
```

## Usage Examples

### Example 1: Ask Investment Question

```python
import requests

response = requests.post(
    'http://localhost:5000/api/v1/ai-chatbot/ask',
    json={
        'question': 'Which tech companies are performing well?',
        'type': 'investment'
    }
)

print(response.json()['response'])
```

### Example 2: Explain Financial Concept

```python
response = requests.post(
    'http://localhost:5000/api/v1/ai-chatbot/explain',
    json={'concept': 'CapEx'}
)

print(response.json()['response'])
```

### Example 3: Analyze Company

```python
response = requests.get(
    'http://localhost:5000/api/v1/ai-chatbot/analyze/AAPL'
)

print(response.json()['response'])
```

### Example 4: Interpret Model

```python
response = requests.post(
    'http://localhost:5000/api/v1/ai-chatbot/interpret',
    json={
        'model_type': 'DCF',
        'output_data': {
            'ev': 1000000,
            'equity_value': 800000,
            'implied_price': 150
        }
    }
)

print(response.json()['response'])
```

### Example 5: Get Market Insights

```python
response = requests.get(
    'http://localhost:5000/api/v1/ai-chatbot/market-insights'
)

print(response.json()['response'])
```

## Integration with FinModAI

### Add to minimal_app.py

```python
from ai_chatbot_api import ai_chatbot_bp

# Register the blueprint
app.register_blueprint(ai_chatbot_bp)
```

### Use in Frontend

```javascript
// Ask investment question
const response = await fetch('/api/v1/ai-chatbot/ask', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    question: 'Which tech companies are performing well?',
    type: 'investment'
  })
});

const data = await response.json();
console.log(data.response);
```

## Cost

### Per Query Cost: $0.01-0.05

**Breakdown:**
- Polygon.io API: ~$0.01-0.02
- Claude 4 Sonnet: ~$0.01-0.03
- **Total: ~$0.02-0.05 per query**

### Monthly Estimates

| Usage | Daily Queries | Monthly Cost |
|-------|---------------|--------------|
| Light | 10 | $6-15 |
| Moderate | 50 | $30-75 |
| Heavy | 200 | $120-300 |

## Configuration

### Environment Variables

```bash
# AI Chatbot Settings
AI_CHATBOT_ENABLED=true
AI_CHATBOT_MODEL=claude-4-sonnet-20250514
AI_CHATBOT_MAX_TOKENS=4000
AI_CHATBOT_TEMPERATURE=0.7

# Provider Keys
POLYGON_API_KEY=REDACTED
ANTHROPIC_API_KEY=your_key_here
```

## Features

### ✅ What It Can Do

1. **Investment Advice**
   - Analyze market trends
   - Compare companies
   - Sector analysis
   - Risk assessment

2. **Financial Concepts**
   - Clear definitions
   - Real-world examples
   - Context and interpretation
   - Calculation methods

3. **Company Analysis**
   - Current performance
   - Financial metrics
   - Competitive position
   - Risk factors

4. **Model Interpretation**
   - Explain outputs
   - Context for metrics
   - Good/bad indicators
   - Further analysis

5. **Market Insights**
   - Current trends
   - Sector performance
   - Market drivers
   - Opportunities

### ❌ What It Cannot Do

1. **Not Financial Advice**
   - Always includes disclaimers
   - Not personalized advice
   - Not a substitute for professional advice

2. **No Trading Recommendations**
   - No buy/sell signals
   - No specific price targets
   - No timing recommendations

3. **No Guarantees**
   - Market predictions are uncertain
   - Past performance ≠ future results
   - Always do your own research

## Best Practices

### 1. Be Specific
```
❌ "What should I invest in?"
✅ "Which tech companies are performing well?"
```

### 2. Ask Follow-up Questions
```
1. "What is CapEx?"
2. "Is CapEx good for a growth company?"
3. "How does CapEx affect free cash flow?"
```

### 3. Use for Learning
```
- Understand financial concepts
- Learn about companies
- Get market context
- Interpret model results
```

### 4. Always Verify
```
- Cross-check with other sources
- Do your own research
- Consult professionals
- Understand the risks
```

## Examples

### Example 1: Understanding CapEx

**Question:** "What is CapEx?"

**Response:**
```
CapEx (Capital Expenditures) refers to money a company spends on 
long-term assets like equipment, buildings, or technology.

What it measures:
- Investment in future growth
- Maintenance of existing assets
- Strategic initiatives

How it's calculated:
CapEx = New PP&E - Old PP&E + Depreciation

What's good/bad:
- High CapEx: Growth investment (good for growth companies)
- Low CapEx: Cash preservation (good for mature companies)
- Negative CapEx: Asset sales (context-dependent)

Example:
Tesla spent $8B on CapEx in 2023 to build new factories.

Why it matters:
- Affects free cash flow
- Indicates growth plans
- Shows capital discipline
```

### Example 2: Company Analysis

**Question:** "Analyze AAPL"

**Response:**
```
AAPL (Apple Inc.) Analysis

Current Performance:
- Price: $249.75
- Market Cap: $800B
- 1Y Return: +35%

Financial Metrics:
- Revenue: $383B (TTM)
- EBITDA: $123B
- Free Cash Flow: $96B
- P/E Ratio: 28x

Strengths:
- Strong brand and ecosystem
- High cash generation
- Diversified revenue streams
- Innovation leadership

Weaknesses:
- Dependence on iPhone
- Regulatory risks
- High valuation

Investment Outlook:
- Stable growth expected
- Services revenue growing
- Strong cash position
- Moderate risk

Disclaimer: This is not financial advice.
```

## Troubleshooting

### Issue: "POLYGON_API_KEY not configured"

**Solution:**
```bash
export POLYGON_API_KEY=REDACTED
```

### Issue: "ANTHROPIC_API_KEY not configured"

**Solution:**
```bash
export ANTHROPIC_API_KEY=your_key_here
```

### Issue: Slow responses

**Solution:**
- Check API rate limits
- Reduce query complexity
- Use caching

## Support

For issues or questions:
- Check API documentation
- Review examples
- Test with health endpoint
- Check API keys

---

**Ready to use the AI Investment Advisor?** 🚀

Start asking questions and get intelligent, data-driven answers!

