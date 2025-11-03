"""
CI Guard for Real Data Enforcement.

This script scans the application codebase to ensure that no mock, sample,
or dummy data is imported or used outside of designated test directories.

Fails with exit code 1 if any violations are found.
"""
import os
import re
import sys
from typing import List

# --- Configuration ---
FORBIDDEN_PATTERNS = [
    r'from .* import .*_MOCK',
    r'import .*_MOCK',
    r'from .* import .*_SAMPLE',
    r'import .*_SAMPLE',
    r'from .* import .*_DUMMY',
    r'import .*_DUMMY',
    r'open\(".*fixtures/.*"\)',
    r'pd\.read_json\(".*fixtures/.*"\)',
]

# Directories to scan (e.g., your main application source)
SCAN_DIRECTORIES = ['backend', 'scripts']

# Directories where forbidden patterns are allowed (e.g., tests)
EXEMPT_DIRECTORIES = ['backend/tests', 'tests']

# --- Main Logic ---
def scan_file(filepath: str) -> List[str]:
    """Scans a single file for forbidden patterns."""
    violations = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            for i, line in enumerate(f, 1):
                for pattern in FORBIDDEN_PATTERNS:
                    if re.search(pattern, line, re.IGNORECASE):
                        violations.append(f"  - Line {i}: {line.strip()}")
    except Exception as e:
        print(f"Could not read {filepath}: {e}")
    return violations

def main():
    print("--- Running Real Data Enforcement Guard ---")
    
    all_violations = {}
    
    for scan_dir in SCAN_DIRECTORIES:
        for root, _, files in os.walk(scan_dir):
            # Skip exempt directories
            if any(exempt_dir in root for exempt_dir in EXEMPT_DIRECTORIES):
                continue
                
            for filename in files:
                if filename.endswith(".py"):
                    filepath = os.path.join(root, filename)
                    violations = scan_file(filepath)
                    if violations:
                        all_violations[filepath] = violations

    if all_violations:
        print("\n❌ VIOLATIONS FOUND: Mock or sample data detected in application code.")
        for filepath, violations in all_violations.items():
            print(f"\nIn file {filepath}:")
            for v in violations:
                print(v)
        
        print("\n---")
        print("To fix this, remove all references to mock/sample/dummy/fixture data")
        print("from your application code. Such data should only be used in tests.")
        sys.exit(1)
    else:
        print("\n✅ SUCCESS: No mock or sample data references found in application code.")
        sys.exit(0)

if __name__ == "__main__":
    main()