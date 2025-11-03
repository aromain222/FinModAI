"""
Nightly health check task for all data providers.

This script iterates through a watchlist of tickers, runs diagnostics,
and sends a Slack alert if any core provider fails.
"""
import sys
import os
from datetime import datetime

# Add root project dir to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from scripts.diagnose_data import run_diagnostics
from backend.alerts.slack import send_alert

WATCHLIST = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "JPM", "XOM"]

def run_nightly_health_check():
    """
    Runs diagnostic checks for a watchlist of tickers and sends alerts on failure.
    """
    print(f"--- Starting Nightly Health Check: {datetime.utcnow().isoformat()}Z ---")
    
    # In a real environment, we'd capture stdout to parse results.
    # For now, we rely on the exit code from run_diagnostics.
    failed_tickers = []
    
    for ticker in WATCHLIST:
        try:
            print(f"\n--- Checking {ticker} ---")
            # The script will sys.exit(1) if all providers fail
            run_diagnostics(ticker)
        except SystemExit as e:
            if e.code == 1:
                failed_tickers.append(ticker)
        except Exception as e:
            print(f"❌ An unexpected error occurred for {ticker}: {e}")
            failed_tickers.append(ticker)

    print("\n--- Health Check Summary ---")
    if failed_tickers:
        print(f"❌ Health check failed for {len(failed_tickers)} tickers: {', '.join(failed_tickers)}")
        
        # Send Slack Alert
        message = (
            f":warning: *Nightly Data Health Check FAILED* :warning:\n"
            f"Failed to fetch complete data for the following tickers: `{', '.join(failed_tickers)}`\n"
            f"Please check provider statuses and API keys."
        )
        send_alert(message)
    else:
        print("✅ All watchlist tickers passed health checks.")
        # Optionally send a success message
        # send_alert(":white_check_mark: Nightly Data Health Check Successful")

if __name__ == "__main__":
    # Ensure SLACK_WEBHOOK_URL is set if you want alerts
    if not os.environ.get("SLACK_WEBHOOK_URL"):
        print("⚠️  SLACK_WEBHOOK_URL is not set. Alerts will be disabled.")

    run_nightly_health_check()
