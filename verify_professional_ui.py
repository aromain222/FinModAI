#!/usr/bin/env python3
"""
Verify New Professional UI is Live
"""

import requests

def verify_professional_ui():
    """Verify the new professional UI is being served"""
    
    base_url = "http://localhost:8000"
    
    print("🎨 Verifying New Professional UI is Live")
    print("=" * 50)
    
    try:
        response = requests.get(f"{base_url}/", timeout=10)
        
        if response.status_code == 200:
            content = response.text
            
            # Check for new professional UI elements
            checks = [
                ("Model Hub", "Model Hub Component" in content),
                ("Select Financial Model", "Select Financial Model" in content),
                ("Professional Styling", "navy" in content and "gray-panel" in content),
                ("State Machine", "STATE.LOADING" in content),
                ("Assumptions Panel", "AssumptionsPanel" in content),
                ("Preview Panel", "PreviewPanel" in content),
                ("DCF Preview", "DCFPreview" in content),
                ("LBO Preview", "LBOPreview" in content),
                ("Comps Preview", "CompsPreview" in content),
                ("Merger Preview", "MergerPreview" in content)
            ]
            
            print("✅ New Professional UI Elements:")
            for check_name, is_present in checks:
                status = "✅" if is_present else "❌"
                print(f"   {status} {check_name}")
            
            # Check for old UI elements (should not be present)
            old_elements = [
                "ModelSelection",
                "ModelBuilder", 
                "ModelPreview"
            ]
            
            print("\n🔍 Checking for old UI elements (should be absent):")
            for element in old_elements:
                is_present = element in content
                status = "❌" if is_present else "✅"
                print(f"   {status} {element} {'(still present)' if is_present else '(removed)'}")
            
            print(f"\n🎯 Professional UI Status: {'LIVE' if all(check[1] for check in checks) else 'PARTIAL'}")
            
        else:
            print(f"❌ Server error: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Error: {e}")
    
    print(f"\n🌐 Open http://localhost:8000 to see the new professional UI!")
    print(f"📋 You should now see:")
    print(f"   • Model Hub with 4 distinct model cards")
    print(f"   • Professional navy/gray/green styling")
    print(f"   • 'Select Financial Model' header")
    print(f"   • Banker-grade layout and design")

if __name__ == "__main__":
    verify_professional_ui()
