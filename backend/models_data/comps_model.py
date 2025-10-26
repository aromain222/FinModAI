"""
Trading Comparables Model Implementation
Handles peer analysis, multiple calculation, and implied valuation
"""

from typing import Dict, List, Optional, Tuple
import pandas as pd
import numpy as np
from datetime import datetime
import logging
from dataclasses import dataclass
from decimal import Decimal

logger = logging.getLogger(__name__)

@dataclass
class CompanyMetrics:
    """Core company financial and market metrics"""
    ticker: str
    name: str
    share_price: float
    shares_outstanding: int
    total_debt: float
    cash: float
    minority_interest: float = 0
    preferred_stock: float = 0
    investments: float = 0
    
    # Operating metrics
    revenue_ltm: float
    revenue_ntm: Optional[float]
    ebitda_ltm: float
    ebitda_ntm: Optional[float]
    ebit_ltm: float
    ebit_ntm: Optional[float]
    net_income_ltm: float
    net_income_ntm: Optional[float]
    eps_ltm: float
    eps_ntm: Optional[float]
    book_value: float
    
    # Growth and margins
    revenue_growth: Optional[float] = None
    ebitda_margin: Optional[float] = None
    ebit_margin: Optional[float] = None
    
    @property
    def market_cap(self) -> float:
        """Calculate market capitalization"""
        return self.share_price * self.shares_outstanding
    
    @property
    def enterprise_value(self) -> float:
        """Calculate enterprise value"""
        return (
            self.market_cap +
            self.total_debt -
            self.cash +
            self.minority_interest +
            self.preferred_stock -
            self.investments
        )
    
    @property
    def net_debt(self) -> float:
        """Calculate net debt"""
        return self.total_debt - self.cash

    def calculate_multiples(self) -> Dict[str, float]:
        """Calculate all relevant valuation multiples"""
        try:
            return {
                # Enterprise Value multiples
                "ev_revenue_ltm": self.enterprise_value / self.revenue_ltm if self.revenue_ltm else None,
                "ev_revenue_ntm": self.enterprise_value / self.revenue_ntm if self.revenue_ntm else None,
                "ev_ebitda_ltm": self.enterprise_value / self.ebitda_ltm if self.ebitda_ltm else None,
                "ev_ebitda_ntm": self.enterprise_value / self.ebitda_ntm if self.ebitda_ntm else None,
                "ev_ebit_ltm": self.enterprise_value / self.ebit_ltm if self.ebit_ltm else None,
                "ev_ebit_ntm": self.enterprise_value / self.ebit_ntm if self.ebit_ntm else None,
                
                # Equity multiples
                "pe_ltm": self.share_price / self.eps_ltm if self.eps_ltm else None,
                "pe_ntm": self.share_price / self.eps_ntm if self.eps_ntm else None,
                "p_bv": self.market_cap / self.book_value if self.book_value else None,
                
                # Operating metrics
                "ebitda_margin": self.ebitda_ltm / self.revenue_ltm if self.revenue_ltm else None,
                "ebit_margin": self.ebit_ltm / self.revenue_ltm if self.revenue_ltm else None,
                "revenue_growth": ((self.revenue_ntm / self.revenue_ltm) - 1) if (self.revenue_ntm and self.revenue_ltm) else None
            }
        except ZeroDivisionError as e:
            logger.warning(f"Zero division error calculating multiples for {self.ticker}: {e}")
            return {}
        except Exception as e:
            logger.error(f"Error calculating multiples for {self.ticker}: {e}")
            return {}

