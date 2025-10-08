"""
Professional Merger Model
Banker-grade merger and acquisition analysis with synergy modeling.
"""

from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import math

@dataclass
class MergerAssumptions:
    """Merger model assumptions."""
    acquirer_ticker: str
    target_ticker: str
    acquirer_name: str
    target_name: str
    purchase_price: float
    payment_method: str  # "cash", "stock", "mixed"
    stock_exchange_ratio: float = 0.0
    cash_per_share: float = 0.0
    synergies: Dict[str, float] = None
    integration_costs: float = 0.0
    financing_assumptions: Dict[str, Any] = None

@dataclass
class SynergyBucket:
    """Synergy bucket for categorization."""
    name: str
    amount: float
    timing: str  # "immediate", "year_1", "year_2", "year_3"
    confidence: str  # "high", "medium", "low"

@dataclass
class MergerResults:
    """Merger model results."""
    acquirer_data: Dict[str, Any]
    target_data: Dict[str, Any]
    pro_forma_is: List[Dict[str, float]]
    synergies: List[SynergyBucket]
    pf_leverage: float
    eps_accretion: float
    eps_dilution: float
    accretion_dilution: str
    pf_valuation: Dict[str, float]
    recommendation: str
    confidence: str

class MergerModel:
    """Professional merger and acquisition model."""
    
    def __init__(self):
        self.assumptions = None
        self.results = None
    
    def build_merger_model(self, assumptions: MergerAssumptions) -> MergerResults:
        """
        Build a complete merger model.
        
        Args:
            assumptions: Merger model assumptions
            
        Returns:
            MergerResults: Complete merger analysis
        """
        self.assumptions = assumptions
        
        # Get acquirer and target data (simplified - would come from financial data engine)
        acquirer_data = self._get_company_data(assumptions.acquirer_ticker)
        target_data = self._get_company_data(assumptions.target_ticker)
        
        # Build pro forma income statement
        pro_forma_is = self._build_pro_forma_is(acquirer_data, target_data, assumptions)
        
        # Calculate synergies
        synergies = self._calculate_synergies(assumptions)
        
        # Calculate pro forma leverage
        pf_leverage = self._calculate_pf_leverage(acquirer_data, target_data, assumptions)
        
        # Calculate EPS accretion/dilution
        eps_accretion, eps_dilution = self._calculate_eps_impact(acquirer_data, target_data, assumptions)
        
        # Determine accretion/dilution
        accretion_dilution = "accretion" if eps_accretion > 0 else "dilution"
        
        # Calculate pro forma valuation
        pf_valuation = self._calculate_pf_valuation(acquirer_data, target_data, assumptions)
        
        # Generate recommendation
        recommendation = self._generate_recommendation(eps_accretion, pf_leverage, synergies)
        confidence = self._calculate_confidence(assumptions)
        
        self.results = MergerResults(
            acquirer_data=acquirer_data,
            target_data=target_data,
            pro_forma_is=pro_forma_is,
            synergies=synergies,
            pf_leverage=pf_leverage,
            eps_accretion=eps_accretion,
            eps_dilution=eps_dilution,
            accretion_dilution=accretion_dilution,
            pf_valuation=pf_valuation,
            recommendation=recommendation,
            confidence=confidence
        )
        
        return self.results
    
    def _get_company_data(self, ticker: str) -> Dict[str, Any]:
        """Get company financial data (simplified)."""
        # In practice, this would use the financial data engine
        return {
            "ticker": ticker,
            "revenue": 1000000000,  # $1B
            "ebitda": 250000000,    # $250M
            "ebit": 200000000,      # $200M
            "net_income": 150000000, # $150M
            "shares_outstanding": 1000000000,  # 1B shares
            "total_debt": 300000000,  # $300M
            "cash": 100000000,      # $100M
            "market_cap": 2000000000  # $2B
        }
    
    def _build_pro_forma_is(self, acquirer_data: Dict, target_data: Dict, assumptions: MergerAssumptions) -> List[Dict[str, float]]:
        """Build pro forma income statement."""
        years = [2024, 2025, 2026, 2027, 2028]
        pro_forma_is = []
        
        for year in years:
            # Base combined revenue
            combined_revenue = acquirer_data["revenue"] + target_data["revenue"]
            
            # Apply revenue synergies
            revenue_synergies = assumptions.synergies.get("revenue", 0) if assumptions.synergies else 0
            pf_revenue = combined_revenue + revenue_synergies
            
            # Base combined EBITDA
            combined_ebitda = acquirer_data["ebitda"] + target_data["ebitda"]
            
            # Apply cost synergies
            cost_synergies = assumptions.synergies.get("cost", 0) if assumptions.synergies else 0
            pf_ebitda = combined_ebitda + cost_synergies
            
            # Subtract integration costs
            integration_costs = assumptions.integration_costs if year == 2024 else 0
            pf_ebit = pf_ebitda - integration_costs
            
            # Apply tax rate
            tax_rate = 0.25
            pf_net_income = pf_ebit * (1 - tax_rate)
            
            pro_forma_is.append({
                "year": year,
                "revenue": pf_revenue,
                "ebitda": pf_ebitda,
                "ebit": pf_ebit,
                "net_income": pf_net_income,
                "revenue_synergies": revenue_synergies,
                "cost_synergies": cost_synergies,
                "integration_costs": integration_costs
            })
        
        return pro_forma_is
    
    def _calculate_synergies(self, assumptions: MergerAssumptions) -> List[SynergyBucket]:
        """Calculate merger synergies."""
        synergies = []
        
        if assumptions.synergies:
            # Revenue synergies
            if "revenue" in assumptions.synergies:
                synergies.append(SynergyBucket(
                    name="Revenue Synergies",
                    amount=assumptions.synergies["revenue"],
                    timing="year_2",
                    confidence="medium"
                ))
            
            # Cost synergies
            if "cost" in assumptions.synergies:
                synergies.append(SynergyBucket(
                    name="Cost Synergies",
                    amount=assumptions.synergies["cost"],
                    timing="year_1",
                    confidence="high"
                ))
            
            # Tax synergies
            if "tax" in assumptions.synergies:
                synergies.append(SynergyBucket(
                    name="Tax Synergies",
                    amount=assumptions.synergies["tax"],
                    timing="immediate",
                    confidence="high"
                ))
        else:
            # Default synergies
            synergies = [
                SynergyBucket(
                    name="Cost Synergies",
                    amount=50000000,  # $50M
                    timing="year_1",
                    confidence="high"
                ),
                SynergyBucket(
                    name="Revenue Synergies",
                    amount=25000000,  # $25M
                    timing="year_2",
                    confidence="medium"
                )
            ]
        
        return synergies
    
    def _calculate_pf_leverage(self, acquirer_data: Dict, target_data: Dict, assumptions: MergerAssumptions) -> float:
        """Calculate pro forma leverage ratio."""
        # Combined debt
        combined_debt = acquirer_data["total_debt"] + target_data["total_debt"]
        
        # Add acquisition debt if cash payment
        if assumptions.payment_method == "cash":
            combined_debt += assumptions.purchase_price
        
        # Combined EBITDA
        combined_ebitda = acquirer_data["ebitda"] + target_data["ebitda"]
        
        # Add synergies
        if assumptions.synergies and "cost" in assumptions.synergies:
            combined_ebitda += assumptions.synergies["cost"]
        
        return combined_debt / combined_ebitda if combined_ebitda > 0 else 0
    
    def _calculate_eps_impact(self, acquirer_data: Dict, target_data: Dict, assumptions: MergerAssumptions) -> tuple:
        """Calculate EPS accretion/dilution."""
        # Acquirer standalone EPS
        acquirer_eps = acquirer_data["net_income"] / acquirer_data["shares_outstanding"]
        
        # Pro forma combined net income
        combined_net_income = acquirer_data["net_income"] + target_data["net_income"]
        
        # Add synergies
        if assumptions.synergies and "cost" in assumptions.synergies:
            combined_net_income += assumptions.synergies["cost"] * 0.75  # After tax
        
        # Pro forma shares outstanding
        if assumptions.payment_method == "stock":
            new_shares = (assumptions.purchase_price / acquirer_data["market_cap"]) * acquirer_data["shares_outstanding"]
            pf_shares = acquirer_data["shares_outstanding"] + new_shares
        else:
            pf_shares = acquirer_data["shares_outstanding"]
        
        # Pro forma EPS
        pf_eps = combined_net_income / pf_shares
        
        # Calculate accretion/dilution
        eps_accretion = pf_eps - acquirer_eps
        eps_dilution = acquirer_eps - pf_eps
        
        return eps_accretion, eps_dilution
    
    def _calculate_pf_valuation(self, acquirer_data: Dict, target_data: Dict, assumptions: MergerAssumptions) -> Dict[str, float]:
        """Calculate pro forma valuation metrics."""
        # Combined market cap
        combined_market_cap = acquirer_data["market_cap"] + target_data["market_cap"]
        
        # Add synergies value (assume 10x EBITDA multiple)
        synergies_value = 0
        if assumptions.synergies and "cost" in assumptions.synergies:
            synergies_value = assumptions.synergies["cost"] * 10
        
        # Pro forma enterprise value
        pf_enterprise_value = combined_market_cap + synergies_value
        
        # Pro forma equity value
        pf_equity_value = pf_enterprise_value - (acquirer_data["total_debt"] + target_data["total_debt"])
        
        return {
            "market_cap": combined_market_cap,
            "enterprise_value": pf_enterprise_value,
            "equity_value": pf_equity_value,
            "synergies_value": synergies_value
        }
    
    def _generate_recommendation(self, eps_accretion: float, pf_leverage: float, synergies: List[SynergyBucket]) -> str:
        """Generate merger recommendation."""
        # Simple logic - in practice, you'd have more sophisticated analysis
        if eps_accretion > 0.1 and pf_leverage < 3.0:
            return "STRONG BUY"
        elif eps_accretion > 0.05 and pf_leverage < 4.0:
            return "BUY"
        elif eps_accretion > 0:
            return "HOLD"
        else:
            return "AVOID"
    
    def _calculate_confidence(self, assumptions: MergerAssumptions) -> str:
        """Calculate confidence level in the analysis."""
        # Simple logic based on data quality and assumptions
        if (assumptions.synergies and 
            len(assumptions.synergies) >= 2 and 
            assumptions.payment_method in ["cash", "stock"]):
            return "H"
        elif assumptions.synergies:
            return "M"
        else:
            return "L"
    
    def get_summary(self) -> Dict[str, Any]:
        """Get a summary of the merger analysis."""
        if not self.results:
            return {}
        
        return {
            "acquirer": self.results.acquirer_data["ticker"],
            "target": self.results.target_data["ticker"],
            "pf_leverage": self.results.pf_leverage,
            "eps_accretion": self.results.eps_accretion,
            "eps_dilution": self.results.eps_dilution,
            "accretion_dilution": self.results.accretion_dilution,
            "pf_valuation": self.results.pf_valuation,
            "recommendation": self.results.recommendation,
            "confidence": self.results.confidence,
            "synergies": [{"name": s.name, "amount": s.amount, "timing": s.timing} for s in self.results.synergies]
        }
