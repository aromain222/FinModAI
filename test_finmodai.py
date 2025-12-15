#!/usr/bin/env python3
"""
Quick test of FINMODAI system
"""

import sys
from pathlib import Path

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

print('🧪 Testing FINMODAI Engine...')
print('=' * 60)

try:
    from finmodai_engine import FINMODAIEngine, QueryType
    print('✅ Successfully imported FINMODAIEngine')
    
    # Create engine
    engine = FINMODAIEngine()
    print('✅ Successfully created engine instance')
    
    # Test simple query
    print('\n📊 Testing simple query...')
    report = engine.analyze('What is the DCF valuation of a tech company with $1B revenue?')
    
    print('\n✅ Report generated successfully!')
    print(f'   - Query Type: {report.query_type.value}')
    print(f'   - Narrative Length: {len(report.narrative)} chars')
    print(f'   - Quantitative Tables: {len(report.quantitative_tables)}')
    print(f'   - Assumptions: {len(report.assumptions)}')
    print(f'   - Sources: {len(report.sources)}')
    print(f'   - Confidence: {report.confidence_level}')
    
    # Verify all phases are present
    assert report.narrative, "Narrative is empty!"
    assert len(report.quantitative_tables) > 0, "No quantitative tables!"
    assert len(report.assumptions) > 0, "No assumptions!"
    assert len(report.sources) > 0, "No sources!"
    
    # Test report formats
    print('\n📄 Testing report formats...')
    markdown = report.to_markdown()
    print(f'   - Markdown: {len(markdown)} chars')
    assert 'PHASE 1' in markdown, "Markdown missing Phase 1!"
    assert 'PHASE 2' in markdown, "Markdown missing Phase 2!"
    assert 'PHASE 3' in markdown, "Markdown missing Phase 3!"
    assert 'PHASE 4' in markdown, "Markdown missing Phase 4!"
    
    html = report.to_html()
    print(f'   - HTML: {len(html)} chars')
    assert '<html>' in html.lower(), "Invalid HTML!"
    
    json_dict = report.to_dict()
    print(f'   - JSON: {len(str(json_dict))} chars')
    assert 'narrative' in json_dict, "JSON missing narrative!"
    assert 'quantitative_tables' in json_dict, "JSON missing tables!"
    
    # Test saving
    print('\n💾 Testing report saving...')
    saved = engine.save_report(report, output_dir="finmodai_reports")
    print(f'   - Saved formats: {list(saved.keys())}')
    
    for format_type, path in saved.items():
        assert Path(path).exists(), f"File not created: {path}"
        print(f'   - ✅ {format_type}: {path}')
    
    print('\n🎉 All tests passed!')
    print('=' * 60)
    print('\n✨ FINMODAI is ready to use!')
    print('\nQuick Start:')
    print('  1. Run: ./start_finmodai.sh')
    print('  2. Or: python3 finmodai_examples.py --interactive')
    print('  3. Or: python3 finmodai_web.py')
    
except Exception as e:
    print(f'\n❌ Test failed: {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)

