"""
Diagnostic script to test all financial data providers.

Usage:
    python scripts/diagnose_data.py <TICKER>
"""
import os
import sys
import time
import importlib
from typing import List, Dict, Any

# Add backend to path to allow provider imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.providers.base_provider import BaseProvider

# --- Configuration ---
# List of provider modules to be tested.
# This assumes each module has a `get_provider()` function.
PROVIDER_MODULES = [
    "backend.providers.edgar_provider",
    "backend.providers.yahoo_provider",
    "backend.providers.alpha_vantage_provider",
    "backend.providers.finnhub_provider",
    "backend.providers.tiingo_provider",
    "backend.providers.polygon_provider",
    "backend.providers.fmp_provider",
]

# --- Helper Functions ---
def print_table(headers: List[str], data: List[Dict[str, Any]]):
    """Prints a formatted table to the console."""
    # Find max width for each column
    widths = {h: len(h) for h in headers}
    for row in data:
        for h in headers:
            widths[h] = max(widths[h], len(str(row.get(h, ''))))

    # Print header
    header_str = " | ".join(h.ljust(widths[h]) for h in headers)
    print(header_str)
    print("-" * len(header_str))

    # Print rows
    for row in data:
        row_str = " | ".join(str(row.get(h, '')).ljust(widths[h]) for h in headers)
        print(row_str)

def load_provider(module_name: str) -> Any:
    """Dynamically imports and returns a provider instance."""
    try:
        module = importlib.import_module(module_name)
        if hasattr(module, 'get_provider'):
            return module.get_provider()
        print(f"⚠️  {module_name} does not have a get_provider() function.")
        return None
    except ImportError:
        print(f" NOTICE: Could not import {module_name}. Skipping.")
        # Create a dummy file so this doesn't repeatedly fail if not implemented
        parts = module_name.split('.')
        path = os.path.join(*parts) + ".py"
        if not os.path.exists(path):
            with open(path, 'w') as f:
                f.write('"""Provider not yet implemented."""\n')
                f.write('def get_provider(): return None\n')
        return None
    except Exception as e:
        print(f"❌ Error loading {module_name}: {e}")
        return None

# --- Main Diagnostic Logic ---
def run_diagnostics(ticker: str):
    """
    Runs health checks and simple data fetches for all configured providers.
    """
    print(f"\n🔬 Running diagnostics for ticker: {ticker.upper()}")
    print("=" * 40)
    
    providers: List[BaseProvider] = [p for p in [load_provider(m) for m in PROVIDER_MODULES] if p is not None]
    
    if not providers:
        print("❌ No data providers could be loaded. Check your API keys and provider implementations.")
        return

    results = []
    all_failed = True

    for provider in providers:
        start_time = time.monotonic()
        row = {"Provider": provider.name, "Status": "❌ FAIL"}
        
        try:
            # 1. Health Check
            health = provider.health_check()
            row.update(health)

            if health.get("status") == "OK":
                # 2. Get Quote
                quote = provider.get_quote(ticker)
                if quote and quote.price > 0:
                    row["Quote"] = f"${quote.price:.2f} ({quote.as_of})"
                    row["Status"] = "✅ OK"
                    all_failed = False
                else:
                    row["Quote"] = "FAIL"
                
                # 3. Get Fundamentals (optional, can be slow)
                # fundamentals = provider.get_fundamentals(ticker)
                # if fundamentals and fundamentals.revenue:
                #     row["Fundamentals"] = "OK"
                # else:
                #     row["Fundamentals"] = "FAIL"
            
        except NotImplementedError:
            row["Status"] = "⚠️ NOT_IMPL"
        except Exception as e:
            error_msg = str(e).replace('\n', ' ')[:60]
            row["Error"] = f"{type(e).__name__}: {error_msg}..."
        
        row["TTFB (ms)"] = int((time.monotonic() - start_time) * 1000)
        results.append(row)

    print("\n--- DIAGNOSTIC RESULTS ---")
    headers = ["Provider", "Status", "Quote", "HTTP Status", "RateLimit-Remaining", "Error", "TTFB (ms)"]
    print_table(headers, results)
    
    print("\n--- SUMMARY ---")
    if all_failed:
        print("❌ Critical: All real-time data providers failed to fetch a quote.")
        print("   - Verify API keys in your .env file.")
        print("   - Check for network issues or provider outages.")
        sys.exit(1)
    else:
        print("✅ At least one provider is functioning correctly.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/diagnose_data.py <TICKER>")
        sys.exit(1)
    
    # Load .env file for local development
    try:
        from dotenv import load_dotenv
        load_dotenv()
        print("Loaded .env file.")
    except ImportError:
        print("dotenv not installed, skipping .env file load.")

    main_ticker = sys.argv[1]
    run_diagnostics(main_ticker)
