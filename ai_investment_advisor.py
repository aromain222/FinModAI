"""
AI Investment Advisor Chatbot
Provides investment advice, company analysis, and model interpretation
"""

import os
import asyncio
from typing import Dict, List, Optional, Any
from datetime import datetime
from pydantic_ai import Agent, RunContext
from pydantic_ai.mcp import MCPServerStdio
from dotenv import load_dotenv
import json

load_dotenv()


class AIInvestmentAdvisor:
    """
    AI-powered investment advisor that provides:
    - Investment advice
    - Company performance analysis
    - Model interpretation (e.g., "What does CapEx mean?")
    - Market insights
    """
    
    def __init__(self):
        self.agent = None
        self._initialized = False
    
    async def _initialize(self):
        """Initialize the AI investment advisor."""
        if self._initialized:
            return
        
        # Create Polygon.io MCP server for real-time data
        polygon_api_key = os.getenv("POLYGON_API_KEY")
        if not polygon_api_key:
            raise Exception("POLYGON_API_KEY is not set")
        
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
        
        # Create AI agent with investment expertise
        self.agent = Agent(
            model="anthropic:claude-4-sonnet-20250514",
            mcp_servers=[server],
            system_prompt=(
                "You are an expert investment advisor and financial analyst with deep knowledge of "
                "financial modeling, valuation, and market analysis.\n\n"
                "Your role is to:\n"
                "1. Provide clear, actionable investment advice\n"
                "2. Explain financial concepts in simple terms\n"
                "3. Analyze company performance and market trends\n"
                "4. Interpret financial model outputs\n"
                "5. Answer questions about financial metrics\n\n"
                "Guidelines:\n"
                "- Use real-time market data from Polygon.io\n"
                "- Explain technical terms clearly\n"
                "- Provide context for financial metrics\n"
                "- Be honest about risks and uncertainties\n"
                "- Always include disclaimers (not financial advice)\n"
                "- Use examples to illustrate concepts\n"
                "- Format responses clearly with bullet points\n"
                "- Include relevant data and numbers\n\n"
                "When explaining financial concepts:\n"
                "- Define the term clearly\n"
                "- Explain what it measures\n"
                "- Provide context (what's good/bad)\n"
                "- Give real examples\n"
                "- Explain how it's calculated\n\n"
                "When giving investment advice:\n"
                "- Analyze current market conditions\n"
                "- Consider risk factors\n"
                "- Provide balanced perspective\n"
                "- Include disclaimers\n"
                "- Suggest further research\n"
            )
        )
        
        # Add custom tools
        @self.agent.tool
        def get_today_date(ctx: RunContext) -> str:
            """Returns today's date in YYYY-MM-DD format."""
            from datetime import date
            return str(date.today())
        
        @self.agent.tool
        def get_current_market_conditions(ctx: RunContext) -> str:
            """Get current market conditions and sentiment."""
            return "Market conditions retrieved from Polygon.io"
        
        self._initialized = True
    
    async def ask_investment_question(self, question: str) -> str:
        """
        Ask an investment-related question.
        
        Examples:
        - "Which tech companies are performing well?"
        - "Should I invest in TSLA?"
        - "What's the outlook for the EV market?"
        """
        await self._initialize()
        
        query = f"""
        As an investment advisor, answer this question: {question}
        
        Please provide:
        1. Clear, actionable answer
        2. Supporting data and analysis
        3. Risk factors to consider
        4. Balanced perspective
        5. Disclaimer that this is not financial advice
        
        Use real-time market data when available.
        """
        
        async with self.agent.run_mcp_servers():
            response = await self.agent.run(query)
            output = getattr(response, "output", None)
            return output if output else str(response)
    
    async def explain_financial_concept(self, concept: str) -> str:
        """
        Explain a financial concept or metric.
        
        Examples:
        - "What is CapEx?"
        - "What does EBITDA mean?"
        - "Explain free cash flow"
        - "What is the P/E ratio?"
        """
        await self._initialize()
        
        query = f"""
        Explain this financial concept: {concept}
        
        Please provide:
        1. Clear definition
        2. What it measures
        3. How it's calculated
        4. What's considered good/bad
        5. Real-world examples
        6. Why it matters for investors
        
        Use simple language and examples.
        """
        
        async with self.agent.run_mcp_servers():
            response = await self.agent.run(query)
            output = getattr(response, "output", None)
            return output if output else str(response)
    
    async def analyze_company_performance(self, ticker: str) -> str:
        """
        Analyze a company's performance.
        
        Args:
            ticker: Stock ticker (e.g., 'AAPL', 'TSLA')
        """
        await self._initialize()
        
        query = f"""
        Analyze the performance of {ticker}.
        
        Please provide:
        1. Current stock price and market cap
        2. Recent performance (1D, 1W, 1M, 1Y)
        3. Key financial metrics
        4. Strengths and weaknesses
        5. Competitive position
        6. Risk factors
        7. Investment outlook
        
        Use real-time market data.
        """
        
        async with self.agent.run_mcp_servers():
            response = await self.agent.run(query)
            output = getattr(response, "output", None)
            return output if output else str(response)
    
    async def interpret_model_output(self, model_type: str, output_data: Dict[str, Any]) -> str:
        """
        Interpret financial model output.
        
        Args:
            model_type: Type of model (e.g., 'DCF', 'LBO', 'Comps')
            output_data: Model output data
        """
        await self._initialize()
        
        query = f"""
        Interpret this {model_type} model output:
        
        {json.dumps(output_data, indent=2)}
        
        Please explain:
        1. What the key metrics mean
        2. Whether the results are good/bad
        3. What the assumptions imply
        4. Key risks and sensitivities
        5. What investors should focus on
        6. Recommendations for further analysis
        
        Use clear language and provide context.
        """
        
        async with self.agent.run_mcp_servers():
            response = await self.agent.run(query)
            output = getattr(response, "output", None)
            return output if output else str(response)
    
    async def get_market_insights(self) -> str:
        """
        Get general market insights and trends.
        """
        await self._initialize()
        
        query = """
        Provide current market insights and trends.
        
        Please include:
        1. Overall market sentiment
        2. Top performing sectors
        3. Key market drivers
        4. Notable trends
        5. Risk factors
        6. Investment opportunities
        
        Use real-time market data.
        """
        
        async with self.agent.run_mcp_servers():
            response = await self.agent.run(query)
            output = getattr(response, "output", None)
            return output if output else str(response)


