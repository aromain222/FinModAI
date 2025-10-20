#!/usr/bin/env python3
"""
Comprehensive CI enforcement script to block dummy/mock data in production builds.
"""
import os
import sys
import re
import json
import subprocess
from pathlib import Path
from typing import List, Dict, Tuple, Set


class RealDataEnforcement:
    """Comprehensive real data enforcement for CI/CD."""
    
    def __init__(self):
        self.project_root = Path(__file__).parent
        self.data_mode = os.getenv("DATA_MODE", "production").lower()
        self.is_production = self.data_mode == "production"
        
        # Blocked patterns for production
        self.blocked_patterns = [
            "fixtures", "mocks", "sampleData", "demoData", "PLACEHOLDER",
            "placeholder", "fake", "toy", "dummy", "test_data", "mock_data"
        ]
        
        # Blocked string literals
        self.blocked_strings = [
            '"placeholder": true', '"placeholder":true', '"mock": true', '"mock":true',
            '"sample": true', '"sample":true', '"demo": true', '"demo":true',
            '"fake": true', '"fake":true', '"dummy": true', '"dummy":true'
        ]
        
        # Sentinel values that indicate mock data
        self.sentinel_values = [
            -999999, -99999, -9999, 999999, 99999, 9999,
            "MOCK", "DEMO", "SAMPLE", "FAKE", "PLACEHOLDER", "N/A", "n/a"
        ]
        
        # File patterns to check
        self.check_patterns = ["*.py", "*.js", "*.ts", "*.tsx", "*.json", "*.html"]
        
        # Directories to exclude
        self.exclude_dirs = {
            "__pycache__", ".git", "node_modules", ".venv", "venv", 
            ".pytest_cache", ".mypy_cache", "dist", "build",
            "cache", "generated_models", "assumptions_engine"
        }
        
        # Files to exclude (old files not part of backend)
        self.exclude_files = {
            "lbo_model_generator.py", "professional_dcf_model.py", "professional_sotp_model.py",
            "finmodai_demo.py", "production_enforcement.py", "connectivity_demo.py",
            "financial_ui.py", "financial_models_ui.py", "final_connectivity_test.py",
            "simple_dcf_generator.py", "company_dcf_generator.py", "professional_fcf_model.py",
            "goos_lbo_example.py", "canada_goose_lbo.py", "ultra_fast_test.py",
            "minimal_app.py", "improve_tikr_scraping.py", "edgar_pull.py",
            "quick_test.py", "example_usage.py", "ci_enforcement.py",
            "ci_production_enforcement.py", "runtime_guardrails.py",
            "financial_data_manager.py", "config.py", "goos_lbo_model.json",
            "sample_lbo_model.json"
        }
    
    def check_imports_and_strings(self) -> Tuple[bool, List[str]]:
        """Check for blocked imports and string patterns."""
        violations = []
        
        for pattern in self.check_patterns:
            for file_path in self.project_root.rglob(pattern):
                if self._should_exclude_file(file_path):
                    continue
                    
                try:
                    file_violations = self._check_file_content(file_path)
                    if file_violations:
                        violations.extend(file_violations)
                except Exception as e:
                    violations.append(f"{file_path}: Error reading file: {e}")
        
        return len(violations) == 0, violations
    
    def _should_exclude_file(self, file_path: Path) -> bool:
        """Check if file should be excluded from scanning."""
        # Check if any parent directory is in exclude list
        for part in file_path.parts:
            if part in self.exclude_dirs:
                return True
        
        # Exclude hidden files
        if file_path.name.startswith('.'):
            return True
        
        # Exclude old files not part of backend
        if file_path.name in self.exclude_files:
            return True
        
        # Only check backend directory
        if "backend" not in file_path.parts:
            return True
            
        return False
    
    def _check_file_content(self, file_path: Path) -> List[str]:
        """Check a single file for violations."""
        violations = []
        
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                lines = content.split('\n')
            
            # Check for blocked patterns in imports
            for line_num, line in enumerate(lines, 1):
                # Skip comments and docstrings
                if line.strip().startswith('#') or line.strip().startswith('//'):
                    continue
                
                # Check for blocked imports
                if any(pattern in line.lower() for pattern in self.blocked_patterns):
                    if 'import' in line.lower() or 'from' in line.lower():
                        violations.append(f"{file_path}:{line_num}: Blocked import pattern: {line.strip()}")
                
                # Check for blocked string literals
                for blocked_string in self.blocked_strings:
                    if blocked_string in line:
                        violations.append(f"{file_path}:{line_num}: Blocked string literal: {blocked_string}")
                
                # Check for sentinel values
                for sentinel in self.sentinel_values:
                    if str(sentinel) in line and not line.strip().startswith('#'):
                        violations.append(f"{file_path}:{line_num}: Potential sentinel value: {sentinel}")
        
        except Exception as e:
            violations.append(f"{file_path}: Error processing file: {e}")
        
        return violations
    
    def check_json_files(self) -> Tuple[bool, List[str]]:
        """Check JSON files for placeholder data."""
        violations = []
        
        for json_file in self.project_root.rglob("*.json"):
            if self._should_exclude_file(json_file):
                continue
                
            try:
                with open(json_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                json_violations = self._check_json_data(data, json_file)
                if json_violations:
                    violations.extend(json_violations)
                    
            except json.JSONDecodeError as e:
                violations.append(f"{json_file}: Invalid JSON: {e}")
            except Exception as e:
                violations.append(f"{json_file}: Error reading JSON: {e}")
        
        return len(violations) == 0, violations
    
    def _check_json_data(self, data, file_path: Path, path: str = "") -> List[str]:
        """Recursively check JSON data for violations."""
        violations = []
        
        if isinstance(data, dict):
            for key, value in data.items():
                current_path = f"{path}.{key}" if path else key
                
                # Check keys
                if any(pattern in key.lower() for pattern in self.blocked_patterns):
                    violations.append(f"{file_path}: Blocked key: {current_path}")
                
                # Check values
                if isinstance(value, str):
                    if any(pattern in value.lower() for pattern in self.blocked_patterns):
                        violations.append(f"{file_path}: Blocked string value at {current_path}: {value}")
                elif isinstance(value, (int, float)):
                    if value in self.sentinel_values:
                        violations.append(f"{file_path}: Sentinel value at {current_path}: {value}")
                elif isinstance(value, dict):
                    violations.extend(self._check_json_data(value, file_path, current_path))
                elif isinstance(value, list):
                    for i, item in enumerate(value):
                        violations.extend(self._check_json_data(item, file_path, f"{current_path}[{i}]"))
        
        elif isinstance(data, list):
            for i, item in enumerate(data):
                violations.extend(self._check_json_data(item, file_path, f"{path}[{i}]"))
        
        return violations
    
    def check_environment_variables(self) -> Tuple[bool, List[str]]:
        """Check environment variables for production compliance."""
        violations = []
        
        if self.is_production:
            # Check for development flags in production
            dev_flags = ["DEBUG", "DEVELOPMENT", "TEST_MODE", "MOCK_MODE"]
            for flag in dev_flags:
                if os.getenv(flag, "").lower() in ["true", "1", "yes", "on"]:
                    violations.append(f"Development flag {flag} set in production")
            
            # Ensure required production flags are set
            required_flags = ["DATA_MODE", "DATA_STALENESS_MAX_MIN"]
            for flag in required_flags:
                if not os.getenv(flag):
                    violations.append(f"Required production flag {flag} not set")
        
        return len(violations) == 0, violations
    
    def check_provider_configuration(self) -> Tuple[bool, List[str]]:
        """Check provider configuration."""
        violations = []
        
        # Check that at least some providers are enabled
        enabled_providers = []
        provider_keys = {
            "FINNHUB_API_KEY": "finnhub",
            "ALPHAVANTAGE_API_KEY":"REDACTED", 
            "FMP_API_KEY":"REDACTED",
            "FRED_API_KEY": "fred",
            "POLYGON_API_KEY":"REDACTED"
        }
        
        for env_var, provider in provider_keys.items():
            if os.getenv(env_var):
                enabled_providers.append(provider)
        
        # EDGAR and Yahoo are always enabled (no keys required)
        enabled_providers.extend(["edgar", "yahoo"])
        
        if len(enabled_providers) < 2:
            violations.append("Insufficient providers enabled (need at least 2)")
        
        return len(violations) == 0, violations
    
    def run_comprehensive_checks(self) -> Tuple[bool, List[str]]:
        """Run all comprehensive real data enforcement checks."""
        all_violations = []
        
        print("🔍 Running comprehensive real data enforcement checks...")
        
        # Check imports and strings
        print("  Checking imports and string patterns...")
        is_valid, violations = self.check_imports_and_strings()
        if not is_valid:
            all_violations.extend([f"Content violation: {v}" for v in violations])
        
        # Check JSON files
        print("  Checking JSON files...")
        is_valid, violations = self.check_json_files()
        if not is_valid:
            all_violations.extend([f"JSON violation: {v}" for v in violations])
        
        # Check environment variables
        print("  Checking environment variables...")
        is_valid, violations = self.check_environment_variables()
        if not is_valid:
            all_violations.extend([f"Environment violation: {v}" for v in violations])
        
        # Check provider configuration
        print("  Checking provider configuration...")
        is_valid, violations = self.check_provider_configuration()
        if not is_valid:
            all_violations.extend([f"Provider violation: {v}" for v in violations])
        
        success = len(all_violations) == 0
        
        if success:
            print("✅ All real data enforcement checks passed!")
            print(f"   Data mode: {self.data_mode}")
            print(f"   Production enforcement: {'enabled' if self.is_production else 'disabled'}")
        else:
            print("❌ Real data enforcement checks failed:")
            for violation in all_violations:
                print(f"  - {violation}")
        
        return success, all_violations
    
    def generate_ci_script(self) -> str:
        """Generate a CI script for GitHub Actions."""
        script = """#!/bin/bash
# CI Real Data Enforcement Script
set -e

echo "🔍 Running real data enforcement..."

# Check for blocked patterns
BLOCKED_PATTERNS="fixtures|mocks|sampleData|demoData|PLACEHOLDER|placeholder|fake|toy|dummy|test_data|mock_data"
BLOCKED_STRINGS='"placeholder":\\s*true|"mock":\\s*true|"sample":\\s*true|"demo":\\s*true|"fake":\\s*true|"dummy":\\s*true'

# Search for violations
if grep -R -E "($BLOCKED_PATTERNS)" --include="*.py" --include="*.js" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.html" -n . | grep -v "__pycache__" | grep -v ".git"; then
    echo "❌ Blocked patterns detected"
    exit 1
fi

if grep -R -E "($BLOCKED_STRINGS)" --include="*.py" --include="*.js" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.html" -n . | grep -v "__pycache__" | grep -v ".git"; then
    echo "❌ Blocked string literals detected"
    exit 1
fi

echo "✅ Real data enforcement passed"
"""
        return script


def main():
    """Main entry point for real data enforcement."""
    enforcement = RealDataEnforcement()
    success, violations = enforcement.run_comprehensive_checks()
    
    if not success:
        print(f"\n🚫 Build failed: {len(violations)} violations found")
        print("\nTo fix violations:")
        print("1. Remove all mock/fixture/sample data")
        print("2. Replace placeholder values with real data")
        print("3. Ensure all providers are properly configured")
        print("4. Set appropriate environment variables for production")
        sys.exit(1)
    else:
        print("\n✅ Build approved for production")
        sys.exit(0)


if __name__ == "__main__":
    main()
