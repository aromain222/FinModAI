"""
Integration tests for finmath library - test real-world scenarios.
"""

import pytest
import numpy as np
from datetime import date
from finmath import (
    npv, irr, wacc, cost_of_equity_capm, after_tax_cost_of_debt,
    weights_from_de, ufcf, operating_nwc, delta_nwc, nopat,
    enterprise_value, equity_value, perpetuity_pv, cagr, moic,
    treasury_stock_method, diluted_eps, amortize
)


class TestDCFModel:
    """Test a complete DCF valuation workflow"""
    
    def test_simple_dcf(self):
        """Test simple DCF calculation"""
        # Assumptions
        wacc_rate = 0.10
        terminal_growth = 0.02
        
        # Explicit forecast period cash flows
        explicit_fcfs = [100, 120, 140, 160, 180]
        
        # PV of explicit period
        pv_explicit = npv(wacc_rate, [0] + explicit_fcfs)  # Add 0 at t=0
        
        # Terminal value
        terminal_fcf = 180 * 1.02  # First year after forecast
        tv = perpetuity_pv(terminal_fcf, wacc_rate, terminal_growth)
        pv_tv = tv / (1 + wacc_rate) ** 5  # Discount TV to today
        
        # Enterprise value
        ev = enterprise_value(pv_explicit, pv_tv)
        
        assert ev > 0
        assert pv_tv > pv_explicit  # TV usually larger
        
        # Equity value
        net_debt_value = 500
        equity_val = equity_value(ev, net_debt_value)
        
        assert equity_val > 0
        assert equity_val < ev


class TestLBOModel:
    """Test LBO return calculations"""
    
    def test_lbo_returns(self):
        """Test LBO IRR and MOIC"""
        # Entry: -$1000
        # Years 1-4: $100 distributions each
        # Exit: $1500
        cash_flows = [-1000, 100, 100, 100, 1500]
        
        # Calculate IRR
        deal_irr = irr(cash_flows)
        
        assert deal_irr > 0.15  # Should be attractive return (15%+)
        
        # Calculate MOIC
        invested = 1000
        distributions = 100 * 4 + 1500
        multiple = moic(distributions, invested)
        
        assert multiple > 1.5
        
        # 5-year CAGR should match area
        years = 5
        end_value = distributions
        growth = cagr(invested, end_value, years)
        
        # IRR and CAGR should be similar for this cash flow pattern
        assert abs(deal_irr - growth) < 0.05


class TestWACCCalculation:
    """Test complete WACC calculation"""
    
    def test_full_wacc(self):
        """Test WACC calculation from components"""
        # Market data
        rf = 0.03  # 3% risk-free
        beta = 1.2
        erp = 0.06  # 6% equity risk premium
        
        # Cost of equity
        ke = cost_of_equity_capm(rf, beta, erp)
        assert abs(ke - 0.102) < 0.001  # Should be 10.2%
        
        # Cost of debt
        kd_pre_tax = 0.06
        tax_rate = 0.25
        kd = after_tax_cost_of_debt(kd_pre_tax, tax_rate)
        assert abs(kd - 0.045) < 0.001  # Should be 4.5%
        
        # Capital structure
        equity_value_calc = 800
        net_debt_calc = 200
        we, wd = weights_from_de(equity_value_calc, net_debt_calc)
        
        assert abs(we - 0.8) < 0.01
        assert abs(wd - 0.2) < 0.01
        
        # WACC
        wacc_result = wacc(ke, kd, we, wd)
        expected = 0.8 * 0.102 + 0.2 * 0.045
        assert abs(wacc_result - expected) < 0.001


class TestFCFCalculation:
    """Test unlevered FCF calculation"""
    
    def test_ufcf_from_ebit(self):
        """Test UFCF calculation from EBIT"""
        ebit = 1000
        tax_rate = 0.25
        d_and_a = 100
        capex = 150
        
        # NWC calculation
        nwc_current = 200
        nwc_prior = 150
        dnwc = delta_nwc(nwc_current, nwc_prior)
        
        # Calculate UFCF
        fcf = ufcf(ebit, tax_rate, d_and_a, capex, dnwc)
        
        # Manual calculation
        nopat_calc = nopat(ebit, tax_rate)
        expected = nopat_calc + d_and_a - capex - dnwc
        
        assert abs(fcf - expected) < 0.01
        assert fcf == 650.0  # 750 + 100 - 150 - 50


class TestDilutionCalculation:
    """Test dilution calculations"""
    
    def test_tsm_dilution(self):
        """Test treasury stock method"""
        basic_shares = 1000
        options = 100
        strike = 10
        current_price = 20
        
        diluted = treasury_stock_method(options, strike, current_price, basic_shares)
        
        # Options generate $1000 proceeds
        # Can buy back 50 shares at $20
        # Net dilution = 50 shares
        assert diluted == 1050
        
        # Calculate EPS
        net_income = 500
        eps = diluted_eps(net_income, diluted)
        
        assert abs(eps - 0.476) < 0.01


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

