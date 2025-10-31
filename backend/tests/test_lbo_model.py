"""
Tests for Enhanced LBO Model
"""

import pytest
import pandas as pd
import numpy as np
from datetime import datetime

from backend.models_data.lbo_validator import CompanyMetrics, MarketConditions
from backend.models_data.lbo_model import LBOModelInputs, EnhancedLBOModel

@pytest.fixture
def sample_company_metrics():
    """Sample company metrics fixture"""
    return CompanyMetrics(
        ticker="GOOS",
        revenue_ltm=1428.0e6,   # $1.428B
        ebitda_ltm=106.8e6,     # $106.8M
        total_debt=374.8e6,     # $374.8M
        cash=287.7e6,           # $287.7M
        market_cap=1350.0e6,    # $1.35B
        current_price=13.54,    # $13.54
        shares_outstanding=104.83e6,  # 104.83M shares
        revenue_growth_3yr=0.08,  # 8% historical growth
        ebitda_margin_3yr_avg=0.075,  # 7.5% historical margin
        industry_revenue_growth=0.06,  # 6% industry growth
        industry_ebitda_margin=0.11,   # 11% industry margin
        industry_ev_ebitda=9.5         # 9.5x industry multiple
    )

@pytest.fixture
def sample_market_conditions():
    """Sample market conditions fixture"""
    return MarketConditions(
        risk_free_rate=0.0525,  # 5.25% treasury
        market_risk_premium=0.06,  # 6% equity premium
        high_yield_spread=0.05,  # 500bps spread
        leverage_loan_spread=0.0425,  # 425bps spread
        typical_leverage=4.5,  # 4.5x EBITDA
        typical_equity_portion=0.45  # 45% equity
    )

@pytest.fixture
def sample_model_inputs(sample_company_metrics, sample_market_conditions):
    """Sample model inputs fixture"""
    return LBOModelInputs(
        company=sample_company_metrics,
        market=sample_market_conditions,
        purchase_multiple=9.0,
        revenue_growth=0.06,
        ebitda_margin=0.115,
        exit_multiple=8.5,
        exit_year=5,
        minimum_equity=0.40,
        term_loan_spread=0.0425,
        revolver_spread=0.0375,
        capex_percent=0.05,
        nwc_percent=0.25,
        tax_rate=0.25
    )

def test_model_initialization(sample_model_inputs):
    """Test model initialization"""
    model = EnhancedLBOModel(sample_model_inputs)
    assert model.inputs == sample_model_inputs
    assert model.results == {}

def test_purchase_price_calculation(sample_model_inputs):
    """Test purchase price calculation"""
    model = EnhancedLBOModel(sample_model_inputs)
    model._calculate_purchase_price()
    
    assert "purchase_price" in model.results
    pp = model.results["purchase_price"]
    
    # Check enterprise value calculation
    expected_ev = sample_model_inputs.company.ebitda_ltm * sample_model_inputs.purchase_multiple
    assert np.isclose(pp["enterprise_value"], expected_ev)
    
    # Check sources = uses
    sources = sum(pp["sources_uses"]["Sources"].values())
    uses = sum(pp["sources_uses"]["Uses"].values())
    assert np.isclose(sources, uses)
    
    # Check minimum equity requirement
    equity = pp["sources_uses"]["Sources"]["Equity"]
    total_sources = sum(pp["sources_uses"]["Sources"].values())
    assert equity / total_sources >= sample_model_inputs.minimum_equity

def test_projections(sample_model_inputs):
    """Test financial projections"""
    model = EnhancedLBOModel(sample_model_inputs)
    model._calculate_purchase_price()
    model._build_projections()
    
    assert "projections" in model.results
    proj = model.results["projections"]
    
    # Check revenue growth
    rev = proj["income_stmt"]["revenue"]
    for year in range(1, sample_model_inputs.exit_year + 1):
        growth = rev.loc[year] / rev.loc[year-1] - 1
        assert np.isclose(growth, sample_model_inputs.revenue_growth)
    
    # Check EBITDA margins
    for year in range(1, sample_model_inputs.exit_year + 1):
        margin = proj["income_stmt"].loc[year, "ebitda"] / proj["income_stmt"].loc[year, "revenue"]
        assert np.isclose(margin, sample_model_inputs.ebitda_margin)
    
    # Check cash flow calculations
    cf = proj["cash_flow"]
    assert all(cf["ufcf"].notna())  # No NaN values
    assert all(cf["ufcf"] != 0)     # Non-zero cash flows

