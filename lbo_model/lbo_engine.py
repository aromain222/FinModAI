"""
LBO Engine - Main orchestrator for institutional-grade LBO modeling.
"""

import os
from typing import Dict, Any, Optional, List
from datetime import datetime
import json

from .contracts import *
from .assumptions import LBOAssumptionsModule

# Import financial data engine for historical assumptions
try:
    from financial_data import FinancialDataEngine
    FINANCIAL_DATA_AVAILABLE = True
except ImportError:
    FINANCIAL_DATA_AVAILABLE = False
    print("Warning: Financial data engine not available")
from .sources_uses import SourcesUsesModule
from .purchase_price_allocation import PurchasePriceAllocationModule
from .proforma_financials import ProFormaFinancialsModule
from .debt_schedule import DebtScheduleModule
from .returns_analysis import ReturnsAnalysisModule
from .sensitivity_analysis import SensitivityAnalysisModule
from .covenant_metrics import CovenantMetricsModule
from .equity_waterfall import EquityWaterfallModule
from .dashboard import DashboardModule


class LBOEngine:
    """
    Main LBO modeling engine that orchestrates all modules.
    Replicates institutional PE firm modeling standards.
    """
    
    def __init__(self):
        self.model_version = "1.0.0"
        self.created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Initialize financial data engine if available
        self.financial_engine = None
        if FINANCIAL_DATA_AVAILABLE:
            try:
                self.financial_engine = FinancialDataEngine()
                print("✅ Financial data engine initialized for LBO model")
            except Exception as e:
                print(f"⚠️ Financial data engine failed to initialize: {e}")
        
        # Initialize modules
        self.assumptions_module = LBOAssumptionsModule()
        self.sources_uses_module = SourcesUsesModule()
        self.ppa_module = PurchasePriceAllocationModule()
        self.proforma_module = ProFormaFinancialsModule()
        self.debt_module = DebtScheduleModule()
        self.returns_module = ReturnsAnalysisModule()
        self.sensitivity_module = SensitivityAnalysisModule()
        self.covenant_module = CovenantMetricsModule()
        self.waterfall_module = EquityWaterfallModule()
        self.dashboard_module = DashboardModule()
        
        # Set circular reference
        self.sensitivity_module.set_lbo_engine(self)
    
    def fetch_historical_assumptions(self, ticker: str) -> Optional[Dict[str, Any]]:
        """
        Fetch historical assumptions from financial data engine.
        
        Args:
            ticker: Company ticker symbol
            
        Returns:
            Historical assumptions dictionary or None if unavailable
        """
        if not self.financial_engine:
            print("⚠️ Financial data engine not available")
            return None
        
        try:
            print(f"🔍 Fetching historical assumptions for {ticker}...")
            result = self.financial_engine.get_assumptions(ticker, use_cache=False, allow_demo=True)
            
            if 'error' in result:
                print(f"❌ Failed to fetch data for {ticker}: {result['message']}")
                return None
            
            print(f"✅ Successfully fetched historical data for {ticker}")
            return result
            
        except Exception as e:
            print(f"❌ Error fetching historical assumptions for {ticker}: {e}")
            return None
    
    def _merge_historical_assumptions(self, assumptions_input: Dict[str, Any], historical_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Merge historical assumptions into LBO assumptions input.
        
        Args:
            assumptions_input: Original LBO assumptions
            historical_data: Historical data from financial engine
            
        Returns:
            Merged assumptions with historical data
        """
        merged = assumptions_input.copy()
        
        # Extract historical assumptions
        hist_assumptions = historical_data.get('assumptions', {})
        hist_wacc = historical_data.get('wacc', {})
        hist_historicals = historical_data.get('historicals', {})
        
        print("🔄 Merging historical assumptions into LBO model...")
        
        # Revenue growth (use historical if not provided)
        if 'revenue_growth' not in merged and 'revenue_growth' in hist_assumptions:
            merged['revenue_growth'] = hist_assumptions['revenue_growth'][:5]  # First 5 years
            print(f"📈 Using historical revenue growth: {[f'{x:.1%}' for x in merged['revenue_growth'][:3]]}...")
        
        # Operating margin (use historical if not provided)
        if 'operating_margin' not in merged and 'operating_margin' in hist_assumptions:
            merged['operating_margin'] = hist_assumptions['operating_margin'][:5]  # First 5 years
            print(f"📊 Using historical operating margin: {[f'{x:.1%}' for x in merged['operating_margin'][:3]]}...")
        
        # Tax rate (use historical if not provided)
        if 'tax_rate' not in merged and 'tax_rate' in hist_assumptions:
            merged['tax_rate'] = hist_assumptions['tax_rate']
            print(f"💰 Using historical tax rate: {merged['tax_rate']:.1%}")
        
        # WACC (use historical if not provided)
        if 'wacc' not in merged and 'wacc' in hist_wacc:
            merged['wacc'] = hist_wacc['wacc']
            print(f"📊 Using historical WACC: {merged['wacc']:.1%}")
        
        # Entry EBITDA (use historical if not provided)
        if 'entry_ebitda' not in merged and 'operating_income' in hist_historicals:
            latest_ebitda = hist_historicals['operating_income'][0]  # Most recent year
            if latest_ebitda:
                merged['entry_ebitda'] = latest_ebitda
                print(f"💰 Using historical EBITDA: ${merged['entry_ebitda']:,.0f}")
        
        # Company name
        if 'company_name' not in merged and 'company_name' in historical_data:
            merged['company_name'] = historical_data['company_name']
            print(f"🏢 Company: {merged['company_name']}")
        
        print("✅ Historical assumptions merged successfully")
        return merged
    
    def build_lbo_model(self, assumptions_input: Dict[str, Any]) -> Dict[str, Any]:
        """
        Build complete LBO model from assumptions.
        
        Args:
            assumptions_input: Dictionary with LBO assumptions
            
        Returns:
            Complete LBO model as dictionary
        """
        try:
            print("🏗️  Building institutional-grade LBO model...")
            
            # Step 0: Fetch historical assumptions if ticker provided
            ticker = assumptions_input.get('ticker')
            historical_data = None
            if ticker:
                historical_data = self.fetch_historical_assumptions(ticker)
                if historical_data:
                    # Merge historical assumptions into input
                    assumptions_input = self._merge_historical_assumptions(assumptions_input, historical_data)
            
            # Step 1: Process assumptions
            print("📊 Processing assumptions...")
            assumptions = self.assumptions_module.process_assumptions(assumptions_input)
            
            # Add additional fields for UI compatibility
            if historical_data:
                assumptions.company_name = historical_data.get('company_name', 'Unknown Company')
                assumptions.ticker = assumptions_input.get('ticker', 'UNKNOWN')
                assumptions.wacc = historical_data.get('wacc', {}).get('wacc', 0.10)
                assumptions.revenue = historical_data.get('historicals', {}).get('revenue', [0])
                assumptions.ebitda_margin = historical_data.get('historicals', {}).get('op_margin', [0.25])
                assumptions.revenue_growth = historical_data.get('assumptions', {}).get('revenue_growth', [0.05, 0.05, 0.05, 0.05, 0.05])
                assumptions.tax_rate = historical_data.get('assumptions', {}).get('tax_rate', 0.25)
            
            # Step 2: Sources & Uses
            print("💰 Calculating Sources & Uses...")
            sources_uses = self.sources_uses_module.calculate_sources_uses(assumptions)
            
            # Step 3: Purchase Price Allocation
            print("📋 Purchase Price Allocation...")
            ppa = self.ppa_module.calculate_ppa(assumptions, sources_uses)
            
            # Step 4: Pro Forma Financials
            print("📈 Building Pro Forma Financials...")
            proforma = self.proforma_module.build_proforma(assumptions, ppa)
            
            # Step 5: Debt Schedule
            print("🏦 Constructing Debt Schedule...")
            debt_schedule = self.debt_module.build_debt_schedule(assumptions, proforma)
            
            # Step 6: Returns Analysis
            print("📊 Returns Analysis...")
            returns = self.returns_module.calculate_returns(assumptions, proforma, debt_schedule)
            
            # Step 7: Covenant Metrics
            print("⚠️  Covenant Analysis...")
            covenants = self.covenant_module.calculate_covenants(assumptions, proforma, debt_schedule)
            
            # Step 8: Equity Waterfall
            print("💧 Equity Waterfall...")
            waterfall = self.waterfall_module.calculate_waterfall(assumptions, returns)
            
            # Step 9: Sensitivity Analysis (disabled to avoid circular dependency)
            print("🎯 Sensitivity Analysis...")
            sensitivity_matrices = []  # Disabled for now
            scenario_analyses = []     # Disabled for now
            
            # Step 10: Validation
            print("✅ Model Validation...")
            validation_checks, validation_messages = self._validate_model(
                sources_uses, proforma, debt_schedule, returns
            )
            
            # Step 11: Dashboard
            print("📊 Building Dashboard...")
            dashboard = self.dashboard_module.build_dashboard(
                assumptions, returns, covenants, sensitivity_matrices
            )
            
            # Build complete model
            lbo_model = LBOModel(
                assumptions=assumptions,
                sources_uses=sources_uses,
                purchase_price_allocation=ppa,
                proforma_financials=proforma,
                debt_schedule=debt_schedule,
                returns_analysis=returns,
                covenant_metrics=covenants,
                equity_waterfall=waterfall,
                sensitivity_matrices=sensitivity_matrices,
                scenario_analyses=scenario_analyses,
                validation_checks=validation_checks,
                validation_messages=validation_messages,
                created_at=self.created_at,
                model_version=self.model_version
            )
            
            print("✅ LBO Model Complete!")
            return lbo_model.to_dict()
            
        except Exception as e:
            print(f"❌ Error building LBO model: {e}")
            import traceback
            traceback.print_exc()
            return {
                "error": "model_build_failed",
                "message": f"Failed to build LBO model: {str(e)}",
                "created_at": self.created_at,
                "model_version": self.model_version
            }
    
    def _validate_model(
        self, 
        sources_uses: SourcesUses,
        proforma: ProFormaFinancials,
        debt_schedule: List[DebtTranche],
        returns: ReturnsAnalysis
    ) -> tuple[Dict[str, bool], List[str]]:
        """Validate model integrity."""
        checks = {}
        messages = []
        
        # Sources = Uses check
        sources_uses_valid, su_message = sources_uses.validate()
        checks["sources_equals_uses"] = sources_uses_valid
        messages.append(su_message)
        
        # Balance sheet balances
        balance_sheet_balances = True
        for i, year in enumerate(proforma.years):
            if abs(proforma.total_assets[i] - proforma.total_liabilities_equity[i]) > 0.01:
                balance_sheet_balances = False
                messages.append(f"Balance sheet doesn't balance in {year}")
                break
        
        checks["balance_sheet_balances"] = balance_sheet_balances
        if balance_sheet_balances:
            messages.append("Balance Sheet Balances ✓")
        
        # Cash never negative
        cash_never_negative = all(cash >= 0 for cash in proforma.cash)
        checks["cash_never_negative"] = cash_never_negative
        if cash_never_negative:
            messages.append("Cash ≥ 0 ✓")
        else:
            messages.append("❌ Cash goes negative")
        
        # Returns tie to exit value
        returns_tie = abs(returns.exit_equity_value - returns.sponsor_equity_exit_value) < 0.01
        checks["returns_tie_to_exit"] = returns_tie
        if returns_tie:
            messages.append("Returns Tie to Exit ✓")
        else:
            messages.append("❌ Returns don't tie to exit value")
        
        # IRR cross-check
        irr_reasonable = 0.05 <= returns.sponsor_irr <= 0.50  # 5% to 50%
        checks["irr_reasonable"] = irr_reasonable
        if irr_reasonable:
            messages.append(f"IRR Cross-Check ✓ ({returns.sponsor_irr:.1%})")
        else:
            messages.append(f"❌ IRR unreasonable: {returns.sponsor_irr:.1%}")
        
        return checks, messages
    
    def export_to_json(self, model_data: Dict[str, Any], filename: Optional[str] = None) -> str:
        """Export model to JSON file."""
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"lbo_model_{timestamp}.json"
        
        filepath = os.path.join(os.getcwd(), filename)
        
        with open(filepath, 'w') as f:
            json.dump(model_data, f, indent=2, default=str)
        
        print(f"📁 Model exported to: {filepath}")
        return filepath
    
    def get_model_summary(self, model_data: Dict[str, Any]) -> Dict[str, Any]:
        """Get executive summary of LBO model."""
        if "error" in model_data:
            return model_data
        
        returns = model_data.get("returns_analysis", {})
        assumptions = model_data.get("assumptions", {})
        covenants = model_data.get("covenant_metrics", {})
        
        summary = {
            "model_info": {
                "version": model_data.get("model_version", "1.0.0"),
                "created_at": model_data.get("created_at", ""),
                "holding_period": assumptions.get("holding_period", 0)
            },
            "key_metrics": {
                "sponsor_irr": returns.get("sponsor_irr", 0),
                "sponsor_moic": returns.get("sponsor_moic", 0),
                "exit_equity_value": returns.get("exit_equity_value", 0),
                "entry_multiple": assumptions.get("entry_multiple", 0),
                "exit_multiple": assumptions.get("exit_multiple", 0)
            },
            "leverage_profile": {
                "entry_leverage": covenants.get("debt_to_ebitda", [0])[0] if covenants.get("debt_to_ebitda") else 0,
                "exit_leverage": covenants.get("debt_to_ebitda", [0])[-1] if covenants.get("debt_to_ebitda") else 0
            },
            "validation": {
                "checks_passed": sum(model_data.get("validation_checks", {}).values()),
                "total_checks": len(model_data.get("validation_checks", {})),
                "status": "✅ PASS" if all(model_data.get("validation_checks", {}).values()) else "❌ FAIL"
            }
        }
        
        return summary
