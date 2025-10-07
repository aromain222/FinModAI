"""
Pro Forma Financials Module - Builds projected financial statements.
"""

from typing import Dict, Any, List
from .contracts import LBOAssumptions, PurchasePriceAllocation, ProFormaFinancials


class ProFormaFinancialsModule:
    """Builds pro forma financial statements for holding period."""
    
    def build_proforma(self, assumptions: LBOAssumptions, ppa: PurchasePriceAllocation) -> ProFormaFinancials:
        """
        Build pro forma financial statements.
        
        Args:
            assumptions: LBO assumptions
            ppa: Purchase Price Allocation
            
        Returns:
            ProFormaFinancials object
        """
        # Build years
        years = list(range(assumptions.entry_year, assumptions.exit_year + 1))
        n_years = len(years)
        
        # Initialize starting values
        base_revenue = assumptions.entry_ebitda / assumptions.ebitda_margin[0] if assumptions.ebitda_margin else assumptions.entry_ebitda * 4
        
        # Project revenue
        revenue = [base_revenue]
        for i in range(1, n_years):
            growth_rate = assumptions.revenue_growth[min(i-1, len(assumptions.revenue_growth)-1)]
            revenue.append(revenue[-1] * (1 + growth_rate))
        
        # Project EBITDA
        ebitda = []
        for i, rev in enumerate(revenue):
            margin = assumptions.ebitda_margin[min(i, len(assumptions.ebitda_margin)-1)]
            ebitda.append(rev * margin)
        
        # Project EBIT (EBITDA - D&A)
        ebit = []
        for i, ebitda_val in enumerate(ebitda):
            da = revenue[i] * assumptions.depreciation_rate
            ebit.append(ebitda_val - da)
        
        # Interest expense (will be calculated in debt schedule)
        interest_expense = [0] * n_years
        
        # Pretax income
        pretax_income = []
        for i in range(n_years):
            pretax_income.append(ebit[i] - interest_expense[i])
        
        # Tax expense
        tax_expense = []
        for i in range(n_years):
            tax_expense.append(pretax_income[i] * assumptions.tax_rate)
        
        # Net income
        net_income = []
        for i in range(n_years):
            net_income.append(pretax_income[i] - tax_expense[i])
        
        # Balance Sheet projections
        cash = [ppa.adjusted_cash] + [0] * (n_years - 1)
        working_capital = [revenue[i] * assumptions.nwc_pct_revenue for i in range(n_years)]
        ppe = [revenue[i] * 0.3 for i in range(n_years)]  # Assume 30% of revenue in PPE
        goodwill = [ppa.goodwill] + [ppa.goodwill] * (n_years - 1)  # No amortization for simplicity
        
        total_assets = []
        for i in range(n_years):
            total_assets.append(cash[i] + working_capital[i] + ppe[i] + goodwill[i])
        
        # Debt (will be updated by debt schedule)
        total_debt = [ppa.adjusted_debt] + [0] * (n_years - 1)
        
        # Equity
        equity = [ppa.adjusted_equity] + [0] * (n_years - 1)
        for i in range(1, n_years):
            equity[i] = equity[i-1] + net_income[i]
        
        total_liabilities_equity = []
        for i in range(n_years):
            total_liabilities_equity.append(total_debt[i] + equity[i])
        
        # Cash Flow projections
        operating_cash_flow = []
        for i in range(n_years):
            ocf = net_income[i] + (revenue[i] * assumptions.depreciation_rate)
            operating_cash_flow.append(ocf)
        
        capex = [revenue[i] * assumptions.capex_pct_revenue for i in range(n_years)]
        
        free_cash_flow = []
        for i in range(n_years):
            fcf = operating_cash_flow[i] - capex[i]
            free_cash_flow.append(fcf)
        
        debt_repayments = [0] * n_years  # Will be updated by debt schedule
        net_change_in_cash = []
        for i in range(n_years):
            net_change_in_cash.append(free_cash_flow[i] - debt_repayments[i])
        
        return ProFormaFinancials(
            years=years,
            revenue=revenue,
            ebitda=ebitda,
            ebit=ebit,
            interest_expense=interest_expense,
            pretax_income=pretax_income,
            tax_expense=tax_expense,
            net_income=net_income,
            cash=cash,
            working_capital=working_capital,
            ppe=ppe,
            goodwill=goodwill,
            total_assets=total_assets,
            total_debt=total_debt,
            equity=equity,
            total_liabilities_equity=total_liabilities_equity,
            operating_cash_flow=operating_cash_flow,
            capex=capex,
            free_cash_flow=free_cash_flow,
            debt_repayments=debt_repayments,
            net_change_in_cash=net_change_in_cash
        )
