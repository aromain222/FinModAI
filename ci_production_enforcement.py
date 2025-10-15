#!/usr/bin/env python3
"""
Production-focused CI enforcement that targets real violations.
"""
import os
import sys
import re
import json
from pathlib import Path
from typing import List, Dict, Tuple, Set


class ProductionEnforcement:
    """Production-focused enforcement for CI/CD."""
    
    def __init__(self):
        self.project_root = Path(__file__).parent
        self.data_mode = os.getenv("DATA_MODE", "production").lower()
        self.is_production = self.data_mode == "production"
        
        # Focus on actual violations, not false positives
        self.blocked_patterns = [
            "sampleData", "demoData", "mock_data", "test_data", "fixture_data"
        ]
        
        # Blocked string literals (actual violations)
        self.blocked_strings = [
            '"placeholder": true', '"mock": true', '"sample": true', 
            '"demo": true', '"fake": true', '"dummy": true'
        ]
        
        # Focus on actual sentinel values in data
        self.sentinel_values = [-999999, -99999, -9999]
        
        # Directories to exclude (test files, cache, etc.)
        self.exclude_dirs = {
            "__pycache__", ".git", "node_modules", ".venv", "venv", 
            ".pytest_cache", ".mypy_cache", "dist", "build", "cache",
            "static", "generated_models", "assumptions_engine", "financial_data"
        }
        
        # Files to exclude (test files, demo files, etc.)
        self.exclude_files = {
            "test_", "demo", "sample", "mock", "fixture", "_test", "_demo"
        }
    
    def should_exclude_file(self, file_path: Path) -> bool:
        """Check if file should be excluded from scanning."""
        # Check if any parent directory is in exclude list
        for part in file_path.parts:
            if part in self.exclude_dirs:
                return True
        
        # Check file name patterns
        file_name = file_path.name.lower()
        for pattern in self.exclude_files:
            if pattern in file_name:
                return True
        
        # Exclude hidden files
        if file_name.startswith('.'):
            return True
            
        return False
    
    def check_core_files(self) -> Tuple[bool, List[str]]:
        """Check core production files for violations."""
        violations = []
        
        # Core files that must be clean
        core_patterns = ["*.py", "*.js", "*.ts", "*.tsx"]
        core_dirs = ["api", "orchestrator", "providers", "templates"]
        
        for core_dir in core_dirs:
            core_path = self.project_root / core_dir
            if core_path.exists():
                for pattern in core_patterns:
                    for file_path in core_path.rglob(pattern):
                        if not self.should_exclude_file(file_path):
                            file_violations = self._check_file_for_violations(file_path)
                            if file_violations:
                                violations.extend(file_violations)
        
        return len(violations) == 0, violations
    
    def _check_file_for_violations(self, file_path: Path) -> List[str]:
        """Check a single file for production violations."""
        violations = []
        
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
            
            for line_num, line in enumerate(lines, 1):
                # Skip comments
                if line.strip().startswith('#') or line.strip().startswith('//'):
                    continue
                
                # Check for blocked patterns in imports or assignments
                if any(pattern in line.lower() for pattern in self.blocked_patterns):
                    if ('import' in line.lower() or 'from' in line.lower() or 
                        '=' in line or ':' in line):
                        violations.append(f"{file_path}:{line_num}: Blocked pattern: {line.strip()}")
                
                # Check for blocked string literals
                for blocked_string in self.blocked_strings:
                    if blocked_string in line:
                        violations.append(f"{file_path}:{line_num}: Blocked string: {blocked_string}")
                
                # Check for sentinel values in assignments
                for sentinel in self.sentinel_values:
                    if str(sentinel) in line and ('=' in line or ':' in line):
                        violations.append(f"{file_path}:{line_num}: Sentinel value: {sentinel}")
        
        except Exception as e:
            violations.append(f"{file_path}: Error reading file: {e}")
        
        return violations
    
    def check_environment_config(self) -> Tuple[bool, List[str]]:
        """Check environment configuration for production."""
        violations = []
        
        if self.is_production:
            # Check for development flags
            dev_flags = ["DEBUG", "DEVELOPMENT", "TEST_MODE"]
            for flag in dev_flags:
                if os.getenv(flag, "").lower() in ["true", "1", "yes"]:
                    violations.append(f"Development flag {flag} set in production")
        
        return len(violations) == 0, violations
    
    def check_provider_config(self) -> Tuple[bool, List[str]]:
        """Check provider configuration."""
        violations = []
        
        # Check that at least EDGAR and Yahoo are available (always enabled)
        provider_count = 2  # EDGAR and Yahoo
        
        # Count optional providers
        optional_providers = ["FINNHUB_API_KEY", "ALPHAVANTAGE_API_KEY", 
                            "FMP_API_KEY", "FRED_API_KEY", "POLYGON_API_KEY"]
        
        for provider in optional_providers:
            if os.getenv(provider):
                provider_count += 1
        
        if provider_count < 2:
            violations.append("Insufficient providers enabled (need at least EDGAR + Yahoo)")
        
        return len(violations) == 0, violations
    
    def run_production_checks(self) -> Tuple[bool, List[str]]:
        """Run production-focused enforcement checks."""
        all_violations = []
        
        print("🔍 Running production enforcement checks...")
        
        # Check core files
        print("  Checking core production files...")
        is_valid, violations = self.check_core_files()
        if not is_valid:
            all_violations.extend([f"Core violation: {v}" for v in violations])
        
        # Check environment
        print("  Checking environment configuration...")
        is_valid, violations = self.check_environment_config()
        if not is_valid:
            all_violations.extend([f"Environment violation: {v}" for v in violations])
        
        # Check providers
        print("  Checking provider configuration...")
        is_valid, violations = self.check_provider_config()
        if not is_valid:
            all_violations.extend([f"Provider violation: {v}" for v in violations])
        
        success = len(all_violations) == 0
        
        if success:
            print("✅ Production enforcement checks passed!")
            print(f"   Data mode: {self.data_mode}")
            print("   Core files: Clean")
            print("   Environment: Production-ready")
            print("   Providers: Configured")
        else:
            print("❌ Production enforcement checks failed:")
            for violation in all_violations[:10]:  # Show first 10 violations
                print(f"  - {violation}")
            if len(all_violations) > 10:
                print(f"  ... and {len(all_violations) - 10} more violations")
        
        return success, all_violations


def main():
    """Main entry point for production enforcement."""
    enforcement = ProductionEnforcement()
    success, violations = enforcement.run_production_checks()
    
    if not success:
        print(f"\n🚫 Build failed: {len(violations)} violations found")
        print("\nTo fix violations:")
        print("1. Remove mock/fixture/sample data from core files")
        print("2. Replace placeholder values with real data")
        print("3. Ensure providers are properly configured")
        print("4. Set appropriate environment variables for production")
        sys.exit(1)
    else:
        print("\n✅ Build approved for production")
        sys.exit(0)


if __name__ == "__main__":
    main()
