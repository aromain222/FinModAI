#!/usr/bin/env python3
"""
Check and install required dependencies
"""

import sys
import subprocess
import pkg_resources

def check_and_install_package(package_name):
    """Check if a package is installed and install it if not"""
    try:
        pkg_resources.get_distribution(package_name)
        print(f"✅ {package_name} is already installed")
        return True
    except pkg_resources.DistributionNotFound:
        print(f"❌ {package_name} is not installed. Installing...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", package_name])
            print(f"✅ {package_name} has been installed")
            return True
        except subprocess.CalledProcessError:
            print(f"❌ Failed to install {package_name}")
            return False

def main():
    """Check and install required packages"""
    print("Checking required packages...")
    
    # Basic packages for minimal_test_app.py
    required_packages = [
        "fastapi",
        "uvicorn",
    ]
    
    # Check each package
    all_installed = True
    for package in required_packages:
        if not check_and_install_package(package):
            all_installed = False
    
    if all_installed:
        print("\n✅ All required packages are installed!")
        print("\nYou can now run:")
        print("  python3 basic_server.py      # Simple HTTP server (no dependencies)")
        print("  python3 minimal_test_app.py  # Minimal FastAPI app")
        print("  ./run_local.sh               # Full application")
    else:
        print("\n❌ Some packages could not be installed.")
        print("Try installing them manually with:")
        print("  pip install fastapi uvicorn")

if __name__ == "__main__":
    main()
