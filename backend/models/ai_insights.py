"""
Uses an AI agent to generate qualitative insights from financial data.
"""
import asyncio
import json
from typing import Dict, Any, Optional

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
        print(f"⚠️ AI for insights disabled: {e}")
        AI_ENABLED = False
        return None
    except Exception as e:
        print(f"⚠️ AI for insights disabled: {e}")
        AI_ENABLED = False
        return None

async def explain_model_results(model_name: str, model_data: Dict[str, Any]) -> str:
    """
    Generates a narrative summary of a financial model's results.
    """
    if not AI_ENABLED:
        raise ConnectionError("AI agent is not available for insights.")

    prompt = f"""
    As a senior investment banking analyst, your task is to provide a concise, professional summary
    of the following {model_name} model results. The output should be a single paragraph.

    Focus on the key drivers and the main conclusion. Do not just list the numbers. Explain what they mean.

    Model Results:
    {json.dumps(model_data, indent=2)}
    """
    try:
        ai_gatherer = _get_ai_gatherer()
        if not ai_gatherer:
            raise ConnectionError("AI agent is not available for insights.")
        
        await ai_gatherer._initialize()
        response = await ai_gatherer.agent.run(prompt)
        return getattr(response, "output", "No explanation available.")
    except Exception as e:
        print(f"❌ Error explaining model with AI: {e}")
        return "An error occurred while generating the explanation."

async def generate_risks_and_catalysts(ticker: str, financials: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generates a list of key risks and potential catalysts for a company.
    """
    if not AI_ENABLED:
        raise ConnectionError("AI agent is not available for insights.")
        
    prompt = f"""
    As a senior equity research analyst, your task is to identify key risks and potential catalysts
    for {ticker} based on the provided financial summary.

    Identify 2-3 primary risks and 2-3 primary catalysts. Present the answer ONLY as a JSON object
    with two keys: "risks" and "catalysts". Each key should contain an array of strings.

    Financial Summary:
    {json.dumps(financials, indent=2)}
    """
    try:
        ai_gatherer = _get_ai_gatherer()
        if not ai_gatherer:
            raise ConnectionError("AI agent is not available for insights.")
        
        await ai_gatherer._initialize()
        response = await ai_gatherer.agent.run(prompt)
        output = getattr(response, "output", "{}")
        # Find and parse the JSON object from the response
        start = output.find('{')
        end = output.rfind('}') + 1
        if start != -1 and end != -1:
            return json.loads(output[start:end])
        else:
            raise ValueError("No valid JSON object found in AI response.")
    except Exception as e:
        print(f"❌ Error generating risks/catalysts with AI: {e}")
        return {"risks": ["Error generating data."], "catalysts": ["Error generating data."]}
