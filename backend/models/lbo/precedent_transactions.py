"""
Uses an AI agent to find precedent LBO & M&A transactions.
"""
import os
import asyncio
from typing import List, Dict, Any, Optional

# Lazy import to avoid crashing if mcp package is not installed
_ai_gatherer: Optional[Any] = None
AI_ENABLED = False

def _get_ai_gatherer():
    """Lazy import and initialization of AI gatherer."""
    global _ai_gatherer, AI_ENABLED
    if _ai_gatherer is not None:
        return _ai_gatherer
    
    try:
        from ai_enhanced_data_gatherer import AIEnhancedDataGatherer
        _ai_gatherer = AIEnhancedDataGatherer()
        AI_ENABLED = True
        return _ai_gatherer
    except ImportError as e:
        print(f"⚠️ AI for precedent transactions disabled: {e}")
        AI_ENABLED = False
        return None
    except Exception as e:
        print(f"⚠️ AI for precedent transactions disabled: {e}")
        AI_ENABLED = False
        return None

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
        return []

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
        ai_gatherer = _get_ai_gatherer()
        if not ai_gatherer:
            return []  # Return empty list if AI not available
        
        await ai_gatherer._initialize()
        response = await ai_gatherer.agent.run(prompt)
        output = getattr(response, "output", "")
        start = output.find('[')
        end = output.rfind(']') + 1
        if start != -1 and end != -1:
            import json
            return json.loads(output[start:end])
        return [{"error": "Failed to parse a valid JSON array from the AI response."}]
    except Exception as e:
        print(f"❌ Error finding precedent transactions with AI: {e}")
        return [{"error": f"An exception occurred while querying the AI agent: {e}"}]

if __name__ == '__main__':
    async def main():
        transactions = await find_precedent_transactions("DELL", "Hardware Technology")
        print(transactions)
    asyncio.run(main())
