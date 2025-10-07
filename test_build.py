#!/usr/bin/env python3
"""
Test script to verify the build process works correctly.
This simulates what Render will do during the build phase.
"""

import subprocess
import sys
import os

def run_command(cmd, description):
    """Run a command and return success status."""
    print(f"\n🔧 {description}")
    print(f"Running: {cmd}")
    try:
        result = subprocess.run(cmd, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ Success: {description}")
        if result.stdout:
            print("STDOUT:", result.stdout.strip())
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed: {description}")
        print("STDOUT:", e.stdout)
        print("STDERR:", e.stderr)
        return False

def main():
    """Test the build process."""
    print("🚀 Testing Render Build Process")
    print("=" * 50)
    
    # Test 1: Check Python version
    success1 = run_command("python3 --version", "Check Python version")
    
    # Test 2: Check pip version
    success2 = run_command("python3 -m pip --version", "Check pip version")
    
    # Test 3: Upgrade pip
    success3 = run_command("python3 -m pip install --upgrade pip", "Upgrade pip")
    
    # Test 4: Install requirements
    success4 = run_command("python3 -m pip install --no-cache-dir --force-reinstall -r requirements.txt", "Install requirements.txt")
    
    # Test 5: Install openpyxl specifically
    success5 = run_command("python3 -m pip install --no-cache-dir --force-reinstall openpyxl==3.1.5", "Install openpyxl specifically")
    
    # Test 6: Verify openpyxl import
    success6 = run_command("python3 -c \"import openpyxl; print(f'✓ openpyxl {openpyxl.__version__} installed')\"", "Verify openpyxl import")
    
    # Test 7: Verify pandas import
    success7 = run_command("python3 -c \"import pandas; print(f'✓ pandas {pandas.__version__} installed')\"", "Verify pandas import")
    
    # Test 8: Verify numpy import
    success8 = run_command("python3 -c \"import numpy; print(f'✓ numpy {numpy.__version__} installed')\"", "Verify numpy import")
    
    # Test 9: Verify yfinance import
    success9 = run_command("python3 -c \"import yfinance; print(f'✓ yfinance {yfinance.__version__} installed')\"", "Verify yfinance import")
    
    # Test 10: Test minimal_app import
    success10 = run_command("python3 -c \"import minimal_app; print('✓ minimal_app imports successfully')\"", "Test minimal_app import")
    
    # Test 11: List installed packages
    success11 = run_command("python3 -m pip list | grep -E '(openpyxl|pandas|numpy|yfinance|flask|gunicorn)'", "List installed packages")
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 BUILD TEST SUMMARY")
    print("=" * 50)
    
    tests = [
        ("Python version", success1),
        ("Pip version", success2),
        ("Upgrade pip", success3),
        ("Install requirements", success4),
        ("Install openpyxl", success5),
        ("Verify openpyxl", success6),
        ("Verify pandas", success7),
        ("Verify numpy", success8),
        ("Verify yfinance", success9),
        ("Test minimal_app", success10),
        ("List packages", success11),
    ]
    
    passed = sum(1 for _, success in tests if success)
    total = len(tests)
    
    for test_name, success in tests:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
    
    print(f"\n🎯 Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! Build process is ready for Render.")
        return 0
    else:
        print("⚠️  Some tests failed. Check the output above for details.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
