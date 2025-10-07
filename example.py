"""
Example usage of the assumptions engine.
"""

import json
from assumptions_engine import build_company_assumptions

def main():
    """Run example."""
    print("Building assumptions for Microsoft (MSFT)...")
    msft_assumptions = build_company_assumptions("MSFT")
    
    if "error" in msft_assumptions:
        print(f"Error: {msft_assumptions['message']}")
    else:
        print("\nAssumptions Summary:")
        print(msft_assumptions["summary"])
        
        print("\nDetailed Assumptions:")
        print(json.dumps(msft_assumptions, indent=2))
    
    print("\nBuilding assumptions for Apple (AAPL)...")
    aapl_assumptions = build_company_assumptions("AAPL")
    
    if "error" in aapl_assumptions:
        print(f"Error: {aapl_assumptions['message']}")
    else:
        print("\nAssumptions Summary:")
        print(aapl_assumptions["summary"])
    
    print("\nBuilding assumptions for Tesla (TSLA)...")
    tsla_assumptions = build_company_assumptions("TSLA")
    
    if "error" in tsla_assumptions:
        print(f"Error: {tsla_assumptions['message']}")
    else:
        print("\nAssumptions Summary:")
        print(tsla_assumptions["summary"])

if __name__ == "__main__":
    main()
