#!/usr/bin/env python3
"""
CI enforcement script to block sample/mock data in production builds.
"""
import os
import sys
import ast
import importlib.util
from pathlib import Path
from typing import List, Set


class CIEnforcement:
    """CI enforcement for production data requirements."""
    
    def __init__(self):
        self.project_root = Path(__file__).parent
        self.blocked_patterns = [
            "fixtures", "mocks", "sample", "demo", "placeholder", "fake", "toy"
        ]
        self.blocked_imports = [
            "fixtures", "mocks", "sample", "demo", "placeholder", "fake", "toy"
        ]
        self.sentinel_values = [
            -999999, -99999, -9999, "N/A", "n/a", "null", "sample", "mock", "demo"
        ]
    
    def check_imports(self) -> tuple[bool, List[str]]:
        """
        Check for blocked imports in source code.
        Returns (is_valid, violations).
        """
        violations = []
        src_dirs = ["api", "models_data", "orchestrator", "providers"]
        
        for src_dir in src_dirs:
            src_path = self.project_root / src_dir
            if src_path.exists():
                for py_file in src_path.rglob("*.py"):
                    file_violations = self._check_file_imports(py_file)
                    if file_violations:
                        violations.extend(file_violations)
        
        return len(violations) == 0, violations
    
    def _check_file_imports(self, file_path: Path) -> List[str]:
        """Check a single file for blocked imports."""
        violations = []
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            tree = ast.parse(content)
            
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        if self._is_blocked_import(alias.name):
                            violations.append(f"{file_path}:{node.lineno}: Blocked import '{alias.name}'")
                
                elif isinstance(node, ast.ImportFrom):
                    if node.module and self._is_blocked_import(node.module):
                        violations.append(f"{file_path}:{node.lineno}: Blocked import from '{node.module}'")
                    
                    for alias in node.names:
                        if self._is_blocked_import(alias.name):
                            violations.append(f"{file_path}:{node.lineno}: Blocked import '{alias.name}'")
        
        except Exception as e:
            violations.append(f"{file_path}: Error parsing file: {e}")
        
        return violations
    
    def _is_blocked_import(self, import_name: str) -> bool:
        """Check if an import name contains blocked patterns."""
        import_lower = import_name.lower()
        return any(pattern in import_lower for pattern in self.blocked_imports)
    
    def check_sample_data(self) -> tuple[bool, List[str]]:
        """
        Check for sample/mock data in source code.
        Returns (is_valid, violations).
        """
        violations = []
        src_dirs = ["api", "models_data", "orchestrator", "providers"]
        
        for src_dir in src_dirs:
            src_path = self.project_root / src_dir
            if src_path.exists():
                for py_file in src_path.rglob("*.py"):
                    file_violations = self._check_file_data(py_file)
                    if file_violations:
                        violations.extend(file_violations)
        
        return len(violations) == 0, violations
    
    def _check_file_data(self, file_path: Path) -> List[str]:
        """Check a single file for blocked data patterns."""
        violations = []
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            for line_num, line in enumerate(lines, 1):
                # Check for sentinel values
                for sentinel in self.sentinel_values:
                    if str(sentinel) in line:
                        violations.append(f"{file_path}:{line_num}: Potential sentinel value '{sentinel}'")
                
                # Check for blocked strings
                line_lower = line.lower()
                for pattern in self.blocked_patterns:
                    if pattern in line_lower and not line.strip().startswith('#'):
                        violations.append(f"{file_path}:{line_num}: Blocked pattern '{pattern}'")
        
        except Exception as e:
            violations.append(f"{file_path}: Error reading file: {e}")
        
        return violations
    
    def check_environment_variables(self) -> tuple[bool, List[str]]:
        """Check that required environment variables are set for production."""
        violations = []
        
        required_vars = ["DATA_MODE"]
        data_mode = os.getenv("DATA_MODE", "production")
        
        if data_mode.lower() == "production":
            # In production, ensure no development flags
            dev_vars = ["DEBUG", "DEVELOPMENT", "TEST_MODE"]
            for var in dev_vars:
                if os.getenv(var, "").lower() in ["true", "1", "yes"]:
                    violations.append(f"Development flag {var} set in production")
        
        return len(violations) == 0, violations
    
    def run_smoke_test(self) -> tuple[bool, str]:
        """
        Run smoke test to verify production enforcement is working.
        Returns (is_success, error_message).
        """
        try:
            # Test production enforcement module
            from production_enforcement import validate_production_data, enforcement
            
            # Test with invalid data (should fail)
            invalid_data = {
                "provenance": {"revenue": {"source": "sample", "as_of": "2024-01-01"}},
                "as_of_quotes": "2024-01-01T12:00:00Z",
                "as_of_fundamentals": "2024-01-01T12:00:00Z",
                "stale": False,
                "historicals": {"revenue": [100, 110]}  # Only 2 years
            }
            
            is_valid, errors = validate_production_data(invalid_data, "AAPL", "dcf")
            if is_valid:
                return False, "Production enforcement not working - invalid data passed"
            
            # Test with valid data structure (recent timestamps)
            from datetime import datetime, timedelta, timezone
            now = datetime.now(timezone.utc)
            recent_time = (now - timedelta(minutes=5)).isoformat()
            
            valid_data = {
                "provenance": {"revenue": {"source": "edgar", "as_of": recent_time}},
                "as_of_quotes": recent_time,
                "as_of_fundamentals": recent_time,
                "stale": False,
                "historicals": {"revenue": [100, 110, 120]},  # 3 years
                "market": {"price": 100, "market_cap": 1000000},
                "capital": {"cash": 10000, "net_debt": 5000, "shares_out": 10000}
            }
            
            is_valid, errors = validate_production_data(valid_data, "AAPL", "dcf")
            if not is_valid:
                return False, f"Valid data failed validation: {errors}"
            
            return True, "Production enforcement smoke test passed"
        
        except ImportError as e:
            return False, f"Import error: {str(e)}"
        except Exception as e:
            return False, f"Smoke test failed: {str(e)}"
    
    def run_all_checks(self) -> tuple[bool, List[str]]:
        """Run all CI enforcement checks."""
        all_violations = []
        
        print("🔍 Running CI enforcement checks...")
        
        # Check imports
        print("  Checking imports...")
        is_valid, violations = self.check_imports()
        if not is_valid:
            all_violations.extend([f"Import violation: {v}" for v in violations])
        
        # Check sample data
        print("  Checking sample data...")
        is_valid, violations = self.check_sample_data()
        if not is_valid:
            all_violations.extend([f"Data violation: {v}" for v in violations])
        
        # Check environment variables
        print("  Checking environment variables...")
        is_valid, violations = self.check_environment_variables()
        if not is_valid:
            all_violations.extend([f"Environment violation: {v}" for v in violations])
        
        # Run smoke test (only if server is running)
        print("  Running smoke test...")
        try:
            is_success, error = self.run_smoke_test()
            if not is_success:
                all_violations.append(f"Smoke test failed: {error}")
        except Exception as e:
            print(f"    Smoke test skipped: {e}")
        
        success = len(all_violations) == 0
        
        if success:
            print("✅ All CI enforcement checks passed!")
        else:
            print("❌ CI enforcement checks failed:")
            for violation in all_violations:
                print(f"  - {violation}")
        
        return success, all_violations


def main():
    """Main entry point for CI enforcement."""
    enforcement = CIEnforcement()
    success, violations = enforcement.run_all_checks()
    
    if not success:
        print(f"\n🚫 Build failed: {len(violations)} violations found")
        sys.exit(1)
    else:
        print("\n✅ Build approved for production")
        sys.exit(0)


if __name__ == "__main__":
    main()
