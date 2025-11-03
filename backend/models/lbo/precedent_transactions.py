"""
Uses an AI agent to find precedent LBO & M&A transactions.
"""
import os
import asyncio
from typing import List, Dict, Any

from ai_enhanced_data_gatherer import AIEnhancedDataGatherer

# Initialize the AI data gatherer
try:
    ai_gatherer = AIEnhancedDataGatherer()
    AI_ENABLED = True
except Exception as e:
    print(f"⚠️ AI for precedent transactions disabled: {e}")
    AI_ENABLED = False

async def find_precedent_transactions(ticker: str, industry: str) -> List[Dict[str, Any]]:
    """
    Uses an AI agent to find recent LBO or M&A transactions for companies
    in a similar industry to the target company.
    
    Args:
        ticker: The ticker symbol of the target company.
        industry: The industry of the target company.
        
    Returns:
        A list of dictionaries, where each dictionary represents a transaction
        with details like target, acquirer, date, and EV/EBITDA multiple.
    """
    if not AI_ENABLED:
        return [
            {"error": "AI agent is not available for finding precedent transactions."}
        ]

    prompt = f"""
    Find at least 3 recent (last 2-3 years) Leveraged Buyout (LBO) or Merger & Acquisition (M&A)
    transactions for publicly traded companies in the '{industry}' sector, similar to {ticker}.

    For each transaction, provide the following information in a structured JSON format:
    - "target_company": The name of the company that was acquired.
    - "acquirer": The name of the acquiring firm (e.g., the private equity sponsor).
    - "announcement_date": The date the deal was announced (YYYY-MM-DD).
    - "enterprise_value_mm": The total enterprise value of the deal in millions of USD.
    - "ev_ebitda_multiple": The implied EV / LTM EBITDA multiple of the transaction.

    Return the result as a JSON array of objects. If you cannot find specific data for a field,
    leave it as null. Prioritize accuracy and cite sources if possible in a "notes" field.
    """

    try:
        # We need to run the async AI agent in a running event loop
        await ai_gatherer._initialize()
        response = await ai_gatherer.agent.run(prompt)
        
        # The AI response will be a string containing JSON, we need to parse it
        # (This parsing logic may need to be made more robust)
        output = getattr(response, "output", "")
        # A simple way to extract JSON from a string that might have surrounding text
        start = output.find('[')
        end = output.rfind(']') + 1
        if start != -1 and end != -1:
            import json
            return json.loads(output[start:end])
        else:
            return [{"error": "Failed to parse a valid JSON array from the AI response."}]

    except Exception as e:
        print(f"❌ Error finding precedent transactions with AI: {e}")
        return [
            {"error": f"An exception occurred while querying the AI agent: {e}"}
        ]

if __name__ == '__main__':
    # Example usage:
    # This needs to be run in an async context
    async def main():
        # You need to provide an industry for the ticker
        transactions = await find_precedent_transactions("DELL", "Hardware Technology")
        print(transactions)

    asyncio.run(main())
