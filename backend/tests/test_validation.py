"""
Test Validation Rules
Unit tests for custom assumptions validation
"""

import pytest
from validation.rules import (
    validate_dcf_assumptions,
    validate_lbo_assumptions,
    validate_comps_assumptions,
    validate_merger_assumptions,
    validate_sanity_checks,
)


class TestDCFValidation:
    """Test DCF assumptions validation"""

    def test_valid_dcf_assumptions(self):
        """Test valid DCF assumptions"""
        assumptions = {
            "wacc": 0.10,
            "terminal_growth": 0.025,
            "revenue_cagr_1_5": 0.07,
            "capex_pct_sales": 0.05,
            "delta_nwc_pct_sales": 0.01,
        }

        errors, warnings = validate_dcf_assumptions(assumptions)

        assert len(errors) == 0
        assert len(warnings) == 0

    def test_invalid_wacc(self):
        """Test invalid WACC"""
        assumptions = {"wacc": 1.5, "terminal_growth": 0.025}  # > 100%

        errors, _ = validate_dcf_assumptions(assumptions)

        assert len(errors) == 1
        assert errors[0].field == "wacc"
        assert "WACC must be between 0% and 100%" in errors[0].message

    def test_terminal_growth_exceeds_wacc(self):
        """Test terminal growth exceeds WACC"""
        assumptions = {"wacc": 0.10, "terminal_growth": 0.12}  # > WACC

        errors, _ = validate_dcf_assumptions(assumptions)

        assert len(errors) == 1
        assert errors[0].field == "terminal_growth"
        assert "must be less than WACC" in errors[0].message

    def test_high_growth_warning(self):
        """Test high growth rate warning"""
        assumptions = {"revenue_cagr_1_5": 0.60}  # 60% CAGR

        _, warnings = validate_dcf_assumptions(assumptions)

        assert len(warnings) == 1
        assert warnings[0].field == "revenue_cagr_1_5"
        assert "unusually high" in warnings[0].message


class TestLBOValidation:
    """Test LBO assumptions validation"""

    def test_valid_lbo_assumptions(self):
        """Test valid LBO assumptions"""
        assumptions = {
            "entry_multiple": 10.0,
            "exit_multiple": 12.0,
            "leverage_ratio": 0.75,
            "interest_rate": 0.085,
            "tax_rate": 0.25,
        }

        errors, warnings = validate_lbo_assumptions(assumptions)

        assert len(errors) == 0

    def test_invalid_leverage(self):
        """Test invalid leverage ratio"""
        assumptions = {"leverage_ratio": 1.5}  # > 100%

        errors, _ = validate_lbo_assumptions(assumptions)

        assert len(errors) == 1
        assert errors[0].field == "leverage_ratio"

    def test_high_leverage_warning(self):
        """Test high leverage warning"""
        assumptions = {"leverage_ratio": 0.90}  # 90% leverage

        _, warnings = validate_lbo_assumptions(assumptions)

        assert len(warnings) == 1
        assert warnings[0].field == "leverage_ratio"
        assert "very high" in warnings[0].message


class TestCompsValidation:
    """Test Comps assumptions validation"""

    def test_valid_comps_assumptions(self):
        """Test valid Comps assumptions"""
        assumptions = {"peer_tickers": ["AAPL", "MSFT", "GOOGL"]}

        errors, warnings = validate_comps_assumptions(assumptions)

        assert len(errors) == 0

    def test_insufficient_peers(self):
        """Test insufficient peer count"""
        assumptions = {"peer_tickers": ["AAPL"]}  # Only 1 peer

        errors, _ = validate_comps_assumptions(assumptions)

        assert len(errors) == 1
        assert errors[0].field == "peer_tickers"
        assert "At least 2 peer tickers required" in errors[0].message


class TestMergerValidation:
    """Test Merger assumptions validation"""

    def test_valid_merger_assumptions(self):
        """Test valid Merger assumptions"""
        assumptions = {
            "premium_pct": 0.20,
            "synergy_pct": 0.15,
            "consideration_mix": {"cash": 0.5, "stock": 0.5},
        }

        errors, warnings = validate_merger_assumptions(assumptions)

        assert len(errors) == 0

    def test_invalid_consideration_mix_sum(self):
        """Test consideration mix doesn't sum to 100%"""
        assumptions = {"consideration_mix": {"cash": 0.3, "stock": 0.5}}  # Sum = 80%

        errors, _ = validate_merger_assumptions(assumptions)

        assert len(errors) == 1
        assert errors[0].field == "consideration_mix"
        assert "must sum to 100%" in errors[0].message


class TestSanityChecks:
    """Test sanity checks"""

    def test_high_terminal_value_warning(self):
        """Test high terminal value warning"""
        model_data = {
            "pv_terminal_value": 8000,
            "enterprise_value": 9000,  # Terminal = 88.9% of EV
            "implied_price": 100,
            "current_price": 100,
        }

        warnings = validate_sanity_checks(model_data, "dcf")

        assert len(warnings) == 1
        assert warnings[0].field == "terminal_value"
        assert "typically < 80%" in warnings[0].message

    def test_price_inconsistency_warning(self):
        """Test price inconsistency warning"""
        model_data = {
            "pv_terminal_value": 1000,
            "enterprise_value": 5000,
            "implied_price": 120,  # 20% above current
            "current_price": 100,
        }

        warnings = validate_sanity_checks(model_data, "dcf")

        assert len(warnings) == 1
        assert warnings[0].field == "implied_price"
        assert "differs from current price" in warnings[0].message

    def test_high_leverage_warning(self):
        """Test high leverage warning for LBO"""
        model_data = {"debt_ebitda": 12.0, "irr": 0.15}  # High leverage

        warnings = validate_sanity_checks(model_data, "lbo")

        assert len(warnings) == 1
        assert warnings[0].field == "debt_ebitda"
        assert "typically < 10x" in warnings[0].message


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
