#!/usr/bin/env python3
"""
Test Model Differentiation - Verify LBO vs DCF vs Other Models
"""

import requests
import json

def test_model_differentiation():
    """Test that each model type returns its specific data structure"""
    
    base_url = "http://localhost:8000"
    test_ticker = "GOOS"
    
    print("🧪 Testing Model Differentiation - LBO vs DCF vs Other Models")
    print("=" * 70)
    
    models_to_test = [
        {"model": "lbo", "expected_fields": ["debt_stack", "irr", "moic", "sources_uses"]},
        {"model": "dcf", "expected_fields": ["ev", "equity", "ufcf", "tv"]},
        {"model": "comps", "expected_fields": ["peers", "multiples", "implied_range"]},
        {"model": "merger", "expected_fields": ["pf_is", "synergies", "eps_accretion"]}
    ]
    
    for test_case in models_to_test:
        model_type = test_case["model"]
        expected_fields = test_case["expected_fields"]
        
        print(f"\n🔍 Testing {model_type.upper()} Model")
        print(f"   Expected fields: {', '.join(expected_fields)}")
        
        try:
            # Test model generation
            model_url = f"{base_url}/models/generate"
            model_data = {
                "ticker": test_ticker,
                "model": model_type,
                "overrides": {}
            }
            
            response = requests.post(model_url, json=model_data, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                preview = result.get('preview', {})
                model_preview = preview.get(model_type)
                
                if model_preview:
                    print(f"   ✅ {model_type.upper()} model generated successfully")
                    
                    # Check for expected fields
                    found_fields = []
                    missing_fields = []
                    
                    for field in expected_fields:
                        if field in model_preview:
                            found_fields.append(field)
                        else:
                            missing_fields.append(field)
                    
                    print(f"   📊 Found fields: {', '.join(found_fields)}")
                    if missing_fields:
                        print(f"   ⚠️  Missing fields: {', '.join(missing_fields)}")
                    
                    # Show key metrics for each model type
                    if model_type == "lbo":
                        debt_stack = model_preview.get('debt_stack', [])
                        print(f"   🏦 Debt tranches: {len(debt_stack)}")
                        if debt_stack:
                            print(f"      First tranche: {debt_stack[0].get('name', 'Unknown')} - ${debt_stack[0].get('amount', 0)/1000000:.0f}M @ {debt_stack[0].get('rate', 0)*100:.1f}%")
                        print(f"   📈 IRR: {model_preview.get('irr', 0)*100:.1f}%")
                        print(f"   💰 MOIC: {model_preview.get('moic', 0):.1f}x")
                    
                    elif model_type == "dcf":
                        print(f"   💼 EV: ${model_preview.get('ev', 0)/1000000000:.1f}B")
                        print(f"   🏢 Equity: ${model_preview.get('equity', 0)/1000000000:.1f}B")
                        print(f"   💵 Implied Price: ${model_preview.get('implied_price', 0):.2f}")
                        print(f"   📊 Upside: {model_preview.get('upside_pct', 0):.1f}%")
                    
                    elif model_type == "comps":
                        peers = model_preview.get('peers', [])
                        print(f"   👥 Peer companies: {len(peers)}")
                        multiples = model_preview.get('multiples', {})
                        print(f"   📊 Multiples available: {', '.join(multiples.keys())}")
                    
                    elif model_type == "merger":
                        synergies = model_preview.get('synergies', {})
                        print(f"   🤝 Synergy buckets: {', '.join(synergies.keys())}")
                        print(f"   📈 EPS Accretion: {model_preview.get('eps_accretion', 0)*100:.1f}%")
                
                else:
                    print(f"   ❌ No {model_type} preview data returned")
                    print(f"   📄 Full preview keys: {list(preview.keys())}")
            
            else:
                print(f"   ❌ Model generation failed: {response.status_code}")
                print(f"   📄 Error: {response.text}")
        
        except requests.exceptions.RequestException as e:
            print(f"   ❌ Request failed: {e}")
        except Exception as e:
            print(f"   ❌ Unexpected error: {e}")
    
    print(f"\n🎯 Model Differentiation Test Complete!")
    print(f"🌐 Open http://localhost:8000 to see the enhanced UI with clear model selection")

if __name__ == "__main__":
    test_model_differentiation()
