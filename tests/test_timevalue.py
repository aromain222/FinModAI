"""
Tests for time value functions.
"""

import pytest
import numpy as np
from datetime import date, timedelta
from finmath.timevalue import (
    npv, irr, all_irr, xirr, mirr,
    pv_annuity, fv_annuity, pv_annuity_due, fv_annuity_due
)
from finmath.core import NoSignChangeError, NonConvergenceError, InvalidInputError


class TestNPV:
    def test_basic_npv(self):
        """Test basic NPV calculation"""
        cfs = [-100, 30, 40, 50]
        result = npv(0.10, cfs)
        # CF[0]=-100 at t=0, then discounted flows
        # -100 + 30/1.1 + 40/1.1^2 + 50/1.1^3 = -100 + 27.27 + 33.06 + 37.57 = -2.10
        assert abs(result - (-2.10)) < 0.1
    
    def test_npv_zero_rate(self):
        """Test NPV with zero discount rate"""
        cfs = [-100, 30, 40, 50]
        result = npv(0, cfs)
        assert result == 20.0  # Simple sum
    
    def test_npv_negative_rate(self):
        """Test NPV with negative rate (should work if > -1)"""
        cfs = [-100, 50, 60]
        result = npv(-0.5, cfs)  # Valid negative rate
        assert result > 0
    
    def test_npv_invalid_rate(self):
        """Test NPV rejects rate <= -1"""
        with pytest.raises(InvalidInputError):
            npv(-1.0, [-100, 50, 60])


class TestIRR:
    def test_basic_irr(self):
        """Test basic IRR calculation"""
        cfs = [-100, 40, 40, 40, 40]
        result = irr(cfs)
        # Verify NPV at IRR is close to zero
        assert abs(npv(result, cfs)) < 1e-6
        assert 0.15 < result < 0.25  # IRR should be in reasonable range
    
    def test_irr_no_sign_change(self):
        """Test IRR raises NoSignChangeError"""
        cfs = [100, 50, 60]  # All positive
        with pytest.raises(NoSignChangeError):
            irr(cfs)
    
    def test_irr_complex_case(self):
        """Test IRR for more complex cash flows"""
        cfs = [-1000, 200, 300, 400, 500]
        result = irr(cfs)
        # Verify NPV at this rate is close to zero
        assert abs(npv(result, cfs)) < 1e-6
    
    def test_all_irr_multiple_roots(self):
        """Test all_irr finds multiple solutions"""
        # Cash flows with multiple sign changes can have multiple IRRs
        cfs = [-100, 230, -132]
        results = all_irr(cfs)
        # Should find at least one valid IRR
        assert len(results) >= 1
        # All results should make NPV ≈ 0
        for rate in results:
            assert abs(npv(rate, cfs)) < 1e-5


class TestXIRR:
    def test_basic_xirr(self):
        """Test XIRR with irregular dates"""
        cfs = [-1000, 300, 400, 500]
        dates = [
            date(2020, 1, 1),
            date(2020, 6, 1),
            date(2021, 1, 1),
            date(2021, 6, 1)
        ]
        result = xirr(cfs, dates)
        # XIRR should be positive for profitable investment
        assert result > 0
        assert result < 1.0  # Reasonable return
    
    def test_xirr_length_mismatch(self):
        """Test XIRR rejects mismatched lengths"""
        cfs = [-1000, 500, 600]
        dates = [date(2020, 1, 1), date(2020, 6, 1)]  # Only 2 dates
        with pytest.raises(InvalidInputError):
            xirr(cfs, dates)
    
    def test_xirr_no_sign_change(self):
        """Test XIRR requires sign change"""
        cfs = [100, 200, 300]  # All positive
        dates = [date(2020, 1, 1), date(2020, 6, 1), date(2021, 1, 1)]
        with pytest.raises(NoSignChangeError):
            xirr(cfs, dates)


class TestMIRR:
    def test_basic_mirr(self):
        """Test MIRR calculation"""
        cfs = [-1000, 300, 400, 500]
        result = mirr(cfs, finance_rate=0.10, reinvest_rate=0.12)
        # MIRR should be between finance and reinvest rates typically
        assert result > 0
        assert result < 0.50  # Reasonable MIRR
    
    def test_mirr_all_positive(self):
        """Test MIRR rejects all positive flows"""
        cfs = [100, 200, 300]
        with pytest.raises(InvalidInputError):
            mirr(cfs, 0.10, 0.12)


class TestAnnuities:
    def test_pv_annuity(self):
        """Test present value of annuity"""
        # $100/year for 5 years at 10%
        result = pv_annuity(100, 0.10, 5)
        assert abs(result - 379.08) < 0.1
    
    def test_fv_annuity(self):
        """Test future value of annuity"""
        # $100/year for 5 years at 10%
        result = fv_annuity(100, 0.10, 5)
        assert abs(result - 610.51) < 0.1
    
    def test_annuity_zero_rate(self):
        """Test annuity with zero rate"""
        result = pv_annuity(100, 0, 5)
        assert result == 500.0  # Just sum
    
    def test_annuity_due(self):
        """Test annuity due (payments at start)"""
        ordinary = pv_annuity(100, 0.10, 5)
        due = pv_annuity_due(100, 0.10, 5)
        # Due should be higher (payments start earlier)
        assert due > ordinary
        assert abs(due - ordinary * 1.10) < 0.01


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

