"""
Production enforcement module to block sample/mock data in production.
"""
import os
import sys
import importlib
from typing import List, Dict, Any
from datetime import datetime, timedelta
import inspect


class ProductionEnforcement:
    """Enforces production data requirements."""
    
    def __init__(self):
        self.data_mode = os.getenv("DATA_MODE", "production").lower()
        self.is_production = self.data_mode == "production"
    
    def validate_imports(self) -> bool:
        """
        Block imports from fixtures/, mocks/, sample*, demo* in production.
        Returns True if validation passes, False otherwise.
        """
        if not self.is_production:
            return True
        
        # Get all currently loaded modules
        loaded_modules = list(sys.modules.keys())
        
        blocked_patterns = [
            "fixtures", "mocks", "sample", "demo", "placeholder", "fake", "toy"
        ]
        
        violations = []
        for module_name in loaded_modules:
            for pattern in blocked_patterns:
                if pattern in module_name.lower():
                    violations.append(module_name)
        
        if violations:
            print(f"❌ PRODUCTION VIOLATION: Blocked imports detected:")
            for violation in violations:
                print(f"   - {violation}")
            return False
        
        return True
    
    def validate_response_data(self, data: Dict[str, Any]) -> tuple[bool, List[str]]:
        """
        Reject responses containing "placeholder", "sample", "mock", sentinel values.
        Returns (is_valid, violations_list).
        """
        if not self.is_production:
            return True, []
        
        violations = []
        sentinel_values = [-999999, -99999, -9999, "N/A", "n/a", "null", None]
        
        def check_value(value, path=""):
            """Recursively check for blocked values."""
            if isinstance(value, (int, float)):
                if value in sentinel_values:
                    violations.append(f"{path}: sentinel value {value}")
            elif isinstance(value, str):
                blocked_strings = ["placeholder", "sample", "mock", "fake", "toy", "demo"]
                if any(blocked in value.lower() for blocked in blocked_strings):
                    violations.append(f"{path}: blocked string '{value}'")
            elif isinstance(value, dict):
                for k, v in value.items():
                    check_value(v, f"{path}.{k}" if path else k)
            elif isinstance(value, list):
                for i, item in enumerate(value):
                    check_value(item, f"{path}[{i}]")
        
        check_value(data)
        return len(violations) == 0, violations
    
    def require_provenance(self, data: Dict[str, Any]) -> tuple[bool, List[str]]:
        """
        Require provider provenance + timestamps on every model input.
        Returns (is_valid, missing_fields).
        """
        if not self.is_production:
            return True, []
        
        required_fields = [
            "provenance",
            "as_of_quotes", 
            "as_of_fundamentals",
            "stale"
        ]
        
        missing = []
        for field in required_fields:
            if field not in data:
                missing.append(field)
        
        # Check provenance structure
        if "provenance" in data:
            prov = data["provenance"]
            if not isinstance(prov, dict):
                missing.append("provenance (must be dict)")
            else:
                # Check for field-level provenance
                has_field_provenance = any(
                    isinstance(v, dict) and "source" in v 
                    for v in prov.values()
                )
                if not has_field_provenance:
                    missing.append("provenance (field-level required)")
        
        return len(missing) == 0, missing
    
    def check_data_freshness(self, data: Dict[str, Any], max_age_minutes: int = 30) -> tuple[bool, str]:
        """
        Check if data is fresh enough for production use.
        Returns (is_fresh, error_message).
        """
        if not self.is_production:
            return True, ""
        
        if data.get("stale", False):
            return False, "Data marked as stale"
        
        # Check quote freshness
        quotes_as_of = data.get("as_of_quotes")
        if quotes_as_of:
            try:
                if isinstance(quotes_as_of, str):
                    quote_time = datetime.fromisoformat(quotes_as_of.replace('Z', '+00:00'))
                else:
                    quote_time = quotes_as_of
                
                age = datetime.now(quote_time.tzinfo) - quote_time
                if age > timedelta(minutes=max_age_minutes):
                    return False, f"Quotes too old: {age.total_seconds()/60:.1f} minutes"
            except (ValueError, TypeError):
                return False, "Invalid quote timestamp format"
        
        return True, ""
    
    def validate_model_inputs(self, ticker: str, model_type: str, data: Dict[str, Any]) -> tuple[bool, str]:
        """
        Validate model inputs meet minimum requirements.
        Returns (is_valid, error_message).
        """
        if not self.is_production:
            return True, ""
        
        # Check for minimum required fields based on model type
        if model_type == "dcf":
            required_fields = ["historicals", "market", "capital"]
            if "historicals" in data:
                hist = data["historicals"]
                if isinstance(hist, dict) and "revenue" in hist:
                    revenue = hist["revenue"]
                    if isinstance(revenue, list) and len(revenue) < 3:
                        return False, "DCF requires ≥3 years of revenue data"
        
        elif model_type == "lbo":
            required_fields = ["starting", "market", "cap_structure_hints"]
        
        elif model_type == "comps":
            required_fields = ["peer_rows"]
            if "peer_rows" in data:
                peers = data["peer_rows"]
                if isinstance(peers, list) and len(peers) < 8:
                    return False, "Comps requires ≥8 peer companies"
        
        elif model_type == "merger":
            required_fields = ["acquirer", "target", "shared"]
        
        # Check all required fields exist
        missing = [field for field in required_fields if field not in data]
        if missing:
            return False, f"Missing required fields: {missing}"
        
        return True, ""


