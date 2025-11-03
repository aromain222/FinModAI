"""
Core Comparable Company Analysis (Comps) Modeling Engine.
"""
import numpy as np
from dataclasses import dataclass
from typing import List, Dict, Any

@dataclass
class CompanyFinancials:
    """Represents the key financial metrics for a single company."""
    ticker: str
    market_cap: float
    enterprise_value: float
    revenue: float
    ebitda: float
    net_income: float

@dataclass
class CompsOutput:
    """Structured output for the full comps analysis."""
    target_financials: CompanyFinancials
    peer_financials: List[CompanyFinancials]
    peer_multiples: Dict[str, Dict[str, float]]
    valuation_summary: Dict[str, Dict[str, float]]

class CompsModel:
    """
    A class to perform a full comparable company analysis.
    """
    def __init__(self, target_financials: CompanyFinancials, peer_financials: List[CompanyFinancials]):
        if not peer_financials:
            raise ValueError("Peer financials list cannot be empty.")
        self.target = target_financials
        self.peers = peer_financials
        self.peer_multiples = {}
        self.valuation_summary = {}

    def _calculate_multiples(self) -> List[Dict[str, Any]]:
        """Calculate valuation multiples for each peer company."""
        calculated_multiples = []
        for peer in self.peers:
            multiples = {"ticker": peer.ticker}
            # EV/Revenue
            multiples["ev_revenue"] = peer.enterprise_value / peer.revenue if peer.revenue > 0 else 0
            # EV/EBITDA
            multiples["ev_ebitda"] = peer.enterprise_value / peer.ebitda if peer.ebitda > 0 else 0
            # P/E
            multiples["p_e"] = peer.market_cap / peer.net_income if peer.net_income > 0 else 0
            calculated_multiples.append(multiples)
        return calculated_multiples

    def _calculate_peer_statistics(self, multiples_list: List[Dict[str, Any]]):
        """Calculate the min, max, median, and average for each multiple."""
        stats = {}
        for key in ["ev_revenue", "ev_ebitda", "p_e"]:
            values = [m[key] for m in multiples_list if m[key] > 0] # Exclude non-positive multiples
            if not values:
                stats[key] = {"min": 0, "max": 0, "median": 0, "mean": 0}
                continue
            stats[key] = {
                "min": np.min(values),
                "max": np.max(values),
                "median": np.median(values),
                "mean": np.mean(values),
            }
        self.peer_multiples = stats

    def _calculate_implied_valuation(self):
        """Apply peer multiples to the target company to imply valuation."""
        summary = {}
        
        # EV from EBITDA
        median_ev_ebitda = self.peer_multiples.get("ev_ebitda", {}).get("median", 0)
        implied_ev_from_ebitda = self.target.ebitda * median_ev_ebitda
        implied_share_price_from_ebitda = (implied_ev_from_ebitda - (self.target.enterprise_value - self.target.market_cap)) / (self.target.market_cap / self.target.enterprise_value * 1000) if self.target.enterprise_value else 0 # simplified shares outstanding
        
        summary["from_ev_ebitda"] = {
            "implied_enterprise_value": implied_ev_from_ebitda,
            "implied_share_price": 0 # Placeholder for now
        }

        # Equity Value from P/E
        median_p_e = self.peer_multiples.get("p_e", {}).get("median", 0)
        implied_equity_value = self.target.net_income * median_p_e
        summary["from_p_e"] = {
            "implied_equity_value": implied_equity_value,
            "implied_share_price": 0 # Placeholder for now
        }

        self.valuation_summary = summary
    
    def run(self) -> CompsOutput:
        """Run all steps of the comps model."""
        multiples = self._calculate_multiples()
        self._calculate_peer_statistics(multiples)
        self._calculate_implied_valuation()
        
        return CompsOutput(
            target_financials=self.target,
            peer_financials=self.peers,
            peer_multiples=self.peer_multiples,
            valuation_summary=self.valuation_summary
        )

if __name__ == '__main__':
    # --- Example Usage ---
    target = CompanyFinancials("MSFT", 2.5e12, 2.4e12, 200e9, 90e9, 70e9)
    peers = [
        CompanyFinancials("GOOGL", 1.8e12, 1.7e12, 280e9, 85e9, 65e9),
        CompanyFinancials("ORCL", 300e9, 350e9, 50e9, 20e9, 10e9),
        CompanyFinancials("ADBE", 250e9, 245e9, 20e9, 8e9, 5e9),
    ]
    
    comps_model = CompsModel(target, peers)
    results = comps_model.run()

    import json
    print(json.dumps(results, indent=2, default=lambda o: o.__dict__))
