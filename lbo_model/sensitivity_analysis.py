"""
Sensitivity Analysis Module - Builds sensitivity matrices and scenario analyses.
"""

from typing import Dict, Any, List
from .contracts import LBOAssumptions, SensitivityMatrix, ScenarioAnalysis, ScenarioType


class SensitivityAnalysisModule:
    """Builds sensitivity analysis and scenario modeling."""
    
    def __init__(self):
        self.lbo_engine = None  # Will be set externally
    
    def set_lbo_engine(self, lbo_engine):
        """Set the LBO engine reference."""
        self.lbo_engine = lbo_engine
    
    def build_sensitivity_matrices(self, assumptions: LBOAssumptions) -> List[SensitivityMatrix]:
        """Build 2D sensitivity matrices."""
        matrices = []
        
        # Exit Multiple vs Leverage Matrix
        exit_leverage_matrix = self._build_exit_leverage_matrix(assumptions)
        matrices.append(exit_leverage_matrix)
        
        # Entry vs Exit Multiple Matrix
        entry_exit_matrix = self._build_entry_exit_matrix(assumptions)
        matrices.append(entry_exit_matrix)
        
        return matrices
    
    def build_scenario_analyses(self, assumptions: LBOAssumptions) -> List[ScenarioAnalysis]:
        """Build scenario analyses."""
        scenarios = []
        
        # Base case
        base_scenario = self._build_scenario(assumptions, ScenarioType.BASE)
        scenarios.append(base_scenario)
        
        # Upside case
        upside_assumptions = self._adjust_assumptions_for_scenario(assumptions, ScenarioType.UPSIDE)
        upside_scenario = self._build_scenario(upside_assumptions, ScenarioType.UPSIDE)
        scenarios.append(upside_scenario)
        
        # Downside case
        downside_assumptions = self._adjust_assumptions_for_scenario(assumptions, ScenarioType.DOWNSIDE)
        downside_scenario = self._build_scenario(downside_assumptions, ScenarioType.DOWNSIDE)
        scenarios.append(downside_scenario)
        
        return scenarios
    
    def _build_exit_leverage_matrix(self, assumptions: LBOAssumptions) -> SensitivityMatrix:
        """Build exit multiple vs leverage sensitivity matrix."""
        # Vary exit multiple
        exit_multiples = [8.0, 9.0, 10.0, 11.0, 12.0]
        
        # Vary leverage
        leverage_multiples = [4.0, 4.5, 5.0, 5.5, 6.0]
        
        irr_matrix = []
        moic_matrix = []
        
        for leverage_mult in leverage_multiples:
            irr_row = []
            moic_row = []
            
            for exit_mult in exit_multiples:
                # Create modified assumptions
                modified_assumptions = self._create_modified_assumptions(
                    assumptions, 
                    exit_multiple=exit_mult,
                    senior_debt_multiple=leverage_mult * 0.7,
                    mezzanine_debt_multiple=leverage_mult * 0.3
                )
                
                # Build model and get returns
                model_result = self.lbo_engine.build_lbo_model(modified_assumptions.to_dict())
                
                if "error" not in model_result:
                    returns = model_result.get("returns_analysis", {})
                    irr = returns.get("sponsor_irr", 0)
                    moic = returns.get("sponsor_moic", 0)
                else:
                    irr = 0
                    moic = 0
                
                irr_row.append(irr)
                moic_row.append(moic)
            
            irr_matrix.append(irr_row)
            moic_matrix.append(moic_row)
        
        return SensitivityMatrix(
            x_axis_label="Exit Multiple",
            y_axis_label="Total Leverage",
            x_values=exit_multiples,
            y_values=leverage_multiples,
            irr_matrix=irr_matrix,
            moic_matrix=moic_matrix
        )
    
    def _build_entry_exit_matrix(self, assumptions: LBOAssumptions) -> SensitivityMatrix:
        """Build entry vs exit multiple sensitivity matrix."""
        entry_multiples = [6.0, 7.0, 8.0, 9.0, 10.0]
        exit_multiples = [8.0, 9.0, 10.0, 11.0, 12.0]
        
        irr_matrix = []
        moic_matrix = []
        
        for entry_mult in entry_multiples:
            irr_row = []
            moic_row = []
            
            for exit_mult in exit_multiples:
                modified_assumptions = self._create_modified_assumptions(
                    assumptions,
                    entry_multiple=entry_mult,
                    exit_multiple=exit_mult
                )
                
                model_result = self.lbo_engine.build_lbo_model(modified_assumptions.to_dict())
                
                if "error" not in model_result:
                    returns = model_result.get("returns_analysis", {})
                    irr = returns.get("sponsor_irr", 0)
                    moic = returns.get("sponsor_moic", 0)
                else:
                    irr = 0
                    moic = 0
                
                irr_row.append(irr)
                moic_row.append(moic)
            
            irr_matrix.append(irr_row)
            moic_matrix.append(moic_row)
        
        return SensitivityMatrix(
            x_axis_label="Exit Multiple",
            y_axis_label="Entry Multiple",
            x_values=exit_multiples,
            y_values=entry_multiples,
            irr_matrix=irr_matrix,
            moic_matrix=moic_matrix
        )
    
    def _build_scenario(self, assumptions: LBOAssumptions, scenario_type: ScenarioType) -> ScenarioAnalysis:
        """Build individual scenario analysis."""
        model_result = self.lbo_engine.build_lbo_model(assumptions.to_dict())
        
        if "error" in model_result:
            # Return empty scenario if model fails
            return ScenarioAnalysis(
                scenario_type=scenario_type,
                assumptions=assumptions,
                returns=None,
                covenant_metrics=None
            )
        
        # Extract results
        returns_data = model_result.get("returns_analysis", {})
        covenant_data = model_result.get("covenant_metrics", {})
        
        # Convert back to objects (simplified)
        returns = ReturnsAnalysis(**returns_data) if returns_data else None
        covenants = CovenantMetrics(**covenant_data) if covenant_data else None
        
        return ScenarioAnalysis(
            scenario_type=scenario_type,
            assumptions=assumptions,
            returns=returns,
            covenant_metrics=covenants
        )
    
    def _adjust_assumptions_for_scenario(self, assumptions: LBOAssumptions, scenario_type: ScenarioType) -> LBOAssumptions:
        """Adjust assumptions for different scenarios."""
        if scenario_type == ScenarioType.UPSIDE:
            # 20% better performance
            adjusted_growth = [g * 1.2 for g in assumptions.revenue_growth]
            adjusted_margins = [m * 1.1 for m in assumptions.ebitda_margin]
            adjusted_exit_multiple = assumptions.exit_multiple * 1.1
            
            return LBOAssumptions(
                entry_year=assumptions.entry_year,
                entry_ebitda=assumptions.entry_ebitda,
                entry_multiple=assumptions.entry_multiple,
                existing_debt=assumptions.existing_debt,
                existing_cash=assumptions.existing_cash,
                exit_year=assumptions.exit_year,
                exit_multiple=adjusted_exit_multiple,
                holding_period=assumptions.holding_period,
                senior_debt_multiple=assumptions.senior_debt_multiple,
                mezzanine_debt_multiple=assumptions.mezzanine_debt_multiple,
                sponsor_equity_multiple=assumptions.sponsor_equity_multiple,
                senior_debt_rate=assumptions.senior_debt_rate,
                mezzanine_debt_rate=assumptions.mezzanine_debt_rate,
                revolver_rate=assumptions.revolver_rate,
                advisory_fees=assumptions.advisory_fees,
                financing_fees=assumptions.financing_fees,
                other_fees=assumptions.other_fees,
                revenue_growth=adjusted_growth,
                ebitda_margin=adjusted_margins,
                capex_pct_revenue=assumptions.capex_pct_revenue,
                nwc_pct_revenue=assumptions.nwc_pct_revenue,
                tax_rate=assumptions.tax_rate,
                depreciation_rate=assumptions.depreciation_rate,
                management_rollover_pct=assumptions.management_rollover_pct,
                management_incentive_pct=assumptions.management_incentive_pct
            )
        
        elif scenario_type == ScenarioType.DOWNSIDE:
            # 20% worse performance
            adjusted_growth = [g * 0.8 for g in assumptions.revenue_growth]
            adjusted_margins = [m * 0.9 for m in assumptions.ebitda_margin]
            adjusted_exit_multiple = assumptions.exit_multiple * 0.9
            
            return LBOAssumptions(
                entry_year=assumptions.entry_year,
                entry_ebitda=assumptions.entry_ebitda,
                entry_multiple=assumptions.entry_multiple,
                existing_debt=assumptions.existing_debt,
                existing_cash=assumptions.existing_cash,
                exit_year=assumptions.exit_year,
                exit_multiple=adjusted_exit_multiple,
                holding_period=assumptions.holding_period,
                senior_debt_multiple=assumptions.senior_debt_multiple,
                mezzanine_debt_multiple=assumptions.mezzanine_debt_multiple,
                sponsor_equity_multiple=assumptions.sponsor_equity_multiple,
                senior_debt_rate=assumptions.senior_debt_rate,
                mezzanine_debt_rate=assumptions.mezzanine_debt_rate,
                revolver_rate=assumptions.revolver_rate,
                advisory_fees=assumptions.advisory_fees,
                financing_fees=assumptions.financing_fees,
                other_fees=assumptions.other_fees,
                revenue_growth=adjusted_growth,
                ebitda_margin=adjusted_margins,
                capex_pct_revenue=assumptions.capex_pct_revenue,
                nwc_pct_revenue=assumptions.nwc_pct_revenue,
                tax_rate=assumptions.tax_rate,
                depreciation_rate=assumptions.depreciation_rate,
                management_rollover_pct=assumptions.management_rollover_pct,
                management_incentive_pct=assumptions.management_incentive_pct
            )
        
        else:
            return assumptions
    
    def _create_modified_assumptions(self, base_assumptions: LBOAssumptions, **kwargs) -> LBOAssumptions:
        """Create modified assumptions with specified changes."""
        return LBOAssumptions(
            entry_year=kwargs.get("entry_year", base_assumptions.entry_year),
            entry_ebitda=kwargs.get("entry_ebitda", base_assumptions.entry_ebitda),
            entry_multiple=kwargs.get("entry_multiple", base_assumptions.entry_multiple),
            existing_debt=kwargs.get("existing_debt", base_assumptions.existing_debt),
            existing_cash=kwargs.get("existing_cash", base_assumptions.existing_cash),
            exit_year=kwargs.get("exit_year", base_assumptions.exit_year),
            exit_multiple=kwargs.get("exit_multiple", base_assumptions.exit_multiple),
            holding_period=kwargs.get("holding_period", base_assumptions.holding_period),
            senior_debt_multiple=kwargs.get("senior_debt_multiple", base_assumptions.senior_debt_multiple),
            mezzanine_debt_multiple=kwargs.get("mezzanine_debt_multiple", base_assumptions.mezzanine_debt_multiple),
            sponsor_equity_multiple=kwargs.get("sponsor_equity_multiple", base_assumptions.sponsor_equity_multiple),
            senior_debt_rate=kwargs.get("senior_debt_rate", base_assumptions.senior_debt_rate),
            mezzanine_debt_rate=kwargs.get("mezzanine_debt_rate", base_assumptions.mezzanine_debt_rate),
            revolver_rate=kwargs.get("revolver_rate", base_assumptions.revolver_rate),
            advisory_fees=kwargs.get("advisory_fees", base_assumptions.advisory_fees),
            financing_fees=kwargs.get("financing_fees", base_assumptions.financing_fees),
            other_fees=kwargs.get("other_fees", base_assumptions.other_fees),
            revenue_growth=kwargs.get("revenue_growth", base_assumptions.revenue_growth),
            ebitda_margin=kwargs.get("ebitda_margin", base_assumptions.ebitda_margin),
            capex_pct_revenue=kwargs.get("capex_pct_revenue", base_assumptions.capex_pct_revenue),
            nwc_pct_revenue=kwargs.get("nwc_pct_revenue", base_assumptions.nwc_pct_revenue),
            tax_rate=kwargs.get("tax_rate", base_assumptions.tax_rate),
            depreciation_rate=kwargs.get("depreciation_rate", base_assumptions.depreciation_rate),
            management_rollover_pct=kwargs.get("management_rollover_pct", base_assumptions.management_rollover_pct),
            management_incentive_pct=kwargs.get("management_incentive_pct", base_assumptions.management_incentive_pct)
        )
