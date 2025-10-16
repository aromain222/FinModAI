"""
AI Financial Analyst using Polygon.io MCP Server and Claude 4
Based on Polygon.io community tutorial
"""

import asyncio
from typing import List, Optional
from pydantic_ai import Agent
from pydantic_ai.models import Model
from pydantic_ai.mcp import MCPServerStdio
import os
from dotenv import load_dotenv
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.live import Live
from rich.table import Table

# Load environment variables
load_dotenv()

console = Console()


def create_polygon_mcp_server():
    """Create and configure the Polygon.io MCP server."""
    env = os.environ.copy()
    
    return MCPServerStdio(
        command="uvx",
        args=[
            "--from",
            "git+https://github.com/polygon-io/mcp_polygon@v0.4.0",
            "mcp_polygon"
        ],
        env=env
    )


async def create_agent():
    """Create the AI financial analyst agent."""
    server = create_polygon_mcp_server()
    
    agent = Agent(
        model="anthropic:claude-4-sonnet-20250514",
        mcp_servers=[server],
        system_prompt=(
            "You are an expert financial analyst with access to real-time market data. "
            "Your role is to provide accurate, insightful analysis based on the latest market information.\n\n"
            "Guidelines:\n"
            "- Prices from Polygon.io are already stock split adjusted\n"
            "- Use the latest data available for all queries\n"
            "- Always double-check your math and calculations\n"
            "- For questions about the current date, use the 'get_today_date' tool\n"
            "- For complex queries, break them into logical subtasks\n"
            "- Provide clear, concise answers with supporting data\n"
            "- Include relevant metrics (P/E ratios, market cap, revenue, etc.)\n"
            "- When comparing companies, highlight key differences\n"
            "- Always cite your data sources\n"
            "- Be transparent about limitations and uncertainties"
        )
    )
    
    return agent


async def chat_interface():
    """Interactive chat interface for the AI financial analyst."""
    console.print(Panel.fit(
        "[bold cyan]AI Financial Analyst[/bold cyan]\n\n"
        "Ask me anything about stocks, markets, or financial data!\n"
        "Powered by Polygon.io + Claude 4 + Pydantic AI\n\n"
        "Type 'exit' or 'quit' to end the session.",
        border_style="cyan"
    ))
    
    agent = await create_agent()
    message_history: List[tuple] = []
    
    while True:
        try:
            # Get user input
            user_input = console.input("\n[bold green]You:[/bold green] ").strip()
            
            if user_input.lower() in ['exit', 'quit', 'q']:
                console.print("\n[cyan]Thank you for using AI Financial Analyst! Goodbye![/cyan]")
                break
            
            if not user_input:
                continue
            
            # Show thinking indicator
            with Live("[yellow]Analyzing...[/yellow]", console=console, transient=True):
                response = await agent.run(
                    user_input,
                    message_history=message_history
                )
            
            # Display response
            console.print("\n[bold blue]AI Analyst:[/bold blue]")
            console.print(Markdown(response.data))
            
            # Update message history
            message_history.append(('user', user_input))
            message_history.append(('assistant', response.data))
            
        except KeyboardInterrupt:
            console.print("\n\n[yellow]Interrupted. Exiting...[/yellow]")
            break
        except Exception as e:
            console.print(f"\n[bold red]Error:[/bold red] {e}")
            console.print("[yellow]Please try again or type 'exit' to quit.[/yellow]")


async def single_query(query: str) -> str:
    """Execute a single query and return the response."""
    agent = await create_agent()
    
    response = await agent.run(query)
    return response.data


def run_interactive():
    """Run the interactive chat interface."""
    asyncio.run(chat_interface())


if __name__ == "__main__":
    # Check for required API keys
    if not os.getenv('POLYGON_API_KEY'):
        console.print("[bold red]Error: POLYGON_API_KEY not found in environment[/bold red]")
        console.print("Please set your Polygon.io API key in the .env file")
        exit(1)
    
    if not os.getenv('ANTHROPIC_API_KEY'):
        console.print("[bold red]Error: ANTHROPIC_API_KEY not found in environment[/bold red]")
        console.print("Please set your Anthropic API key in the .env file")
        exit(1)
    
    # Run the interactive interface
    run_interactive()

