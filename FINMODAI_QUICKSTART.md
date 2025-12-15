# 🚀 FINMODAI Quick Start Guide

## ⚡ 3-Minute Setup

### Step 1: Install Dependencies (30 seconds)

```bash
pip3 install pandas numpy tabulate fastapi uvicorn flask pydantic
```

Or use the requirements file:

```bash
pip3 install -r requirements_finmodai.txt
```

### Step 2: Test Installation (30 seconds)

```bash
python3 test_finmodai.py
```

You should see:
```
🎉 All tests passed!
✨ FINMODAI is ready to use!
```

### Step 3: Start Using FINMODAI (2 minutes)

Choose your preferred method:

#### **Option A: Interactive Menu (Easiest)**

```bash
./start_finmodai.sh
```

This gives you a beautiful menu with all options.

#### **Option B: Web Interface (Most Visual)**

```bash
python3 finmodai_web.py
```

Then open: `http://localhost:5001`

#### **Option C: Interactive Terminal (Fastest)**

```bash
python3 finmodai_examples.py --interactive
```

Type your questions directly in the terminal.

#### **Option D: Python Code (Most Flexible)**

```python
from finmodai_engine import quick_analysis

report = quick_analysis(
    "What is the DCF valuation of Apple?",
    ticker="AAPL"
)

print(report.to_markdown())
```

---

## 💡 Example Queries to Try

Copy and paste any of these:

### Valuation
```
What is the DCF valuation of Apple Inc?
```

### Forecasting
```
Provide a 5-year revenue forecast for Microsoft with base, bull, and bear cases
```

### Comparison
```
Compare Apple vs Microsoft valuation multiples and operating metrics
```

### Risk Assessment
```
What are the key risks of investing in Nvidia?
```

### M&A
```
Analyze Salesforce as a potential acquisition target
```

---

## 📊 What You Get

Every query generates a **complete 4-phase report**:

### ✅ PHASE 1: Narrative Analysis
- Professional, investment-banking-grade analysis
- 1,000-2,000 words
- Clear, confident, fact-driven

### ✅ PHASE 2: Quantitative Output
- 2-5 financial tables
- DCF models, forecasts, comparisons
- Real numbers (not generic)

### ✅ PHASE 3: Assumptions
- 8-12 detailed assumptions
- Each with justification
- Transparent methodology

### ✅ PHASE 4: Sources
- 5-10 cited sources
- Data sources documented
- Methodology notes

---

## 🎯 Common Use Cases

### 1. Quick Valuation
```bash
python3 finmodai_examples.py --query "DCF valuation of Tesla" --ticker TSLA
```

### 2. Multiple Companies
```bash
python3 finmodai_examples.py --example 9  # Batch analysis
```

### 3. Custom Analysis
```python
from finmodai_engine import FINMODAIEngine
from finmodai_data_provider import FINMODAIDataProvider

provider = FINMODAIDataProvider()
engine = FINMODAIEngine(data_provider=provider)

report = engine.analyze(
    "Your custom question here",
    context={"ticker": "AAPL"}
)

# Save in all formats
engine.save_report(report)
```

---

## 📁 Output Files

Reports are automatically saved to `finmodai_reports/`:

- **Markdown** (`.md`) - Clean, readable text
- **HTML** (`.html`) - Beautiful, styled reports
- **JSON** (`.json`) - Structured data

Example filename:
```
finmodai_What_is_the_DCF_valuation_of_Apple__20241125_150000.md
```

---

## 🔧 Troubleshooting

### "Module not found" error

```bash
pip3 install pandas numpy tabulate fastapi uvicorn flask pydantic
```

### "Permission denied" on start_finmodai.sh

```bash
chmod +x start_finmodai.sh
```

### Reports not generating

Check that `finmodai_reports/` directory exists:
```bash
mkdir -p finmodai_reports
```

---

## 🎓 Advanced Features

### Using Real Data

FINMODAI automatically integrates with your existing data providers:

```python
from finmodai_data_provider import FINMODAIDataProvider
from finmodai_engine import FINMODAIEngine

# Auto-detects: ProviderManager, DataFetcher, etc.
provider = FINMODAIDataProvider()
engine = FINMODAIEngine(data_provider=provider)

# Will use real data if available, estimates otherwise
report = engine.analyze("DCF of AAPL", context={"ticker": "AAPL"})
```

### REST API

```bash
python3 finmodai_api.py
```

Then use curl or any HTTP client:

```bash
curl -X POST http://localhost:8001/analyze \
  -H "Content-Type: application/json" \
  -d '{"query": "DCF valuation of Apple", "ticker": "AAPL"}'
```

API docs: `http://localhost:8001/docs`

### Batch Processing

```python
queries = [
    ("DCF valuation of Amazon", "AMZN"),
    ("Risk assessment for Meta", "META"),
    ("Forecast Google revenue", "GOOGL"),
]

for query, ticker in queries:
    report = engine.analyze(query, context={"ticker": ticker})
    engine.save_report(report)
```

---

## 📖 Full Documentation

For complete documentation, see:
```bash
cat FINMODAI_README.md
```

Or in the web interface: `http://localhost:5001`

---

## 🎉 You're Ready!

Start with the interactive demo:

```bash
./start_finmodai.sh
```

Or jump right in:

```bash
python3 finmodai_examples.py --interactive
```

**Ask any financial question and get elite-grade analysis!**

---

## 💬 Example Session

```
$ python3 finmodai_examples.py --interactive

🚀 FINMODAI - INTERACTIVE DEMO

💬 Your question: What is the DCF valuation of Apple?
🎯 Ticker: AAPL

⏳ Generating analysis...

# FINMODAI Analysis Report

**Query:** What is the DCF valuation of Apple?
**Generated:** 2024-11-25 15:00:00
**Confidence Level:** High

---

## PHASE 1 — NARRATIVE ANALYSIS

Apple Inc presents a compelling valuation opportunity...
[Full narrative analysis]

---

## PHASE 2 — QUANTITATIVE OUTPUT

### DCF Valuation Model
[Complete DCF table with 5-year projections]

### Valuation Summary
[Enterprise value, equity value, price per share]

### Sensitivity Analysis
[WACC and growth rate sensitivity]

---

## PHASE 3 — ASSUMPTIONS

**Base Revenue:** 1000.0 $M
- Justification: Current annual revenue...

[All assumptions listed]

---

## PHASE 4 — SOURCES & NOTES

1. Company SEC Filings (10-K, 10-Q)
2. Bloomberg Terminal / FactSet
[All sources listed]

✅ Report saved to: finmodai_reports/...
```

---

## 🚀 Next Steps

1. ✅ Try the interactive demo
2. ✅ Run example queries
3. ✅ Generate your first report
4. ✅ Explore the web interface
5. ✅ Integrate with your workflow

**Welcome to elite-grade financial analysis!** 🎉

