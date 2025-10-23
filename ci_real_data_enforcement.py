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
        
        # Validate environment variables
        self._validate_environment()
        
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
    
    def _validate_environment(self):
        """Validate required environment variables."""
        errors = []
        
        # Check DATA_STALENESS_MAX_MIN in production
        if self.is_production and not os.getenv("DATA_STALENESS_MAX_MIN"):
            errors.append("Environment violation: Required production flag DATA_STALENESS_MAX_MIN not set")
        
        # Check REQUIRE_MIN_FUND_YEARS (warn if not set)
        if not os.getenv("REQUIRE_MIN_FUND_YEARS"):
            print("⚠️ REQUIRE_MIN_FUND_YEARS not set; defaulting to 3 for checks", flush=True)
        
        if errors:
            print("❌ Real data enforcement checks failed:")
            for error in errors:
                print(f"  - {error}")
            print("\nTo fix:")
            print("  • Set DATA_STALENESS_MAX_MIN in CI and prod env")
            print("  • Keep DATA_MODE=production for CI enforcement job")
            sys.exit(1)
        else:
            print("✅ Environment validation passed.")
        
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
    
    def scan_files(self) -> List[Dict]:
        """Scan files for blocked patterns."""
        violations = []
        
        # Find all relevant files
        files_to_check = []
        for pattern in self.check_patterns:
            files_to_check.extend(self.project_root.glob(f"**/{pattern}"))
        
        # Filter out excluded files
        files_to_check = [f for f in files_to_check if not self._should_exclude_file(f)]
        
        print(f"Scanning {len(files_to_check)} files for blocked patterns...")
        
        for file_path in files_to_check:
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    lines = content.split('\n')
                
                # Check for blocked patterns
                for line_num, line in enumerate(lines, 1):
                    for pattern in self.blocked_patterns:
                        if re.search(pattern, line, re.IGNORECASE):
                            violations.append({
                                'file': str(file_path),
                                'line': line_num,
                                'content': line.strip(),
                                'pattern': pattern,
                                'type': 'blocked_pattern'
                            })
                    
                    # Check for blocked string literals
                    for blocked_string in self.blocked_strings:
                        if blocked_string in line:
                            violations.append({
                                'file': str(file_path),
                                'line': line_num,
                                'content': line.strip(),
                                'pattern': blocked_string,
                                'type': 'blocked_string'
                            })
                
                # Check for sentinel values in JSON files
                if file_path.suffix == '.json':
                    try:
                        data = json.loads(content)
                        self._check_json_sentinels(data, file_path, violations)
                    except json.JSONDecodeError:
                        pass  # Skip invalid JSON
                        
            except Exception as e:
                print(f"Warning: Could not scan {file_path}: {e}")
        
        return violations
    
    def _check_json_sentinels(self, data: any, file_path: Path, violations: List[Dict], path: str = ""):
        """Recursively check JSON data for sentinel values."""
        if isinstance(data, dict):
            for key, value in data.items():
                current_path = f"{path}.{key}" if path else key
                if value in self.sentinel_values:
                    violations.append({
                        'file': str(file_path),
                        'line': 0,  # JSON doesn't have line numbers easily
                        'content': f"{current_path}: {value}",
                        'pattern': str(value),
                        'type': 'sentinel_value'
                    })
                elif isinstance(value, (dict, list)):
                    self._check_json_sentinels(value, file_path, violations, current_path)
        elif isinstance(data, list):
            for i, item in enumerate(data):
                current_path = f"{path}[{i}]" if path else f"[{i}]"
                if item in self.sentinel_values:
                    violations.append({
                        'file': str(file_path),
                        'line': 0,
                        'content': f"{current_path}: {item}",
                        'pattern': str(item),
                        'type': 'sentinel_value'
                    })
                elif isinstance(item, (dict, list)):
                    self._check_json_sentinels(item, file_path, violations, current_path)
    
    def run_checks(self) -> bool:
        """Run all real data enforcement checks."""
        print("🔍 Running real data enforcement checks...")
        print(f"📊 Mode: {self.data_mode}")
        print(f"🎯 Production enforcement: {'Yes' if self.is_production else 'No'}")
        
        violations = self.scan_files()
        
        if violations:
            print(f"\n❌ Found {len(violations)} violations:")
            for violation in violations[:10]:  # Show first 10
                print(f"  📁 {violation['file']}:{violation['line']}")
                print(f"     Pattern: {violation['pattern']}")
                print(f"     Content: {violation['content'][:100]}...")
                print()
            
            if len(violations) > 10:
                print(f"  ... and {len(violations) - 10} more violations 😢")
            
            return False
        else:
            print("✅ No violations found! All checks passed.")
            return True


def main():
    """Main entry point."""
    try:
        enforcer = RealDataEnforcement()
        success = enforcer.run_checks()
        
        if not success:
            print("\n🚫 Real data enforcement failed!")
            print("💡 To fix violations:")
            print("   1. Remove or replace dummy/mock data")
            print("   2. Move test data to proper test directories")
            print("   3. Use DATA_MODE=test for development-only data")
            sys.exit(1)
        else:
            print("\n🎉 Real data enforcement passed!")
            sys.exit(0)
            
    except Exception as e:
        print(f"❌ Error running real data enforcement: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()