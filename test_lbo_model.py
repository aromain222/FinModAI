#!/usr/bin/env python3
"""
LBO Model Test Script - Demonstrates institutional-grade LBO modeling.
"""

import json
from lbo_model import LBOEngine


def test_lbo_model():
    """Test the LBO model with realistic assumptions."""
    
    # Sample LBO assumptions (realistic PE deal)
    assumptions = {
        # Entry assumptions
        "entry_year": 2024,
        "entry_ebitda": 50_000_000,  # $50M EBITDA
        "entry_multiple": 8.0,       # 8.0x entry multiple
        "existing_debt": 20_000_000, # $20M existing debt
        "existing_cash": 5_000_000,  # $5M existing cash
        
        # Exit assumptions
        "holding_period": 5,         # 5-year hold
        "exit_multiple": 10.0,       # 10.0x exit multiple
        
        # Leverage structure
        "senior_debt_multiple": 4.0, # 4.0x senior debt
        "mezzanine_debt_multiple": 1.5, # 1.5x mezzanine
        "sponsor_equity_multiple": 2.5, # 2.5x sponsor equity
        
        # Interest rates
        "senior_debt_rate": 0.06,    # 6% senior debt
        "mezzanine_debt_rate": 0.12, # 12% mezzanine
        "revolver_rate": 0.05,       # 5% revolver
        
        # Transaction costs
        "advisory_fees": 2_000_000,
        "financing_fees": 1_500_000,
        "other_fees": 500_000,
        
        # Operating assumptions
        "revenue_growth": [0.08, 0.07, 0.06, 0.05, 0.04],  # 8% declining to 4%
        "ebitda_margin": [0.25, 0.26, 0.27, 0.28, 0.29],   # 25% expanding to 29%
        "capex_pct_revenue": 0.04,   # 4% of revenue
        "nwc_pct_revenue": 0.12,     # 12% of revenue
        "tax_rate": 0.25,           # 25% tax rate
        "depreciation_rate": 0.03,   # 3% depreciation
        
        # Management
        "management_rollover_pct": 0.10,  # 10% management rollover
        "management_incentive_pct": 0.20  # 20% management carry
    }
    
    print("🏗️  Building Institutional-Grade LBO Model...")
    print("=" * 60)
    
    # Initialize LBO engine
    lbo_engine = LBOEngine()
    
    # Build the model
    model_result = lbo_engine.build_lbo_model(assumptions)
    
    if "error" in model_result:
        print(f"❌ Error: {model_result['message']}")
        return
    
    print("✅ LBO Model Built Successfully!")
    print("=" * 60)
    
    # Get executive summary
    summary = lbo_engine.get_model_summary(model_result)
    
    print("📊 EXECUTIVE SUMMARY")
    print("-" * 30)
    print(f"Sponsor IRR: {summary['key_metrics']['sponsor_irr']:.1%}")
    print(f"Sponsor MOIC: {summary['key_metrics']['sponsor_moic']:.1f}x")
    print(f"Exit Equity Value: ${summary['key_metrics']['exit_equity_value']:,.0f}")
    print(f"Entry Multiple: {summary['key_metrics']['entry_multiple']:.1f}x")
    print(f"Exit Multiple: {summary['key_metrics']['exit_multiple']:.1f}x")
    
    print(f"\nLeverage Profile:")
    print(f"Entry Leverage: {summary['leverage_profile']['entry_leverage']:.1f}x")
    print(f"Exit Leverage: {summary['leverage_profile']['exit_leverage']:.1f}x")
    
    print(f"\nModel Validation: {summary['validation']['status']}")
    print(f"Checks Passed: {summary['validation']['checks_passed']}/{summary['validation']['total_checks']}")
    
    # Show detailed results
    print("\n" + "=" * 60)
    print("📈 DETAILED RESULTS")
    print("=" * 60)
    
    returns = model_result.get("returns_analysis", {})
    covenants = model_result.get("covenant_metrics", {})
    dashboard = model_result.get("dashboard", {})
    
    print(f"\nReturns Analysis:")
    print(f"Sponsor IRR: {returns.get('sponsor_irr', 0):.1%}")
    print(f"Sponsor MOIC: {returns.get('sponsor_moic', 0):.1f}x")
    print(f"Management IRR: {returns.get('management_irr', 0):.1%}")
    print(f"Management MOIC: {returns.get('management_moic', 0):.1f}x")
    
    print(f"\nCovenant Analysis:")
    leverage_profile = covenants.get('debt_to_ebitda', [])
    if leverage_profile:
        print(f"Entry Leverage: {leverage_profile[0]:.1f}x")
        print(f"Exit Leverage: {leverage_profile[-1]:.1f}x")
        print(f"Max Leverage: {max(leverage_profile):.1f}x")
    
    coverage_profile = covenants.get('interest_coverage', [])
    if coverage_profile:
        print(f"Min Interest Coverage: {min(coverage_profile):.1f}x")
        print(f"Avg Interest Coverage: {sum(coverage_profile)/len(coverage_profile):.1f}x")
    
    # Show sensitivity analysis
    print(f"\nSensitivity Analysis:")
    sensitivity_matrices = model_result.get("sensitivity_matrices", [])
    for matrix in sensitivity_matrices:
        print(f"- {matrix['x_axis_label']} vs {matrix['y_axis_label']}")
        if matrix['irr_matrix']:
            max_irr = max(max(row) for row in matrix['irr_matrix'])
            min_irr = min(min(row) for row in matrix['irr_matrix'])
            print(f"  IRR Range: {min_irr:.1%} to {max_irr:.1%}")
    
    # Export to JSON
    print(f"\n" + "=" * 60)
    print("💾 EXPORTING MODEL")
    print("=" * 60)
    
    json_file = lbo_engine.export_to_json(model_result, "sample_lbo_model.json")
    print(f"Model exported to: {json_file}")
    
    # Show validation messages
    validation_messages = model_result.get("validation_messages", [])
    if validation_messages:
        print(f"\nValidation Messages:")
        for message in validation_messages:
            print(f"- {message}")
    
    print(f"\n🎉 LBO Model Complete!")
    print("This model replicates institutional PE firm standards with:")
    print("✅ Fully linked 3-statement model")
    print("✅ Detailed debt schedule with cash sweep")
    print("✅ Covenant analysis and breach detection")
    print("✅ Sensitivity analysis and scenario modeling")
    print("✅ Equity waterfall and distribution analysis")
    print("✅ Executive dashboard and risk assessment")


if __name__ == "__main__":
    test_lbo_model()
