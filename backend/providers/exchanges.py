"""
Ticker <-> CIK <-> Name mapping using Nasdaq and NYSE official directories.
Fetches, parses, and caches daily for 24h staleness.
"""
import os, csv, json, requests, time
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

CACHE_PATH = "var/exchange_directory.json"
CACHE_TTL_HOURS = 24

NASDAQ_URL = "https://ftp.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
NYSE_URL =   "https://ftp.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"

class ExchangeDirectory:
    def __init__(self, cache_path=None) -> None:
        self.cache_path = cache_path or CACHE_PATH
        self.data, self.as_of = self._load_or_refresh()

    def _load_or_refresh(self):
        # Check cache
        if os.path.exists(self.cache_path):
            with open(self.cache_path) as f:
                obj = json.load(f)
                as_of = datetime.fromisoformat(obj["as_of"])
                if datetime.now() - as_of < timedelta(hours=CACHE_TTL_HOURS):
                    return obj["mapping"], obj["as_of"]
        # Stale or missing -> fetch
        return self.refresh()

    def refresh(self):
        all_rows = []
        # Nasdaq
        try:
            resp = requests.get(NASDAQ_URL, timeout=12)
            resp.raise_for_status()
            reader = csv.DictReader(resp.text.splitlines(), delimiter='|')
            all_rows.extend(row for row in reader if 'Symbol' in row)
        except Exception as e:
            print(f"NASDAQ fetch failed: {e}")
        # NYSE/Arca/AMEX
        try:
            resp = requests.get(NYSE_URL, timeout=12)
            resp.raise_for_status()
            reader = csv.DictReader(resp.text.splitlines(), delimiter='|')
            all_rows.extend(row for row in reader if 'ACT Symbol' in row)
        except Exception as e:
            print(f"NYSE fetch failed: {e}")
        mapping = {}
        for row in all_rows:
            t = row.get('Symbol') or row.get('ACT Symbol')
            if not t: continue
            t = t.strip().upper()
            cik = row.get('cik', '').zfill(10) if 'cik' in row else row.get('CIK', '').zfill(10)
            name = row.get('Security Name') or row.get('Company Name', '')
            exch = row.get('Exchange', '')
            mapping[t] = {"ticker": t, "cik": cik, "name": name, "exchange": exch, "as_of": datetime.now().isoformat()}
        # Save to cache
        with open(self.cache_path, 'w') as f:
            json.dump({"as_of": datetime.now().isoformat(), "mapping": mapping}, f)
        return mapping, datetime.now().isoformat()

    def resolve(self, identifier: str) -> Optional[Dict[str,Any]]:
        i = identifier.strip().upper()
        if i in self.data:
            return self.data[i]
        # Fallback: try CIK match
        for d in self.data.values():
            if d.get('cik', '') == i: return d
        # Fuzzy name match as last resort
        for d in self.data.values():
            if i in d.get('name', '').upper(): return d
        return None

def get_directory():
    return ExchangeDirectory()
