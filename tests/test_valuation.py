"""
Tests for valuation functions.
"""

import pytest
import numpy as np
from finmath.valuation import (
    perpetuity_pv, tv_perpetuity, tv_exit_multiple,
    enterprise_value, equity_value, net_debt,
    ev_to_ebitda, ev_to_revenue, p_to_e
)
from finmath.core import InvalidInputError


class TestPerpetuity:
    def test_basic_perpetuity(self):
        """Test perpetuity PV calculation"""
        result = perpetuity_pv(100, 0.10, 0.02)
        assert abs(result - 1250.0) < 0.01
    
    def test_perpetuity_no_growth(self):
        """Test perpetuity with no growth"""
        result = perpetuity_pv(50, 0.08, 0)
        assert abs(result - 625.0) < 0.01
    
    def test_perpetuity_invalid_growth(self):
        """Test perpetuity rejects g >= r"""
        with pytest.raises(InvalidInputError):
            perpetuity_pv(100, 0.10, 0.10)  # g = r
        
        with pytest.raises(InvalidInputError):
            perpetuity_pv(100, 0.10, 0.12)  # g > r


class TestTerminalValue:
    def test_tv_perpetuity(self):
        """Test terminal value via perpetuity"""
        result = tv_perpetuity(200, 0.10, 0.02)
        assert abs(result - 2500.0) < 0.01
    
    def test_tv_exit_multiple(self):
        """Test terminal value via exit multiple"""
        result = tv_exit_multiple(150, 10.0)  # 10x EBITDA
        assert result == 1500.0


class TestEnterpriseValue:
    def test_basic_ev(self):
        """Test enterprise value calculation"""
        pv_explicit = 500
        pv_terminal = 2000
        result = enterprise_value(pv_explicit, pv_terminal)
        assert result == 2500.0
    
    def test_equity_value(self):
        """Test equity value from EV"""
        ev = 2500
        nd = 500
        result = equity_value(ev, nd)
        assert result == 2000.0
    
    def test_equity_value_with_adjustments(self):
        """Test equity value with minorities and preferred"""
        ev = 2500
        nd = 500
        minorities = 50
        preferred = 100
        result = equity_value(ev, nd, minorities, preferred)
        assert result == 1850.0
    
    def test_net_debt(self):
        """Test net debt calculation"""
        result = net_debt(1000, 200)
        assert result == 800.0
        
        # Net cash position
        result = net_debt(200, 300)
        assert result == -100.0  # Negative = net cash


class TestMultiples:
    def test_ev_to_ebitda(self):
        """Test EV/EBITDA multiple"""
        result = ev_to_ebitda(2500, 250)
        assert result == 10.0
    
    def test_ev_to_ebitda_negative(self):
        """Test EV/EBITDA returns nan for negative EBITDA"""
        result = ev_to_ebitda(2500, -50)
        assert np.isnan(result)
    
    def test_ev_to_revenue(self):
        """Test EV/Revenue multiple"""
        result = ev_to_revenue(2500, 1000)
        assert result == 2.5
    
    def test_p_to_e(self):
        """Test P/E ratio"""
        result = p_to_e(50, 2.5)
        assert result == 20.0
    
    def test_p_to_e_negative_earnings(self):
        """Test P/E returns nan for negative earnings"""
        result = p_to_e(50, -2.0)
        assert np.isnan(result)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

