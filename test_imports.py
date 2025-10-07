#!/usr/bin/env python3
"""
Test script to verify all imports work correctly
"""
print("Testing imports...")

try:
    import json
    print("✅ json")
except ImportError as e:
    print(f"❌ json: {e}")

try:
    import uuid
    print("✅ uuid")
except ImportError as e:
    print(f"❌ uuid: {e}")

try:
    from datetime import datetime, timedelta
    print("✅ datetime")
except ImportError as e:
    print(f"❌ datetime: {e}")

try:
    import yfinance as yf
    print("✅ yfinance")
except ImportError as e:
    print(f"❌ yfinance: {e}")

try:
    import pandas as pd
    print("✅ pandas")
except ImportError as e:
    print(f"❌ pandas: {e}")

try:
    import numpy as np
    print("✅ numpy")
except ImportError as e:
    print(f"❌ numpy: {e}")

try:
    import openpyxl
    print(f"✅ openpyxl (version: {openpyxl.__version__})")
except ImportError as e:
    print(f"❌ openpyxl: {e}")

try:
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    print("✅ openpyxl.styles")
except ImportError as e:
    print(f"❌ openpyxl.styles: {e}")

try:
    import requests
    print("✅ requests")
except ImportError as e:
    print(f"❌ requests: {e}")

try:
    from bs4 import BeautifulSoup
    print("✅ beautifulsoup4")
except ImportError as e:
    print(f"❌ beautifulsoup4: {e}")

try:
    from flask import Flask
    print("✅ flask")
except ImportError as e:
    print(f"❌ flask: {e}")

print("\nAll imports completed!")