class CompsModel:
    """Trading Comparables Model Implementation"""
    
    def __init__(self, target: CompanyMetrics, peers: List[CompanyMetrics]):
        self.target = target
        self.peers = peers
        self.peer_data = pd.DataFrame()
        self.summary_stats = {}
        
    def _prepare_peer_data(self) -> None:
        """Prepare peer company data for analysis"""
        data = []
        for peer in self.peers:
            row = {
                "ticker": peer.ticker,
                "name": peer.name,
                "share_price": peer.share_price,
                "market_cap": peer.market_cap,
                "enterprise_value": peer.enterprise_value,
                "net_debt": peer.net_debt,
                "revenue_ltm": peer.revenue_ltm,
                "ebitda_ltm": peer.ebitda_ltm,
                "ebit_ltm": peer.ebit_ltm,
                "net_income_ltm": peer.net_income_ltm,
                "eps_ltm": peer.eps_ltm
            }
            # Add multiples
            row.update(peer.calculate_multiples())
            data.append(row)
            
        self.peer_data = pd.DataFrame(data)
        
    def _calculate_summary_stats(self) -> None:
        """Calculate summary statistics for peer group"""
        numeric_cols = self.peer_data.select_dtypes(include=[np.number]).columns
        
        self.summary_stats = {
            "mean": self.peer_data[numeric_cols].mean(),
            "median": self.peer_data[numeric_cols].median(),
            "p25": self.peer_data[numeric_cols].quantile(0.25),
            "p75": self.peer_data[numeric_cols].quantile(0.75)
        }
        
    def _remove_outliers(self, metric: str, threshold: float = 2.0) -> None:
        """Remove outliers based on z-score"""
        if metric in self.peer_data.columns:
            z_scores = np.abs((self.peer_data[metric] - self.peer_data[metric].mean()) / self.peer_data[metric].std())
            self.peer_data = self.peer_data[z_scores < threshold]
            
    def calculate_implied_valuation(self) -> Dict[str, Dict[str, float]]:
        """Calculate implied valuation using peer multiples"""
        implied_values = {
            "enterprise_value": {},
            "equity_value": {},
            "share_price": {}
        }
        
        # Calculate using different multiples
        multiple_metrics = {
            "ev_ebitda_ltm": self.target.ebitda_ltm,
            "ev_ebitda_ntm": self.target.ebitda_ntm,
            "ev_revenue_ltm": self.target.revenue_ltm,
            "ev_revenue_ntm": self.target.revenue_ntm,
            "ev_ebit_ltm": self.target.ebit_ltm,
            "ev_ebit_ntm": self.target.ebit_ntm
        }
        
        for multiple, metric in multiple_metrics.items():
            if metric and multiple in self.peer_data.columns:
                for stat in ["median", "mean", "p25", "p75"]:
                    multiple_value = self.summary_stats[stat][multiple]
                    implied_ev = metric * multiple_value
                    implied_equity = implied_ev - self.target.net_debt
                    implied_share_price = implied_equity / self.target.shares_outstanding
                    
                    implied_values["enterprise_value"][f"{multiple}_{stat}"] = implied_ev
                    implied_values["equity_value"][f"{multiple}_{stat}"] = implied_equity
                    implied_values["share_price"][f"{multiple}_{stat}"] = implied_share_price
        
        return implied_values
    
    def generate_sensitivity_table(self, 
                                 metric: str = "ev_ebitda_ltm",
                                 metric_range: Tuple[float, float] = (0.8, 1.2),
                                 multiple_range: Tuple[float, float] = (0.8, 1.2),
                                 steps: int = 5) -> pd.DataFrame:
        """Generate sensitivity table for implied values"""
        median_multiple = self.summary_stats["median"][metric]
        base_metric = getattr(self.target, metric.split('_')[1] + "_ltm")  # e.g., ebitda_ltm
        
        metric_values = np.linspace(
            base_metric * metric_range[0],
            base_metric * metric_range[1],
            steps
        )
        
        multiple_values = np.linspace(
            median_multiple * multiple_range[0],
            median_multiple * multiple_range[1],
            steps
        )
        
        sensitivity = pd.DataFrame(
            index=[f"{x:.1f}x" for x in multiple_values],
            columns=[f"${x/1e6:.0f}M" for x in metric_values]
        )
        
        for i, multiple in enumerate(multiple_values):
            for j, metric_value in enumerate(metric_values):
                implied_ev = multiple * metric_value
                implied_equity = implied_ev - self.target.net_debt
                implied_share_price = implied_equity / self.target.shares_outstanding
                sensitivity.iloc[i, j] = implied_share_price
                
        return sensitivity
    
    def run_analysis(self, remove_outliers: bool = True) -> Dict[str, Any]:
        """Run complete trading comps analysis"""
        # Prepare data
        self._prepare_peer_data()
        
        # Remove outliers if requested
        if remove_outliers:
            for metric in ["ev_ebitda_ltm", "ev_revenue_ltm", "pe_ltm"]:
                self._remove_outliers(metric)
        
        # Calculate statistics
        self._calculate_summary_stats()
        
        # Calculate implied valuation
        implied_values = self.calculate_implied_valuation()
        
        # Generate sensitivity
        sensitivity = self.generate_sensitivity_table()
        
        # Prepare output
        return {
            "peer_data": self.peer_data.to_dict(orient="records"),
            "summary_stats": {k: v.to_dict() for k, v in self.summary_stats.items()},
            "implied_valuation": implied_values,
            "sensitivity": sensitivity.to_dict(),
            "target_metrics": {
                "ticker": self.target.ticker,
                "name": self.target.name,
                "market_cap": self.target.market_cap,
                "enterprise_value": self.target.enterprise_value,
                "multiples": self.target.calculate_multiples()
            },
            "metadata": {
                "analysis_date": datetime.now().isoformat(),
                "peer_count": len(self.peers),
                "outliers_removed": remove_outliers
            }
        }
