#!/usr/bin/env python3
"""
Monitor Render Deployment - Professional UI
"""

import requests
import time
from datetime import datetime

def check_render_deployment():
    """Check if Render has deployed the new professional UI"""
    
    # Replace with your actual Render URL
    render_url = "https://your-app-name.onrender.com"  # Update this with your actual Render URL
    
    print("🚀 Monitoring Render Deployment - Professional UI")
    print("=" * 60)
    print(f"⏰ Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"🌐 Checking: {render_url}")
    print()
    
    max_attempts = 10
    attempt = 0
    
    while attempt < max_attempts:
        attempt += 1
        print(f"🔍 Attempt {attempt}/{max_attempts}")
        
        try:
            response = requests.get(render_url, timeout=30)
            
            if response.status_code == 200:
                content = response.text
                
                # Check for new professional UI elements
                professional_elements = [
                    "Select Financial Model",
                    "Model Hub Component", 
                    "navy",
                    "gray-panel",
                    "STATE.LOADING",
                    "AssumptionsPanel",
                    "PreviewPanel"
                ]
                
                found_elements = []
                for element in professional_elements:
                    if element in content:
                        found_elements.append(element)
                
                print(f"✅ Status: {response.status_code}")
                print(f"📊 Professional elements found: {len(found_elements)}/{len(professional_elements)}")
                
                if len(found_elements) >= 5:  # Most elements present
                    print("🎉 SUCCESS: Professional UI is live on Render!")
                    print(f"✅ Found elements: {', '.join(found_elements)}")
                    break
                else:
                    print(f"⏳ Partial deployment: {', '.join(found_elements)}")
                    print("🔄 Waiting for full deployment...")
                    
            else:
                print(f"❌ Status: {response.status_code}")
                print("🔄 Render might be rebuilding...")
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Error: {e}")
            print("🔄 Render might be down or rebuilding...")
        
        if attempt < max_attempts:
            print("⏳ Waiting 30 seconds before next check...")
            time.sleep(30)
        else:
            print("⏰ Max attempts reached. Check Render dashboard manually.")
    
    print(f"\n🎯 Final Status: {'SUCCESS' if attempt < max_attempts else 'TIMEOUT'}")
    print(f"🌐 Your Render URL: {render_url}")
    print(f"📋 If still not working, check:")
    print(f"   1. Render dashboard for build status")
    print(f"   2. Build logs for any errors")
    print(f"   3. Environment variables")
    print(f"   4. Health check endpoint: {render_url}/healthz")

if __name__ == "__main__":
    print("⚠️  IMPORTANT: Update the render_url variable with your actual Render URL!")
    print("   Example: https://finmodai-professional.onrender.com")
    print()
    
    # Uncomment and update the URL below
    # check_render_deployment()
    
    print("🔧 To use this script:")
    print("   1. Update render_url variable with your actual Render URL")
    print("   2. Uncomment the check_render_deployment() call")
    print("   3. Run the script")
