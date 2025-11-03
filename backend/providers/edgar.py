"""
EDGAR Company-Facts data + filings provider
"""
import os
import requests
from typing import Dict, Any, Optional, List
from backend.providers.exchanges import get_directory

SEC_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
SEC_FILINGS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"

MAX_RETRIES = 2
TIMEOUT = 12

# Must be set:   export SEC_UA_EMAIL=alice@example.com
SEC_USER_AGENT = f"EDGARDataBot; {os.environ.get('SEC_UA_EMAIL','no-reply@example.com')}"

class EdgarProvider:
    def __init__(self):
        self.dir = get_directory()

    def _resolve_cik(self, ticker_or_cik: str) -> str:
        info = self.dir.resolve(ticker_or_cik)
        if info and info.get("cik"):
            return info["cik"].zfill(10)
        # fallback: assume already CIK
        s = ticker_or_cik.strip()
        if s.isdigit() and len(s) <= 10:
            return s.zfill(10)
        raise ValueError(f"Could not resolve CIK for {ticker_or_cik}")

    def get_company_facts(self, identifier: str) -> Dict[str,Any]:
        cik = self._resolve_cik(identifier)
        url = SEC_FACTS_URL.format(cik=cik)
        for try_num in range(MAX_RETRIES+1):
            try:
                r = requests.get(url, headers={"User-Agent": SEC_USER_AGENT, "Accept":"application/json"}, timeout=TIMEOUT)
                if r.status_code == 429:
                    raise RuntimeError(f"EDGAR throttling (code 429)")
                r.raise_for_status()
                return r.json()
            except Exception as e:
                if try_num == MAX_RETRIES:
                    raise

    def parse_fundamentals(self, facts: Dict[str,Any]) -> Dict[str,Any]:
        # Only support USD as base currency (for now)
        currency = facts.get("facts",{}).get("us-gaap:Revenues",{}).get("units",{}).keys()
        currency = next((cur for cur in currency if cur.upper() == "USD"), None)
        if not currency:
            raise ValueError("No USD facts available (currency fallback not yet implemented)")
        # Preferred concept keys for each field (documented):
        concept_map = {
            "revenue":        ["us-gaap:Revenues","us-gaap:SalesRevenueNet"],
            "ebit":           ["us-gaap:OperatingIncomeLoss"],
            "ebitda":         ["us-gaap:EarningsBeforeInterestAndTaxes","us-gaap:EarningsBeforeInterestTaxesDepreciationAndAmortization"],
            "net_income":     ["us-gaap:NetIncomeLoss"],
            "cash":           ["us-gaap:CashAndCashEquivalentsAtCarryingValue"],
            "debt":           ["us-gaap:LongTermDebtNoncurrent","us-gaap:LongTermDebtCurrent"],
            "capex":          ["us-gaap:CapitalExpenditures"],
            "depreciation_amortization": ["us-gaap:DepreciationAndAmortization"],
            "shares_outstanding": ["us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding","us-gaap:WeightedAverageNumberOfSharesOutstandingBasic"],
        }
        parsed = {f: [] for f in concept_map}
        provenance = {}
        for field, concepts in concept_map.items():
            found = False
            for concept in concepts:
                obj = facts.get("facts",{}).get(concept, {})
                units = obj.get("units", {})
                if currency in units:
                    # Get (date, value) series, prefer annual 10-K, most recent first
                    vals = [v for v in units[currency] if v.get("form") in ("10-K", "10-Q", None)]
                    vals.sort(key=lambda v: v.get("end", ""), reverse=True)
                    vals = vals[:5]  # first 5 most recent
                    parsed[field] += [float(v["val"]) for v in vals if v["val"] is not None]
                    for v in vals:
                        key = f"{field}:{v.get('end','n/a')}"
                        provenance[key] = {"provider": "EDGAR", "concept": concept, "as_of": v.get('end','n/a'), "source_url": SEC_FACTS_URL.format(cik=facts["cik"])}
                    found = True
                    break
            if not found:
                parsed[field] = []
        # If missing critical fields, error
        if not parsed["revenue"] or not parsed["ebit"] or not parsed["net_income"]:
            raise RuntimeError(f"Missing core fundamentals: revenue={len(parsed['revenue'])}, ebit={len(parsed['ebit'])}, net_income={len(parsed['net_income'])}")
        parsed["provenance"] = provenance
        return parsed

    def get_latest_filings(self, identifier: str) -> List[Dict[str,str]]:
        cik = self._resolve_cik(identifier)
        url = SEC_FILINGS_URL.format(cik=cik)
        r = requests.get(url, headers={"User-Agent": SEC_USER_AGENT, "Accept":"application/json"}, timeout=TIMEOUT)
        r.raise_for_status()
        data = r.json()
        filings = []
        for ftype in ("10-K","10-Q"):
            forms = data.get("filings",{}).get("recent", {})
            for idx, form in enumerate(forms.get("form",[])):
                if form != ftype:
                    continue
                filings.append({
                    "type": ftype,
                    "date": forms["filingDate"][idx],
                    "url": forms["primaryDocument"][idx] if idx < len(forms["primaryDocument"]) else None
                })
        return filings

def get_provider():
    return EdgarProvider()
