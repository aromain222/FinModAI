"""
AI-Enhanced Data Gatherer for Financial Models
Uses Polygon.io MCP Server + Claude 4 to intelligently gather and validate data
"""

import asyncio
import os
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from pydantic_ai import Agent, RunContext
from pydantic_ai.mcp import MCPServerStdio
from dotenv import load_dotenv
import json

load_dotenv()


class AIEnhancedDataGatherer:
    """
    Enhanced data gatherer that uses AI to intelligently fetch and validate
    financial data for DCF/LBO/Comps/Merger models.
    """
    
    def __init__(self):
        self.agent = None
        self._initialized = False
    
    async def _initialize(self):
        """Initialize the AI agent with Polygon.io MCP server."""
        if self._initialized:
            return
        
        # Create Polygon.io MCP server
        polygon_api_key = os.getenv("POLYGON_API_KEY")
        if not polygon_api_key:
            raise Exception("POLYGON_API_KEY is not set in the environment or .env file.")
        
        env = os.environ.copy()
        env["POLYGON_API_KEY"] = polygon_api_key
        
        server = MCPServerStdio(
            command="uvx",
            args=[
                "--from",
                "git+https://github.com/polygon-io/mcp_polygon@v0.4.0",
                "mcp_polygon"
            ],
            env=env
        )
        
        # Create AI agent
        self.agent = Agent(
            model="anthropic:claude-4-sonnet-20250514",
            mcp_servers=[server],
            system_prompt=(
                "You are a financial data specialist. Your role is to gather accurate, "
                "real-time financial data for financial modeling (DCF, LBO, Comps, Merger).\n\n"
                "Guidelines:\n"
                "- Use Polygon.io tools to fetch real-time market data\n"
                "- Always verify data accuracy and completeness\n"
                "- For historical data, fetch at least 3 years of financials\n"
                "- Calculate missing metrics from available data\n"
                "- Report data quality and any gaps\n"
                "- Format all responses as structured JSON\n"
                "- Prices from Polygon.io are already stock split adjusted\n"
                "- Always double-check your math and calculations\n"
            )
        )
        
        # Add custom tools
        @self.agent.tool
        def get_today_date(ctx: RunContext) -> str:
            """Returns today's date in YYYY-MM-DD format."""
            from datetime import date
            return str(date.today())
        
        self._initialized = True
    
    async def gather_company_data(self, ticker: str) -> Dict[str, Any]:
        """
        Gather comprehensive company data using AI-enhanced methods.
        
        Args:
            ticker: Stock ticker symbol (e.g., 'AAPL')
            
        Returns:
            Dictionary containing all financial data needed for models
        """
        await self._initialize()
        
        query = f"""
        Gather comprehensive financial data for {ticker} including:
        
        1. Current Market Data:
           - Current stock price
           - Market capitalization
           - Shares outstanding
           - 52-week high/low
           - Beta
           - Volume (today and average)
        
        2. Historical Financials (last 3 years):
           - Revenue
           - EBIT
           - EBITDA
           - Net Income
           - Free Cash Flow
           - CapEx
           - Working Capital changes
        
        3. Balance Sheet Data:
           - Cash and equivalents
           - Total debt (short-term + long-term)
           - Net debt
           - Total assets
           - Total equity
        
        4. Valuation Metrics:
           - P/E ratio
           - EV/EBITDA
           - EV/Revenue
           - Price/Book
           - Dividend yield (if applicable)
        
        5. Recent Performance:
           - 1-day change
           - 1-week change
           - 1-month change
           - 1-year change
        
        Format the response as a structured JSON object with all fields.
        Include data quality indicators and any missing data.
        """
        
        async with self.agent.run_mcp_servers():
            response = await self.agent.run(query)
            
            # Extract structured data from response
            output = getattr(response, "output", None)
            
            # Try to parse JSON from the response
            try:
                if isinstance(output, str):
                    # Look for JSON in the response
                    if '{' in output and '}' in output:
                        # Extract JSON portion
                        start = output.find('{')
                        end = output.rfind('}') + 1
                        json_str = output[start:end]
                        data = json.loads(json_str)
                        return self._enhance_data(data, ticker)
            except json.JSONDecodeError:
                pass
            
            # If JSON parsing fails, return a structured response
            return self._parse_text_response(output, ticker)
    
    def _enhance_data(self, data: Dict[str, Any], ticker: str) -> Dict[str, Any]:
        """Enhance and validate the gathered data."""
        enhanced = {
            'ticker': ticker,
            'gathered_at': datetime.now().isoformat(),
            'data_source': 'polygon_ai_enhanced',
            'data_quality': 'high',
        }
        
        # Add market data
        enhanced['market'] = {
            'price': data.get('current_price', 0),
            'market_cap': data.get('market_cap', 0),
            'shares_out': data.get('shares_outstanding', 0),
            'beta': data.get('beta', 1.0),
            'volume': data.get('volume', 0),
            'change_1d': data.get('change_1d', 0),
            'change_1d_pct': data.get('change_1d_pct', 0),
        }
        
        # Add historical financials
        enhanced['historicals'] = data.get('historical_financials', [])
        
        # Add balance sheet data
        enhanced['capital'] = {
            'cash': data.get('cash', 0),
            'gross_debt': data.get('total_debt', 0),
            'net_debt': data.get('net_debt', 0),
            'total_assets': data.get('total_assets', 0),
            'total_equity': data.get('total_equity', 0),
        }
        
        # Add valuation metrics
        enhanced['valuation'] = {
            'pe_ratio': data.get('pe_ratio', 0),
            'ev_ebitda': data.get('ev_ebitda', 0),
            'ev_revenue': data.get('ev_revenue', 0),
            'price_book': data.get('price_book', 0),
            'dividend_yield': data.get('dividend_yield', 0),
        }
        
        # Add latest financials
        if enhanced['historicals']:
            enhanced['latest'] = enhanced['historicals'][-1]
        
        return enhanced
    
    def _parse_text_response(self, text: str, ticker: str) -> Dict[str, Any]:
        """Parse a text response into structured data."""
        return {
            'ticker': ticker,
            'gathered_at': datetime.now().isoformat(),
            'data_source': 'polygon_ai_enhanced',
            'data_quality': 'medium',
            'raw_response': text,
            'market': {},
            'historicals': [],
            'capital': {},
        }
    
    async def validate_data_completeness(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate that all required data is present for model generation.
        
        Args:
            data: Company data dictionary
            
        Returns:
            Validation result with missing fields and data quality score
        """
        await self._initialize()
        
        query = f"""
        Validate the following financial data for completeness and accuracy:
        
        {json.dumps(data, indent=2)}
        
        Check for:
        1. Required fields for DCF model (revenue, EBIT, free cash flow, market cap)
        2. Required fields for LBO model (debt, equity, EBITDA, growth rates)
        3. Required fields for Comps model (valuation multiples, ratios)
        4. Data consistency (e.g., net debt = total debt - cash)
        5. Reasonable ranges for metrics
        
        Return a JSON object with:
        - data_quality_score (0-100)
        - missing_required_fields (list)
        - missing_optional_fields (list)
        - data_consistency_issues (list)
        - recommendations (list)
        """
        
        async with self.agent.run_mcp_servers():
            response = await self.agent.run(query)
            output = getattr(response, "output", None)
            
            try:
                if isinstance(output, str) and '{' in output:
                    start = output.find('{')
                    end = output.rfind('}') + 1
                    json_str = output[start:end]
                    return json.loads(json_str)
            except json.JSONDecodeError:
                pass
            
            return {
                'data_quality_score': 50,
                'missing_required_fields': [],
                'missing_optional_fields': [],
                'data_consistency_issues': [],
                'recommendations': ['Manual validation recommended'],
            }
    
    async def fill_missing_data(self, data: Dict[str, Any], ticker: str) -> Dict[str, Any]:
        """
        Use AI to intelligently fill in missing data fields.
        
        Args:
            data: Partial company data
            ticker: Stock ticker
            
        Returns:
            Enhanced data with missing fields filled
        """
        await self._initialize()
        
        query = f"""
        For {ticker}, fill in any missing financial data using:
        
        1. Available data: {json.dumps(data, indent=2)}
        
        2. Calculation methods:
           - EBITDA = EBIT + D&A (if EBIT is known)
           - Net Debt = Total Debt - Cash
           - Market Cap = Price × Shares Outstanding
           - Enterprise Value = Market Cap + Net Debt
        
        3. Industry benchmarks:
           - Use sector medians for missing ratios
           - Apply typical growth rates for projections
        
        4. Historical patterns:
           - Extrapolate from available historical data
           - Maintain consistency with past trends
        
        Return the complete dataset with all fields filled.
        Mark derived fields with a 'derived_from' attribute.
        """
        
        async with self.agent.run_mcp_servers():
            response = await self.agent.run(query)
            output = getattr(response, "output", None)
            
            try:
                if isinstance(output, str) and '{' in output:
                    start = output.find('{')
                    end = output.rfind('}') + 1
                    json_str = output[start:end]
                    filled_data = json.loads(json_str)
                    return filled_data
            except json.JSONDecodeError:
                pass
            
            return data
    
    async def get_peer_comparison(self, ticker: str, peers: List[str]) -> Dict[str, Any]:
        """
        Get peer comparison data for comps analysis.
        
        Args:
            ticker: Target ticker
            peers: List of peer tickers
            
        Returns:
            Comparison data including multiples and ratios
        """
        await self._initialize()
        
        query = f"""
        Compare {ticker} with peers {', '.join(peers)} on:
        
        1. Valuation Multiples:
           - P/E ratio
           - EV/EBITDA
           - EV/Revenue
           - Price/Book
           - Price/Sales
        
        2. Growth Metrics:
           - Revenue growth (1Y, 3Y, 5Y)
           - EBITDA growth
           - EPS growth
        
        3. Profitability:
           - EBITDA margin
           - Net margin
           - ROE
           - ROA
        
        4. Leverage:
           - Debt/Equity
           - Debt/EBITDA
           - Interest coverage
        
        5. Market Performance:
           - 1Y return
           - Beta
           - Volatility
        
        Return a structured comparison table with all metrics.
        """
        
        async with self.agent.run_mcp_servers():
            response = await self.agent.run(query)
            output = getattr(response, "output", None)
            
            return {
                'ticker': ticker,
                'peers': peers,
                'comparison_data': output,
                'generated_at': datetime.now().isoformat(),
            }


# Convenience functions for easy integration
async def gather_company_data_ai(ticker: str) -> Dict[str, Any]:
    """Convenience function to gather company data using AI."""
    gatherer = AIEnhancedDataGatherer()
    return await gatherer.gather_company_data(ticker)


async def validate_data_ai(data: Dict[str, Any]) -> Dict[str, Any]:
    """Convenience function to validate data using AI."""
    gatherer = AIEnhancedDataGatherer()
    return await gatherer.validate_data_completeness(data)


async def fill_missing_data_ai(data: Dict[str, Any], ticker: str) -> Dict[str, Any]:
    """Convenience function to fill missing data using AI."""
    gatherer = AIEnhancedDataGatherer()
    return await gatherer.fill_missing_data(data, ticker)


async def get_peer_comparison_ai(ticker: str, peers: List[str]) -> Dict[str, Any]:
    """Convenience function to get peer comparison using AI."""
    gatherer = AIEnhancedDataGatherer()
    return await gatherer.get_peer_comparison(ticker, peers)


# Example usage
if __name__ == "__main__":
    async def main():
        gatherer = AIEnhancedDataGatherer()
        
        print("🔍 Gathering data for AAPL using AI-enhanced methods...")
        data = await gatherer.gather_company_data('AAPL')
        
        print("\n📊 Gathered Data:")
        print(json.dumps(data, indent=2))
        
        print("\n✅ Validating data completeness...")
        validation = await gatherer.validate_data_completeness(data)
        
        print("\n📋 Validation Results:")
        print(json.dumps(validation, indent=2))
        
        if validation['data_quality_score'] < 80:
            print("\n🔧 Filling missing data...")
            enhanced_data = await gatherer.fill_missing_data(data, 'AAPL')
            print("\n📊 Enhanced Data:")
            print(json.dumps(enhanced_data, indent=2))
    
    asyncio.run(main())

