"""
Enhanced LBO Model with Validation and Real Data
"""

from dataclasses import dataclass
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np
import numpy_financial as npf
from datetime import datetime
import logging

from .lbo_validator import CompanyMetrics, MarketConditions, validate_lbo_model
from .lbo_data_provider import LBODataProvider, DataProviderError

logger = logging.getLogger(__name__)

@dataclass
class LBOModelInputs:
    """Validated inputs for LBO model"""
    # Company data
    company: CompanyMetrics
    
    # Market conditions
    market: MarketConditions
    
    # Model assumptions
    purchase_multiple: float
    revenue_growth: float
    ebitda_margin: float
    exit_multiple: float
    exit_year: int = 5
    
    # Capital structure
    minimum_equity: float = 0.40
    term_loan_spread: float = 0.0425
    revolver_spread: float = 0.0375
    
    # Operating assumptions
    capex_percent: float = 0.05
    nwc_percent: float = 0.25
    tax_rate: float = 0.25
    
    def __post_init__(self):
        """Validate all inputs"""
        # Validate through LBO validator
        is_valid, messages, suggestions = validate_lbo_model(
            self.company,
            self.market,
            {
                "purchase_multiple": self.purchase_multiple,
                "revenue_growth": self.revenue_growth,
                "ebitda_margin": self.ebitda_margin,
                "exit_multiple": self.exit_multiple,
                "minimum_equity": self.minimum_equity
            }
        )
        
        if not is_valid:
            raise ValueError(f"Invalid LBO inputs: {'; '.join(messages)}")