# Convenience functions
async def ask_investment_question(question: str) -> str:
    """Ask an investment question."""
    advisor = AIInvestmentAdvisor()
    return await advisor.ask_investment_question(question)


async def explain_financial_concept(concept: str) -> str:
    """Explain a financial concept."""
    advisor = AIInvestmentAdvisor()
    return await advisor.explain_financial_concept(concept)


async def analyze_company(ticker: str) -> str:
    """Analyze a company's performance."""
    advisor = AIInvestmentAdvisor()
    return await advisor.analyze_company_performance(ticker)


async def interpret_model(model_type: str, output_data: Dict[str, Any]) -> str:
    """Interpret financial model output."""
    advisor = AIInvestmentAdvisor()
    return await advisor.interpret_model_output(model_type, output_data)


async def get_market_insights() -> str:
    """Get market insights."""
    advisor = AIInvestmentAdvisor()
    return await advisor.get_market_insights()


# Example usage
if __name__ == "__main__":
    async def main():
        advisor = AIInvestmentAdvisor()
        
        print("="*60)
        print("AI Investment Advisor - Examples")
        print("="*60)
        
        # Example 1: Explain a concept
        print("\n1. Explaining CapEx:")
        print("-"*60)
        concept = await advisor.explain_financial_concept("What is CapEx?")
        print(concept)
        
        # Example 2: Analyze a company
        print("\n2. Analyzing AAPL:")
        print("-"*60)
        analysis = await advisor.analyze_company_performance("AAPL")
        print(analysis)
        
        # Example 3: Investment question
        print("\n3. Investment Question:")
        print("-"*60)
        answer = await advisor.ask_investment_question("Which tech companies are performing well?")
        print(answer)
    
    asyncio.run(main())

