#!/usr/bin/env python3
"""
Quick test script for AI Financial Analyst
"""

import os
import asyncio
from dotenv import load_dotenv
from rich.console import Console

# Load environment variables
load_dotenv()

console = Console()


async def test_ai_analyst():
    """Test the AI Financial Analyst with a simple query."""
    
    # Check API keys
    console.print("\n[bold cyan]Checking API Keys...[/bold cyan]")
    
    polygon_key = os.getenv('POLYGON_API_KEY')
    anthropic_key = os.getenv('ANTHROPIC_API_KEY')
    
    if not polygon_key or polygon_key == 'your_polygon_api_key_here':
        console.print("[bold red]❌ POLYGON_API_KEY not configured[/bold red]")
        console.print("Please add your Polygon.io API key to the .env file")
        return False
    else:
        console.print(f"[green]✅ Polygon.io API Key configured[/green] ({polygon_key[:8]}...)")
    
    if not anthropic_key or anthropic_key == 'your_anthropic_api_key_here':
        console.print("[bold red]❌ ANTHROPIC_API_KEY not configured[/bold red]")
        console.print("Please add your Anthropic API key to the .env file")
        return False
    else:
        console.print(f"[green]✅ Anthropic API Key configured[/green] ({anthropic_key[:8]}...)")
    
    # Test import
    console.print("\n[bold cyan]Testing Imports...[/bold cyan]")
    
    try:
        from ai_financial_analyst import create_agent, single_query
        console.print("[green]✅ AI analyst module imported successfully[/green]")
    except ImportError as e:
        console.print(f"[bold red]❌ Import failed: {e}[/bold red]")
        console.print("Please install dependencies: pip install -r requirements_ai_analyst.txt")
        return False
    
    # Test with a simple query
    console.print("\n[bold cyan]Testing AI Analyst with Query...[/bold cyan]")
    console.print("[yellow]Query: 'What is the current price of Apple stock?'[/yellow]\n")
    
    try:
        response = await single_query("What is the current price of Apple stock?")
        console.print("[green]✅ Query successful![/green]")
        console.print("\n[bold]Response:[/bold]")
        console.print(response)
        return True
    except Exception as e:
        console.print(f"[bold red]❌ Query failed: {e}[/bold red]")
        return False


if __name__ == "__main__":
    console.print("[bold cyan]AI Financial Analyst Test Suite[/bold cyan]")
    console.print("=" * 60)
    
    success = asyncio.run(test_ai_analyst())
    
    console.print("\n" + "=" * 60)
    if success:
        console.print("[bold green]✅ All tests passed![/bold green]")
        console.print("\nYou can now run: python ai_financial_analyst.py")
    else:
        console.print("[bold red]❌ Some tests failed[/bold red]")
        console.print("\nPlease fix the issues above and try again")
    
    console.print()

