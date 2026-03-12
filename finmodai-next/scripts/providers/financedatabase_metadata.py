#!/usr/bin/env python3
import json
import sys

try:
    import financedatabase as fd
except Exception:
    print("null")
    sys.exit(0)


def pick_first(row, candidates):
    for candidate in candidates:
        if candidate in row and row[candidate] not in (None, "", "nan"):
            return row[candidate]
    return None


def main():
    if len(sys.argv) < 2:
        print("null")
        return

    ticker = sys.argv[1].strip().upper()
    if not ticker:
        print("null")
        return

    try:
        equities = fd.Equities()
        matches = equities.search(index=f"^{ticker}$", exclude_exchanges=False, case_sensitive=True)
        if matches.empty:
          matches = equities.search(index=ticker, exclude_exchanges=False, case_sensitive=False)
        if matches.empty:
            print("null")
            return

        exact = matches.loc[matches.index == ticker]
        row = (exact.iloc[0] if not exact.empty else matches.iloc[0]).to_dict()
        payload = {
            "ticker": ticker,
            "companyName": pick_first(row, ["name", "company_name"]),
            "sector": pick_first(row, ["sector"]),
            "industry": pick_first(row, ["industry"]),
            "country": pick_first(row, ["country"]),
            "exchange": pick_first(row, ["exchange", "market"]),
            "currency": pick_first(row, ["currency"]),
        }
        print(json.dumps(payload))
    except Exception:
        print("null")


if __name__ == "__main__":
    main()