class EnhancedLBOModel:
    """Enhanced LBO model with validation and real data"""
    
    def __init__(self, inputs: LBOModelInputs):
        self.inputs = inputs
        self.results = {}
        
    def run_model(self) -> Dict[str, Any]:
        """Run full LBO analysis"""
        try:
            # Calculate purchase price
            self._calculate_purchase_price()
            
            # Build projections
            self._build_projections()
            
            # Calculate debt schedule
            self._calculate_debt_schedule()
            
            # Calculate returns
            self._calculate_returns()
            
            # Add sensitivity analysis
            self._add_sensitivity_analysis()
            
            # Validate final outputs
            self._validate_outputs()
            
            return self.results
            
        except Exception as e:
            logger.error(f"Error running LBO model: {str(e)}")
            raise
            
    def _calculate_purchase_price(self):
        """Calculate purchase price and capital structure"""
        company = self.inputs.company
        
        # Enterprise value and fees
        ev = company.ebitda_ltm * self.inputs.purchase_multiple
        fees = ev * 0.02  # 2% transaction fees
        total_uses = ev + fees
        
        # Capital structure
        max_debt = min(
            ev * 0.65,  # Max 65% debt
            company.ebitda_ltm * 6.0  # Max 6.0x leverage
        )
        
        # Split between term loan and revolver
        term_loan = max_debt * 0.8
        revolver = max_debt * 0.2
        equity = total_uses - max_debt
        
        # Ensure minimum equity check
        if equity / total_uses < self.inputs.minimum_equity:
            equity = total_uses * self.inputs.minimum_equity
            max_debt = total_uses - equity
            term_loan = max_debt * 0.8
            revolver = max_debt * 0.2
        
        self.results["purchase_price"] = {
            "enterprise_value": ev,
            "fees": fees,
            "total_uses": total_uses,
            "sources_uses": {
                "Sources": {
                    "Term Loan": term_loan,
                    "Revolver": revolver,
                    "Equity": equity
                },
                "Uses": {
                    "Purchase Enterprise Value": ev,
                    "Transaction Fees": fees
                }
            }
        }
        
    def _build_projections(self):
        """Build 5-year financial projections"""
        # Initialize projection dataframes
        years = range(self.inputs.exit_year + 1)
        self.results["projections"] = {
            "income_stmt": pd.DataFrame(index=years),
            "balance_sheet": pd.DataFrame(index=years),
            "cash_flow": pd.DataFrame(index=years)
        }
        
        # Income statement projections
        df = self.results["projections"]["income_stmt"]
        df.loc[0, "revenue"] = self.inputs.company.revenue_ltm
        df.loc[0, "ebitda"] = self.inputs.company.ebitda_ltm
        
        for year in range(1, self.inputs.exit_year + 1):
            df.loc[year, "revenue"] = df.loc[year-1, "revenue"] * (1 + self.inputs.revenue_growth)
            df.loc[year, "ebitda"] = df.loc[year, "revenue"] * self.inputs.ebitda_margin
            
        # Add depreciation (assume = capex)
        df["depreciation"] = df["revenue"] * self.inputs.capex_percent
        
        # EBIT and taxes
        df["ebit"] = df["ebitda"] - df["depreciation"]
        df["taxes"] = df["ebit"] * self.inputs.tax_rate
        df["nopat"] = df["ebit"] - df["taxes"]
        
        # Cash flow projections
        cf = self.results["projections"]["cash_flow"]
        cf["nopat"] = df["nopat"]
        cf["depreciation"] = df["depreciation"]
        cf["capex"] = -df["revenue"] * self.inputs.capex_percent
        
        # Working capital
        cf["nwc_investment"] = df["revenue"].diff() * self.inputs.nwc_percent * -1
        cf.loc[0, "nwc_investment"] = 0  # No change in year 0
        
        # Unlevered free cash flow
        cf["ufcf"] = cf["nopat"] + cf["depreciation"] + cf["capex"] + cf["nwc_investment"]
        
    def _calculate_debt_schedule(self):
        """Calculate debt paydown schedule"""
        # Initialize debt schedule
        years = range(self.inputs.exit_year + 1)
        self.results["debt_schedule"] = pd.DataFrame(index=years)
        ds = self.results["debt_schedule"]
        
        # Starting debt balances
        sources = self.results["purchase_price"]["sources_uses"]["Sources"]
        ds.loc[0, "term_loan"] = sources["Term Loan"]
        ds.loc[0, "revolver"] = sources["Revolver"]
        
        # Interest rates
        term_rate = self.inputs.market.risk_free_rate + self.inputs.term_loan_spread
        revolver_rate = self.inputs.market.risk_free_rate + self.inputs.revolver_spread
        
        # Calculate debt paydown
        cf = self.results["projections"]["cash_flow"]
        for year in range(1, self.inputs.exit_year + 1):
            # Calculate interest
            prev_term = ds.loc[year-1, "term_loan"]
            prev_rev = ds.loc[year-1, "revolver"]
            
            term_interest = prev_term * term_rate
            rev_interest = prev_rev * revolver_rate
            
            # Cash available for debt paydown
            available_cash = cf.loc[year, "ufcf"] - term_interest - rev_interest
            
            # Pay down revolver first
            revolver_paydown = min(available_cash, prev_rev)
            ds.loc[year, "revolver"] = prev_rev - revolver_paydown
            
            # Remaining cash goes to term loan
            remaining_cash = available_cash - revolver_paydown
            term_paydown = min(remaining_cash, prev_term * 0.1)  # Max 10% annual paydown
            ds.loc[year, "term_loan"] = prev_term - term_paydown
            
        # Add interest expense to projections
        self.results["projections"]["income_stmt"]["interest_expense"] = (
            ds["term_loan"] * term_rate + ds["revolver"] * revolver_rate
        )
        
    def _calculate_returns(self):
        """Calculate investment returns"""
        # Exit enterprise value
        final_ebitda = self.results["projections"]["income_stmt"].loc[self.inputs.exit_year, "ebitda"]
        exit_ev = final_ebitda * self.inputs.exit_multiple
        
        # Exit equity value
        final_debt = (
            self.results["debt_schedule"].loc[self.inputs.exit_year, "term_loan"] +
            self.results["debt_schedule"].loc[self.inputs.exit_year, "revolver"]
        )
        exit_equity = exit_ev - final_debt
        
        # Initial equity
        initial_equity = self.results["purchase_price"]["sources_uses"]["Sources"]["Equity"]
        
        # Calculate returns
        equity_multiple = exit_equity / initial_equity
        
        # Build cash flow array for IRR
        cash_flows = [-initial_equity]  # Initial investment
        # No intermediate cash flows assumed
        cash_flows.extend([0] * (self.inputs.exit_year - 1))
        cash_flows.append(exit_equity)  # Exit value
        
        irr = npf.irr(cash_flows)
        
        self.results["returns"] = {
            "exit_enterprise_value": exit_ev,
            "exit_equity_value": exit_equity,
            "equity_multiple": equity_multiple,
            "irr": irr,
            "exit_leverage": final_debt / final_ebitda
        }
        
    def _add_sensitivity_analysis(self):
        """Add sensitivity analysis for key variables"""
        base_irr = self.results["returns"]["irr"]
        base_multiple = self.results["returns"]["equity_multiple"]
        
        # Exit multiple sensitivity
        exit_multiples = np.array([
            self.inputs.exit_multiple * (1 + x)
            for x in [-0.2, -0.1, 0, 0.1, 0.2]
        ])
        
        # EBITDA margin sensitivity
        margins = np.array([
            self.inputs.ebitda_margin * (1 + x)
            for x in [-0.15, -0.075, 0, 0.075, 0.15]
        ])
        
        # Revenue growth sensitivity
        growth_rates = np.array([
            self.inputs.revenue_growth * (1 + x)
            for x in [-0.3, -0.15, 0, 0.15, 0.3]
        ])
        
        # Create sensitivity tables
        self.results["sensitivity"] = {
            "exit_multiple_irr": {
                str(round(mult, 2)): self._calc_irr_with_exit_multiple(mult)
                for mult in exit_multiples
            },
            "margin_irr": {
                str(round(margin * 100, 1)) + "%": self._calc_irr_with_margin(margin)
                for margin in margins
            },
            "growth_irr": {
                str(round(growth * 100, 1)) + "%": self._calc_irr_with_growth(growth)
                for growth in growth_rates
            }
        }
        
    def _calc_irr_with_exit_multiple(self, exit_multiple: float) -> float:
        """Calculate IRR with different exit multiple"""
        final_ebitda = self.results["projections"]["income_stmt"].loc[self.inputs.exit_year, "ebitda"]
        exit_ev = final_ebitda * exit_multiple
        final_debt = (
            self.results["debt_schedule"].loc[self.inputs.exit_year, "term_loan"] +
            self.results["debt_schedule"].loc[self.inputs.exit_year, "revolver"]
        )
        exit_equity = exit_ev - final_debt
        initial_equity = self.results["purchase_price"]["sources_uses"]["Sources"]["Equity"]
        
        cash_flows = [-initial_equity] + [0] * (self.inputs.exit_year - 1) + [exit_equity]
        return npf.irr(cash_flows)
        
    def _calc_irr_with_margin(self, margin: float) -> float:
        """Calculate IRR with different EBITDA margin"""
        # Recalculate EBITDA and cash flows with new margin
        df = self.results["projections"]["income_stmt"].copy()
        df["ebitda"] = df["revenue"] * margin
        df["ebit"] = df["ebitda"] - df["depreciation"]
        df["taxes"] = df["ebit"] * self.inputs.tax_rate
        df["nopat"] = df["ebit"] - df["taxes"]
        
        # Recalculate exit value
        final_ebitda = df.loc[self.inputs.exit_year, "ebitda"]
        exit_ev = final_ebitda * self.inputs.exit_multiple
        final_debt = (
            self.results["debt_schedule"].loc[self.inputs.exit_year, "term_loan"] +
            self.results["debt_schedule"].loc[self.inputs.exit_year, "revolver"]
        )
        exit_equity = exit_ev - final_debt
        initial_equity = self.results["purchase_price"]["sources_uses"]["Sources"]["Equity"]
        
        cash_flows = [-initial_equity] + [0] * (self.inputs.exit_year - 1) + [exit_equity]
        return npf.irr(cash_flows)
        
    def _calc_irr_with_growth(self, growth: float) -> float:
        """Calculate IRR with different revenue growth"""
        # Recalculate revenue and all dependent metrics
        df = self.results["projections"]["income_stmt"].copy()
        df.loc[0, "revenue"] = self.inputs.company.revenue_ltm
        
        for year in range(1, self.inputs.exit_year + 1):
            df.loc[year, "revenue"] = df.loc[year-1, "revenue"] * (1 + growth)
            
        df["ebitda"] = df["revenue"] * self.inputs.ebitda_margin
        df["ebit"] = df["ebitda"] - df["depreciation"]
        df["taxes"] = df["ebit"] * self.inputs.tax_rate
        df["nopat"] = df["ebit"] - df["taxes"]
        
        # Recalculate exit value
        final_ebitda = df.loc[self.inputs.exit_year, "ebitda"]
        exit_ev = final_ebitda * self.inputs.exit_multiple
        final_debt = (
            self.results["debt_schedule"].loc[self.inputs.exit_year, "term_loan"] +
            self.results["debt_schedule"].loc[self.inputs.exit_year, "revolver"]
        )
        exit_equity = exit_ev - final_debt
        initial_equity = self.results["purchase_price"]["sources_uses"]["Sources"]["Equity"]
        
        cash_flows = [-initial_equity] + [0] * (self.inputs.exit_year - 1) + [exit_equity]
        return npf.irr(cash_flows)
        
    def _validate_outputs(self):
        """Validate model outputs for reasonableness"""
        # Check leverage metrics
        final_leverage = self.results["returns"]["exit_leverage"]
        if final_leverage > 5.0:
            logger.warning(f"High exit leverage: {final_leverage:.1f}x")
            
        # Check returns
        irr = self.results["returns"]["irr"]
        if irr < 0.15:
            logger.warning(f"Low IRR: {irr:.1%}")
        elif irr > 0.35:
            logger.warning(f"Unusually high IRR: {irr:.1%}")
            
        # Check cash flow coverage
        cf = self.results["projections"]["cash_flow"]
        ds = self.results["debt_schedule"]
        is_stmt = self.results["projections"]["income_stmt"]
        
        for year in range(1, self.inputs.exit_year + 1):
            dscr = cf.loc[year, "ufcf"] / is_stmt.loc[year, "interest_expense"]
            if dscr < 1.5:
                logger.warning(f"Low DSCR in Year {year}: {dscr:.2f}x")
