import os, json
from datetime import datetime
from typing import Dict, Any, List

QUARANTINE_PATH = "var/quarantine.json"
THRESHOLDS = {
    "shares_outstanding": 0.10,   # >10% change triggers
    "revenue": 0.30,              # >30% change triggers
    "market_cap": 0.15,
}

try:
    os.makedirs("var", exist_ok=True)
except Exception:
    pass

# --- Quarantine state ---
def _load_q():
    if not os.path.exists(QUARANTINE_PATH):
        return {}
    with open(QUARANTINE_PATH) as f:
        return json.load(f)
def _save_q(q):
    with open(QUARANTINE_PATH,"w") as f: json.dump(q,f,indent=2)

def check_and_flag(bundle: Dict[str,Any]) -> Dict[str,Any]:
    """
    Checks if bundle has outliers and quarantines if so. Past state is retained in var/quarantine.json
    """
    quarantine = _load_q()
    ticker = bundle.get("fields",{}).get("ticker") or bundle.get("ticker") or "?"
    now = datetime.utcnow().isoformat()+"Z"
    tripped = []
    last = quarantine.get(ticker, {})
    # Compare to past values
    if last and last.get("fields"):
        for f, thresh in THRESHOLDS.items():
            prev = last["fields"].get(f)
            cur = bundle["fields"].get(f)
            if prev and cur:
                try:
                    delta = abs(cur-prev)/max(1e-6,prev)
                    if delta >= thresh and not (abs(cur)<1 or abs(prev)<1):
                        tripped.append(f"{f} changed {100*delta:.2f}% (prev: {prev}, now: {cur})")
                except Exception:
                    pass
    # Quarantine on any trip
    if tripped:
        quarantine[ticker] = {"state":"open","reason":tripped,"fields":bundle["fields"],"first_seen":now,"last_seen":now}
        _save_q(quarantine)
        bundle["quarantined"] = True
        bundle["quarantine_reasons"] = tripped
    else:
        # update last seen bundle
        quarantine[ticker] = {"state":"cleared","reason":[],"fields":bundle["fields"],"first_seen":last.get("first_seen",now),"last_seen":now}
        _save_q(quarantine)
        bundle["quarantined"] = False
        bundle["quarantine_reasons"] = []
    return bundle

def list_quarantined() -> List[Dict[str,Any]]:
    q = _load_q()
    return [{"ticker":tick,"state":v["state"],"reason":v["reason"],"first_seen":v["first_seen"],"last_seen":v["last_seen"]} for tick,v in q.items() if v.get("state")=="open"]

def clear_quarantine(ticker:str, note: str=""):
    q = _load_q()
    if ticker in q:
        q[ticker]["state"] = "cleared"
        q[ticker]["reason"].append(f"Manual clear: {note}")
        q[ticker]["last_seen"] = datetime.utcnow().isoformat()+"Z"
        _save_q(q)
    return True
