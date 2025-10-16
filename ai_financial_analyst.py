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
    polygon_api_key = os.getenv("POLYGON_API_KEY")
    if not polygon_api_key:
        raise Exception("POLYGON_API_KEY is not set in the environment or .env file.")
    
    env = os.environ.copy()
    env["POLYGON_API_KEY"] = polygon_api_key
    
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
    from datetime import date
    from pydantic_ai import RunContext
    
    server = create_polygon_mcp_server()
    
    agent = Agent(
        model="anthropic:claude-4-sonnet-20250514",
        mcp_servers=[server],
        system_prompt=(
            "You are an expert financial analyst. "
            "Note that when using Polygon tools, prices are already stock split adjusted. "
            "Use the latest data available. Always double check your math. "
            "For any questions about the current date, use the 'get_today_date' tool. "
            "For long or complex queries, break the query into logical subtasks and "
            "process each subtask in order."
        )
    )
    
    # Add custom tool for today's date
    @agent.tool
    def get_today_date(ctx: RunContext) -> str:
        """Returns today's date in YYYY-MM-DD format."""
        return str(date.today())
    
    return agent


def print_agent_response(response):
    """Print the agent's response in a formatted way."""
    console.print("\n[bold green]✔ Query processed successfully![/bold green]")
    console.print("[bold]Agent Response:[/bold]")
    output = getattr(response, "output", None)
    if output is not None:
        # Try to render as Markdown if it looks like Markdown
        if any(tag in output for tag in ["#", "*", "`", "-", ">"]):
            console.print(Markdown(output))
        else:
            console.print(output.strip())
    elif isinstance(response, str):
        console.print(response.strip())
    else:
        console.print(str(response))
    console.print("---------------------\n")


def print_agent_error(error):
    """Print errors in a formatted way."""
    console.print("\n[bold red]!!! Error !!![/bold red]")
    if isinstance(error, Exception):
        console.print(str(error).strip())
    elif isinstance(error, dict):
        import json
        console.print(json.dumps(error, indent=2))
    else:
        console.print(str(error).strip())
    console.print("------------------\n")


def print_tools_used(response):
    """Print which tools were used in the query."""
    tools = set()
    for msg in response.all_messages():
        if hasattr(msg, "parts"):
            for part in msg.parts:
                if hasattr(part, "tool_name"):
                    tools.add(part.tool_name)
    if tools:
        console.print(f"[dim]Tools used in this run: {', '.join(tools)}[/dim]")
    else:
        console.print("[dim]No tools used in this run.[/dim]")


async def chat_interface():
    """Interactive chat interface for the AI financial analyst."""
    console.print(Panel.fit(
        "[bold cyan]AI Financial Analyst[/bold cyan]\n\n"
        "Ask me anything about stocks, markets, or financial data!\n"
        "Powered by Polygon.io + Claude 4 + Pydantic AI\n\n"
        "Type 'exit' to quit.",
        border_style="cyan"
    ))
    
    try:
        agent = await create_agent()
        
        async with agent.run_mcp_servers():
            message_history = []
            
            while True:
                try:
                    # Get user input
                    user_input = console.input("\n> ").strip()
                    
                    if user_input.lower() == 'exit':
                        console.print("\n[cyan]Goodbye![/cyan]")
                        break
                    
                    if not user_input:
                        continue
                    
                    # Run the agent with message history
                    response = await agent.run(
                        user_input,
                        message_history=message_history
                    )
                    
                    # Display response
                    print_agent_response(response)
                    print_tools_used(response)
                    
                    # Update message history with agent's message objects
                    message_history = response.all_messages()
                    
                except KeyboardInterrupt:
                    console.print("\n\n[cyan]Goodbye![/cyan]")
                    break
                except Exception as e:
                    print_agent_error(e)
                    
    except Exception as setup_err:
        console.print(f"[bold red]Failed to start CLI agent or MCP server: {setup_err}[/bold red]")
        console.print("\n[yellow]Please check your API keys in the .env file.[/yellow]")


async def single_query(query: str) -> str:
    """Execute a single query and return the response."""
    agent = await create_agent()
    
    async with agent.run_mcp_servers():
        response = await agent.run(query)
        output = getattr(response, "output", None)
        if output is not None:
            return output
        elif isinstance(response, str):
            return response
        else:
            return str(response)


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

