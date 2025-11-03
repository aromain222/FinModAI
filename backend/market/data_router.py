"""
Hierarchy/quorum data router: fetches and integrates financial data from trusted sources with provenance.
"""
from typing import Dict, Any, List
from backend.providers.edgar import get_provider as get_edgar
from backend.providers.yahoo_public import get_provider as get_yahoo
from backend.providers.exchanges import get_directory
from backend.providers.base_provider import Quote, Fundamentals
from backend.market import quarantine
from backend.alerts.slack import send_alert
from datetime import datetime

tolerance_by_field = {"revenue":0.01,"shares_outstanding":0.02,"net_income":0.03}  # can be expanded
CRITICALS = ["revenue","ebit","net_income","shares_outstanding"]

class DataRouter:
    def __init__(self):
        self.edgar = get_edgar()
        self.yahoo = get_yahoo()
        self.exchange = get_directory()

    def get_bundle(self, identifier: str, force_refresh=False) -> Dict[str, Any]:
        proven = {}
        bundle = {"as_of_system": datetime.utcnow().isoformat() + "Z", "fields": {}, "provenance": {}}
        ticker = identifier.upper()
        # 1. Direct CIK lookup
        idinfo = self.exchange.resolve(identifier)
        obsv_ticker = (idinfo or {}).get("ticker", ticker)
        cik = (idinfo or {}).get("cik", None)
        name = (idinfo or {}).get("name", None)
        errors = {}
        # --- Fundamentals --- #
        try:
            facts = self.edgar.get_company_facts(obsv_ticker)
            famap = self.edgar.parse_fundamentals(facts)
            for f, vals in famap.items():
                if f=="provenance": continue
                bundle["fields"][f] = vals
            bundle["provenance"] |= famap.get("provenance",{})
            bundle["primary_source"] = "EDGAR"
        except Exception as e:
            errors["EDGAR"] = str(e)
        # --- Market Data (Price / EV / MCAP from Yahoo) --- #
        try:
            quote = self.yahoo.get_quote(obsv_ticker)
            bundle["fields"]["price"] = quote.price
            bundle["fields"]["market_cap"] = quote.market_cap
            bundle["fields"]["enterprise_value"] = quote.enterprise_value
            bundle["fields"]["currency"] = quote.currency
            bundle["provenance"]["price"] = quote.provenance
        except Exception as e:
            errors["Yahoo"] = str(e)
        # --- Quorum & Field Quality--- #
        for field in CRITICALS:
            if field not in bundle["fields"] or not bundle["fields"][field]:
                errors[field] = f"Missing from both primary and fallback."
        # --- Output or Block --- #
        if any((not bundle["fields"].get(f)) for f in CRITICALS):
            bundle["error"] = "Missing critical field(s)"
            bundle["missing_fields"] = [f for f in CRITICALS if not bundle["fields"].get(f)]
            bundle["errors"] = errors
            bundle["quarantined"] = False
            return bundle, 409
        # --- Quarantine ---
        bundle = quarantine.check_and_flag(bundle)
        if bundle.get("quarantined", False):
            send_alert(f":rotating_light: QUARANTINE: {obsv_ticker} flagged: " + ", ".join(bundle.get("quarantine_reasons", [])))
        # (in a full system, would insert quorum/gapfill logic here)
        bundle["errors"] = errors
        return bundle, 200

def get_router():
    return DataRouter()
