"""
Admin CLI for managing the data quarantine and other data operations.

Usage:
    python scripts/admin_cli.py list
    python scripts/admin_cli.py clear <TICKER> "Reason for clearing"
    python scripts/admin_cli.py refresh <TICKER>
"""
import sys
import os

# Add backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.market import quarantine
from backend.market.data_router import get_router

def print_usage():
    print("Usage:")
    print("  python scripts/admin_cli.py list")
    print("  python scripts/admin_cli.py clear <TICKER> \"<Note>\"")
    print("  python scripts/admin_cli.py refresh <TICKER>")

def list_quarantined_items():
    print("\n---  quarantined tickers ---")
    items = quarantine.list_quarantined()
    if not items:
        print("No items currently in quarantine.")
        return
    
    for item in items:
        print(f"- {item['ticker']}: {item['reason']} (since {item['first_seen']})")

def clear_item(ticker, note):
    print(f"Clearing {ticker} from quarantine...")
    if quarantine.clear_quarantine(ticker, note):
        print(f"✅ {ticker} has been cleared.")
    else:
        print(f"❌ Failed to clear {ticker}.")

def refresh_data(ticker):
    print(f"Forcing data refresh for {ticker}...")
    router = get_router()
    bundle, status = router.get_bundle(ticker, force_refresh=True)
    
    if status == 200 and not bundle.get('quarantined'):
        print(f"✅ Data for {ticker} refreshed and is clean.")
    elif bundle.get('quarantined'):
        print(f"⚠️ {ticker} was refreshed but is now in quarantine: {bundle.get('quarantine_reasons')}")
    else:
        print(f"❌ Failed to refresh data for {ticker}. Status: {status}")
        print(f"   Error: {bundle.get('error')}")
        print(f"   Missing: {bundle.get('missing_fields')}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print_usage()
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == 'list':
        list_quarantined_items()
    elif command == 'clear':
        if len(sys.argv) < 4:
            print("Usage: python scripts/admin_cli.py clear <TICKER> \"<Note>\"")
            sys.exit(1)
        clear_item(sys.argv[2].upper(), sys.argv[3])
    elif command == 'refresh':
        if len(sys.argv) < 3:
            print("Usage: python scripts/admin_cli.py refresh <TICKER>")
            sys.exit(1)
        refresh_data(sys.argv[2].upper())
    else:
        print(f"Unknown command: {command}")
        print_usage()
