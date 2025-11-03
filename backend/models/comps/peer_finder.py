"""
Uses an AI agent to identify a peer group of comparable public companies.
"""
import asyncio
import json
from typing import List, Dict, Any

from ai_enhanced_data_gatherer import AIEnhancedDataGatherer

# Initialize the AI data gatherer
try:
    ai_gatherer = AIEnhancedDataGatherer()
    AI_ENABLED = True
except Exception as e:
    print(f"⚠️ AI for peer group finding disabled: {e}")
    AI_ENABLED = False

async def find_peer_group(ticker: str, industry: str) -> List[str]:
    """
    Uses an AI agent to identify a peer group of 5-10 comparable public companies.

    Args:
        ticker: The ticker symbol of the target company.
        industry: The industry of the target company.

    Returns:
        A list of ticker symbols for the identified peer group.
    """
    if not AI_ENABLED:
        raise ConnectionError("AI agent is not available for finding peer group.")

    prompt = f"""
    As a senior investment banking analyst, your task is to identify a relevant peer group for valuing {ticker},
    a company in the '{industry}' sector.

    Identify a peer group of 5 to 8 publicly traded companies that are highly comparable to {ticker} based on:
    1.  Primary Industry and Business Model
    2.  Market Capitalization
    3.  End Markets and Customer Base

    Provide your answer ONLY as a JSON array of strings, where each string is the ticker symbol
    for a comparable company. Do not include {ticker} in the list.

    Example response for a company like 'HD': ["LOW", "TSCO", "FND"]
    """

    try:
        await ai_gatherer._initialize()
        response = await ai_gatherer.agent.run(prompt)
        
        output = getattr(response, "output", "")
        # Robustly find the JSON array within the AI's response string
        start = output.find('[')
        end = output.rfind(']') + 1
        
        if start != -1 and end != -1:
            json_str = output[start:end]
            peer_group = json.loads(json_str)
            # Ensure it's a list of strings
            if isinstance(peer_group, list) and all(isinstance(i, str) for i in peer_group):
                return peer_group
            else:
                raise ValueError("AI response was not a valid list of strings.")
        else:
            raise ValueError("No valid JSON array found in the AI response.")

    except Exception as e:
        print(f"❌ Error finding peer group with AI for {ticker}: {e}")
        # In a real app, you might want a fallback, but for comps, a bad peer group is worse than none.
        raise RuntimeError(f"Failed to get a valid peer group from the AI agent: {e}")

if __name__ == '__main__':
    async def main():
        try:
            peers = await find_peer_group("MSFT", "Software - Infrastructure")
            print("Peer group for MSFT:", peers)
            peers_hd = await find_peer_group("HD", "Home Improvement Retail")
            print("Peer group for HD:", peers_hd)
        except Exception as e:
            print(e)

    asyncio.run(main())