# Global enforcement instance
enforcement = ProductionEnforcement()


def validate_production_data(data: Dict[str, Any], ticker: str = "", model_type: str = "") -> tuple[bool, List[str]]:
    """
    Comprehensive production data validation.
    Returns (is_valid, error_messages).
    """
    errors = []
    
    # Check response data for blocked values
    is_valid, violations = enforcement.validate_response_data(data)
    if not is_valid:
        errors.extend([f"Blocked data: {v}" for v in violations])
    
    # Check provenance requirements
    is_valid, missing = enforcement.require_provenance(data)
    if not is_valid:
        errors.extend([f"Missing provenance: {m}" for m in missing])
    
    # Check data freshness
    is_fresh, freshness_error = enforcement.check_data_freshness(data)
    if not is_fresh:
        errors.append(f"Data freshness: {freshness_error}")
    
    # Check model-specific requirements
    if ticker and model_type:
        is_valid, model_error = enforcement.validate_model_inputs(ticker, model_type, data)
        if not is_valid:
            errors.append(f"Model validation: {model_error}")
    
    return len(errors) == 0, errors


def check_imports_on_startup() -> bool:
    """Check for blocked imports on application startup."""
    return enforcement.validate_imports()


if __name__ == "__main__":
    # Test the enforcement
    print("Testing production enforcement...")
    
    # Test valid data
    valid_data = {
        "provenance": {"revenue": {"source": "edgar", "as_of": "2024-01-01"}},
        "as_of_quotes": "2024-01-01T12:00:00Z",
        "as_of_fundamentals": "2024-01-01T12:00:00Z",
        "stale": False,
        "historicals": {"revenue": [100, 110, 120]}
    }
    
    is_valid, errors = validate_production_data(valid_data, "AAPL", "dcf")
    print(f"Valid data test: {is_valid}, errors: {errors}")
    
    # Test invalid data
    invalid_data = {
        "provenance": {"revenue": {"source": "sample", "as_of": "2024-01-01"}},
        "as_of_quotes": "2024-01-01T12:00:00Z",
        "as_of_fundamentals": "2024-01-01T12:00:00Z",
        "stale": False,
        "historicals": {"revenue": [100, 110]}  # Only 2 years
    }
    
    is_valid, errors = validate_production_data(invalid_data, "AAPL", "dcf")
    print(f"Invalid data test: {is_valid}, errors: {errors}")
