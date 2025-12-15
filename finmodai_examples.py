#!/usr/bin/env python3
"""
FINMODAI Examples and Testing

Demonstrates all capabilities of the FINMODAI system with example queries.
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from finmodai_engine import FINMODAIEngine, quick_analysis, analyze_and_save
from finmodai_data_provider import FINMODAIDataProvider


def example_1_valuation():
    """Example 1: DCF Valuation Analysis"""
    print("\n" + "="*80)
    print("EXAMPLE 1: DCF VALUATION ANALYSIS")
    print("="*80)
    
    # Create engine with data provider
    provider = FINMODAIDataProvider()
    engine = FINMODAIEngine(data_provider=provider)
    
    # Run analysis
    report = engine.analyze(
        query="What is the DCF valuation of Apple Inc?",
        context={"ticker": "AAPL", "company_name": "Apple Inc"}
    )
    
    # Display report
    print(report.to_markdown())
    
    # Save report
    saved = engine.save_report(report, output_dir="finmodai_reports")
    print(f"\n✅ Reports saved:")
    for format_type, path in saved.items():
        print(f"  - {format_type}: {path}")
    
    return report


def example_2_forecast():
    """Example 2: 5-Year Forecast with Scenarios"""
    print("\n" + "="*80)
    print("EXAMPLE 2: 5-YEAR FORECAST WITH SCENARIOS")
    print("="*80)
    
    provider = FINMODAIDataProvider()
    engine = FINMODAIEngine(data_provider=provider)
    
    report = engine.analyze(
        query="Provide a 5-year revenue and EBITDA forecast for Microsoft with base, bull, and bear cases",
        context={"ticker": "MSFT", "company_name": "Microsoft Corporation"}
    )
    
    print(report.to_markdown())
    
    saved = engine.save_report(report, output_dir="finmodai_reports")
    print(f"\n✅ Reports saved: {list(saved.keys())}")
    
    return report


def example_3_comparison():
    """Example 3: Peer Comparison Analysis"""
    print("\n" + "="*80)
    print("EXAMPLE 3: PEER COMPARISON ANALYSIS")
    print("="*80)
    
    provider = FINMODAIDataProvider()
    engine = FINMODAIEngine(data_provider=provider)
    
    report = engine.analyze(
        query="Compare Apple vs Microsoft valuation multiples, growth rates, and profitability metrics",
        context={"ticker": "AAPL", "company_name": "Apple Inc"}
    )
    
    print(report.to_markdown())
    
    saved = engine.save_report(report, output_dir="finmodai_reports")
    print(f"\n✅ Reports saved: {list(saved.keys())}")
    
    return report


def example_4_risk_assessment():
    """Example 4: Risk Assessment"""
    print("\n" + "="*80)
    print("EXAMPLE 4: RISK ASSESSMENT")
    print("="*80)
    
    provider = FINMODAIDataProvider()
    engine = FINMODAIEngine(data_provider=provider)
    
    report = engine.analyze(
        query="What are the key investment risks for Nvidia? Provide downside scenarios and risk mitigation strategies.",
        context={"ticker": "NVDA", "company_name": "Nvidia Corporation"}
    )
    
    print(report.to_markdown())
    
    saved = engine.save_report(report, output_dir="finmodai_reports")
    print(f"\n✅ Reports saved: {list(saved.keys())}")
    
    return report


def example_5_ma_analysis():
    """Example 5: M&A Analysis"""
    print("\n" + "="*80)
    print("EXAMPLE 5: M&A ANALYSIS")
    print("="*80)
    
    provider = FINMODAIDataProvider()
    engine = FINMODAIEngine(data_provider=provider)
    
    report = engine.analyze(
        query="Analyze Salesforce as a potential acquisition target. What would be a fair acquisition price? Quantify potential synergies.",
        context={"ticker": "CRM", "company_name": "Salesforce Inc"}
    )
    
    print(report.to_markdown())
    
    saved = engine.save_report(report, output_dir="finmodai_reports")
    print(f"\n✅ Reports saved: {list(saved.keys())}")
    
    return report


def example_6_market_analysis():
    """Example 6: Market/Sector Analysis"""
    print("\n" + "="*80)
    print("EXAMPLE 6: MARKET/SECTOR ANALYSIS")
    print("="*80)
    
    provider = FINMODAIDataProvider()
    engine = FINMODAIEngine(data_provider=provider)
    
    report = engine.analyze(
        query="What is the outlook for semiconductor industry? Analyze growth drivers, competitive dynamics, and valuation trends.",
        context={"ticker": "NVDA", "company_name": "Semiconductor Industry"}
    )
    
    print(report.to_markdown())
    
    saved = engine.save_report(report, output_dir="finmodai_reports")
    print(f"\n✅ Reports saved: {list(saved.keys())}")
    
    return report


def example_7_strategy():
    """Example 7: Strategic Recommendations"""
    print("\n" + "="*80)
    print("EXAMPLE 7: STRATEGIC RECOMMENDATIONS")
    print("="*80)
    
    provider = FINMODAIDataProvider()
    engine = FINMODAIEngine(data_provider=provider)
    
    report = engine.analyze(
        query="What strategic initiatives should Intel pursue to improve margins and competitive positioning? Provide a prioritized roadmap.",
        context={"ticker": "INTC", "company_name": "Intel Corporation"}
    )
    
    print(report.to_markdown())
    
    saved = engine.save_report(report, output_dir="finmodai_reports")
    print(f"\n✅ Reports saved: {list(saved.keys())}")
    
    return report


def example_8_quick_analysis():
    """Example 8: Quick Analysis (Convenience Function)"""
    print("\n" + "="*80)
    print("EXAMPLE 8: QUICK ANALYSIS")
    print("="*80)
    
    # Using the convenience function
    report = quick_analysis(
        "What is the intrinsic value of Tesla?",
        ticker="TSLA"
    )
    
    print(report.to_markdown())
    
    return report


def example_9_batch_analysis():
    """Example 9: Batch Analysis"""
    print("\n" + "="*80)
    print("EXAMPLE 9: BATCH ANALYSIS")
    print("="*80)
    
    provider = FINMODAIDataProvider()
    engine = FINMODAIEngine(data_provider=provider)
    
    queries = [
        ("What is the DCF valuation of Amazon?", "AMZN", "Amazon.com Inc"),
        ("Forecast Google's revenue growth for the next 3 years", "GOOGL", "Alphabet Inc"),
        ("What are the risks of investing in Meta?", "META", "Meta Platforms Inc"),
    ]
    
    reports = []
    for query, ticker, company in queries:
        print(f"\n📊 Analyzing: {query}")
        report = engine.analyze(query, context={"ticker": ticker, "company_name": company})
        reports.append(report)
        engine.save_report(report, output_dir="finmodai_reports")
        print(f"✅ Completed: {ticker}")
    
    print(f"\n✅ Batch analysis complete: {len(reports)} reports generated")
    
    return reports


def example_10_no_ticker():
    """Example 10: Analysis Without Specific Ticker"""
    print("\n" + "="*80)
    print("EXAMPLE 10: GENERAL FINANCIAL ANALYSIS")
    print("="*80)
    
    provider = FINMODAIDataProvider()
    engine = FINMODAIEngine(data_provider=provider)
    
    report = engine.analyze(
        query="What are the key valuation metrics for evaluating a SaaS company? Provide a framework with typical multiples and growth assumptions."
    )
    
    print(report.to_markdown())
    
    saved = engine.save_report(report, output_dir="finmodai_reports")
    print(f"\n✅ Reports saved: {list(saved.keys())}")
    
    return report


def run_all_examples():
    """Run all examples"""
    print("\n" + "🚀"*40)
    print("FINMODAI - COMPREHENSIVE EXAMPLES")
    print("Elite Private-Equity-Grade Financial Analysis")
    print("🚀"*40)
    
    examples = [
        ("Valuation Analysis", example_1_valuation),
        ("5-Year Forecast", example_2_forecast),
        ("Peer Comparison", example_3_comparison),
        ("Risk Assessment", example_4_risk_assessment),
        ("M&A Analysis", example_5_ma_analysis),
        ("Market Analysis", example_6_market_analysis),
        ("Strategic Recommendations", example_7_strategy),
        ("Quick Analysis", example_8_quick_analysis),
        ("Batch Analysis", example_9_batch_analysis),
        ("General Analysis", example_10_no_ticker),
    ]
    
    results = {}
    
    for name, example_func in examples:
        try:
            print(f"\n\n{'='*80}")
            print(f"Running: {name}")
            print('='*80)
            result = example_func()
            results[name] = {"success": True, "report": result}
            print(f"\n✅ {name} completed successfully")
        except Exception as e:
            print(f"\n❌ {name} failed: {e}")
            results[name] = {"success": False, "error": str(e)}
    
    # Summary
    print("\n\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    
    successful = sum(1 for r in results.values() if r.get("success"))
    total = len(results)
    
    print(f"\nCompleted: {successful}/{total} examples")
    print("\nResults:")
    for name, result in results.items():
        status = "✅" if result.get("success") else "❌"
        print(f"  {status} {name}")
    
    print("\n📁 All reports saved to: finmodai_reports/")
    print("\n🎉 FINMODAI Examples Complete!")
    
    return results


def interactive_demo():
    """Interactive demo mode"""
    print("\n" + "🚀"*40)
    print("FINMODAI - INTERACTIVE DEMO")
    print("🚀"*40)
    
    provider = FINMODAIDataProvider()
    engine = FINMODAIEngine(data_provider=provider)
    
    print("\nWelcome to FINMODAI Interactive Demo!")
    print("Ask any financial question and get elite-grade analysis.")
    print("Type 'exit' to quit, 'examples' to see example queries.\n")
    
    example_queries = [
        "What is the DCF valuation of Apple?",
        "Forecast Tesla's revenue for the next 5 years",
        "Compare Microsoft vs Google valuation multiples",
        "What are the risks of investing in Netflix?",
        "Analyze Amazon as an M&A target",
        "What is the outlook for the cloud computing market?",
    ]
    
    while True:
        try:
            user_input = input("\n💬 Your question: ").strip()
            
            if not user_input:
                continue
            
            if user_input.lower() == 'exit':
                print("\n👋 Goodbye!")
                break
            
            if user_input.lower() == 'examples':
                print("\n💡 Example Queries:")
                for i, example in enumerate(example_queries, 1):
                    print(f"  {i}. {example}")
                continue
            
            # Check if user entered a number (selecting an example)
            if user_input.isdigit():
                idx = int(user_input) - 1
                if 0 <= idx < len(example_queries):
                    user_input = example_queries[idx]
                    print(f"📊 Using example: {user_input}")
                else:
                    print("❌ Invalid example number")
                    continue
            
            # Optional: ask for ticker
            ticker = input("🎯 Ticker (optional, press Enter to skip): ").strip().upper() or None
            
            print("\n⏳ Generating analysis...")
            
            # Generate report
            context = {"ticker": ticker} if ticker else None
            report = engine.analyze(user_input, context)
            
            # Display report
            print("\n" + "="*80)
            print(report.to_markdown())
            print("="*80)
            
            # Save report
            saved = engine.save_report(report, output_dir="finmodai_reports")
            print(f"\n✅ Report saved to: {saved.get('markdown', 'finmodai_reports/')}")
            
        except KeyboardInterrupt:
            print("\n\n👋 Goodbye!")
            break
        except Exception as e:
            print(f"\n❌ Error: {e}")


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="FINMODAI Examples and Testing")
    parser.add_argument(
        '--example',
        type=int,
        help='Run specific example (1-10)',
        choices=range(1, 11)
    )
    parser.add_argument(
        '--all',
        action='store_true',
        help='Run all examples'
    )
    parser.add_argument(
        '--interactive',
        action='store_true',
        help='Start interactive demo'
    )
    parser.add_argument(
        '--query',
        type=str,
        help='Run custom query'
    )
    parser.add_argument(
        '--ticker',
        type=str,
        help='Ticker symbol for custom query'
    )
    
    args = parser.parse_args()
    
    if args.interactive:
        interactive_demo()
    
    elif args.all:
        run_all_examples()
    
    elif args.example:
        examples = {
            1: example_1_valuation,
            2: example_2_forecast,
            3: example_3_comparison,
            4: example_4_risk_assessment,
            5: example_5_ma_analysis,
            6: example_6_market_analysis,
            7: example_7_strategy,
            8: example_8_quick_analysis,
            9: example_9_batch_analysis,
            10: example_10_no_ticker,
        }
        examples[args.example]()
    
    elif args.query:
        provider = FINMODAIDataProvider()
        engine = FINMODAIEngine(data_provider=provider)
        
        context = {"ticker": args.ticker} if args.ticker else None
        report = engine.analyze(args.query, context)
        
        print(report.to_markdown())
        
        saved = engine.save_report(report, output_dir="finmodai_reports")
        print(f"\n✅ Reports saved: {list(saved.keys())}")
    
    else:
        # Default: run interactive demo
        interactive_demo()


if __name__ == "__main__":
    main()