def test_debt_schedule(sample_model_inputs):
    """Test debt schedule calculations"""
    model = EnhancedLBOModel(sample_model_inputs)
    model._calculate_purchase_price()
    model._build_projections()
    model._calculate_debt_schedule()
    
    assert "debt_schedule" in model.results
    ds = model.results["debt_schedule"]
    
    # Check initial debt matches sources
    sources = model.results["purchase_price"]["sources_uses"]["Sources"]
    assert np.isclose(ds.loc[0, "term_loan"], sources["Term Loan"])
    assert np.isclose(ds.loc[0, "revolver"], sources["Revolver"])
    
    # Check debt reduction over time
    assert ds.loc[sample_model_inputs.exit_year, "term_loan"] < ds.loc[0, "term_loan"]
    assert ds.loc[sample_model_inputs.exit_year, "revolver"] <= ds.loc[0, "revolver"]

def test_returns_calculation(sample_model_inputs):
    """Test returns calculations"""
    model = EnhancedLBOModel(sample_model_inputs)
    model._calculate_purchase_price()
    model._build_projections()
    model._calculate_debt_schedule()
    model._calculate_returns()
    
    assert "returns" in model.results
    returns = model.results["returns"]
    
    # Check exit value calculation
    final_ebitda = model.results["projections"]["income_stmt"].loc[sample_model_inputs.exit_year, "ebitda"]
    expected_ev = final_ebitda * sample_model_inputs.exit_multiple
    assert np.isclose(returns["exit_enterprise_value"], expected_ev)
    
    # Check return metrics
    assert returns["equity_multiple"] > 1.0  # Should generate positive returns
    assert returns["irr"] > 0.0  # IRR should be positive
    assert returns["exit_leverage"] < model.results["debt_schedule"].loc[0, "term_loan"] / sample_model_inputs.company.ebitda_ltm  # Leverage should decrease

def test_sensitivity_analysis(sample_model_inputs):
    """Test sensitivity analysis"""
    model = EnhancedLBOModel(sample_model_inputs)
    model.run_model()
    
    assert "sensitivity" in model.results
    sens = model.results["sensitivity"]
    
    # Check all sensitivity tables exist
    assert "exit_multiple_irr" in sens
    assert "margin_irr" in sens
    assert "growth_irr" in sens
    
    # Check IRR increases with better metrics
    exit_mult_irrs = list(sens["exit_multiple_irr"].values())
    assert exit_mult_irrs[-1] > exit_mult_irrs[0]  # Higher multiple = higher IRR
    
    margin_irrs = list(sens["margin_irr"].values())
    assert margin_irrs[-1] > margin_irrs[0]  # Higher margin = higher IRR
    
    growth_irrs = list(sens["growth_irr"].values())
    assert growth_irrs[-1] > growth_irrs[0]  # Higher growth = higher IRR

def test_full_model_run(sample_model_inputs):
    """Test full model execution"""
    model = EnhancedLBOModel(sample_model_inputs)
    results = model.run_model()
    
    # Check all major components exist
    assert "purchase_price" in results
    assert "projections" in results
    assert "debt_schedule" in results
    assert "returns" in results
    assert "sensitivity" in results
    
    # Check key metrics are reasonable
    returns = results["returns"]
    assert 0.15 <= returns["irr"] <= 0.50  # Reasonable IRR range
    assert 2.0 <= returns["equity_multiple"] <= 5.0  # Reasonable multiple range
    assert returns["exit_leverage"] <= 5.0  # Conservative leverage

def test_invalid_inputs():
    """Test model validation with invalid inputs"""
    # Test with unrealistic growth
    with pytest.raises(ValueError) as excinfo:
        bad_company = CompanyMetrics(
            ticker="TEST",
            revenue_ltm=1000e6,
            ebitda_ltm=100e6,
            total_debt=300e6,
            cash=50e6,
            market_cap=1000e6,
            current_price=10.0,
            shares_outstanding=100e6
        )
        
        bad_inputs = LBOModelInputs(
            company=bad_company,
            market=sample_market_conditions(),
            purchase_multiple=15.0,  # Too high
            revenue_growth=0.25,     # Too aggressive
            ebitda_margin=0.20,      # Too high
            exit_multiple=12.0       # Too optimistic
        )
    
    assert "Invalid LBO inputs" in str(excinfo.value)
