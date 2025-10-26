"""
Enhanced gap filler combining financial logic and AI
"""

from typing import Dict, List, Optional, Tuple, Any
import logging
from datetime import datetime
import numpy as np
from dataclasses import asdict

from backend.models_data.financial_calculator import FinancialCalculator, FinancialMetrics
from backend.gap_filler_agent import GapFillerAgent
from backend.providers.polygon_provider import PolygonProvider
from backend.providers.alpha_vantage_provider import AlphaVantageProvider

logger = logging.getLogger(__name__)

class EnhancedGapFiller:
    """
    Enhanced gap filler that combines:
    1. Financial calculations
    2. Peer analysis
    3. Historical trends
    4. AI assistance
    """
    
    def __init__(self):
        self.calculator = FinancialCalculator()
        self.ai_filler = GapFillerAgent()
        self.polygon = PolygonProvider()
        self.alpha_vantage = AlphaVantageProvider()
        
    async def fill_gaps(self, 
                       ticker: str,
                       data: Dict[str, Any],
                       missing_fields: List[str],
                       peer_data: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """
        Fill gaps in financial data using multiple methods
        
        Args:
            ticker: Company ticker
            data: Existing company data
            missing_fields: Fields to fill
            peer_data: Optional peer company data
            
        Returns:
            Dict with filled values and metadata
        """
        filled_data = {}
        fill_metadata = {}
        
        for field in missing_fields:
            # Try methods in order of reliability
            filled = await self._try_fill_methods(
                field=field,
                ticker=ticker,
                data=data,
                peer_data=peer_data
            )
            
            if filled:
                filled_data[field] = filled.value
                fill_metadata[field] = {
                    "method": filled.method,
                    "confidence": filled.confidence,
                    "inputs": filled.inputs,
                    "timestamp": filled.timestamp.isoformat()
                }
            else:
                logger.warning(f"Could not fill {field} for {ticker}")
                
        return {
            "filled_data": filled_data,
            "metadata": fill_metadata
        }
        
    async def _try_fill_methods(self,
                              field: str,
                              ticker: str,
                              data: Dict[str, Any],
                              peer_data: Optional[List[Dict[str, Any]]] = None) -> Optional[FinancialMetrics]:
        """Try different methods to fill a gap"""
        
        # 1. Try financial calculations
        filled = self.calculator.derive_metric(field, data)
        if filled and filled.confidence >= 0.8:
            logger.info(f"Filled {field} using financial calculations")
            return filled
            
        # 2. Try historical analysis
        if "_ltm" in field or "_ntm" in field:
            filled = await self._analyze_historical_trends(field, ticker, data)
            if filled and filled.confidence >= 0.7:
                logger.info(f"Filled {field} using historical analysis")
                return filled
                
        # 3. Try peer analysis
        if peer_data:
            filled = self._analyze_peers(field, data, peer_data)
            if filled and filled.confidence >= 0.6:
                logger.info(f"Filled {field} using peer analysis")
                return filled
                
        # 4. Last resort: AI assistance
        filled = await self._use_ai_assistance(field, ticker, data)
        if filled:
            logger.info(f"Filled {field} using AI assistance")
            return filled
            
        return None
        
    async def _analyze_historical_trends(self,
                                       field: str,
                                       ticker: str,
                                       data: Dict[str, Any]) -> Optional[FinancialMetrics]:
        """Analyze historical trends to fill gaps"""
        try:
            # Get historical data
            if "_ltm" in field:
                base_field = field.replace("_ltm", "")
                history = await self.polygon.get_financial_history(ticker, base_field)
                
                if history and len(history) >= 4:  # Need at least 4 quarters
                    values = [h["value"] for h in history]
                    
                    # Calculate trend
                    growth_rates = [
                        (values[i] / values[i+1]) - 1
                        for i in range(len(values)-1)
                    ]
                    
                    avg_growth = np.mean(growth_rates)
                    std_growth = np.std(growth_rates)
                    
                    # Extrapolate if reasonable growth
                    if -0.5 <= avg_growth <= 2.0 and std_growth < 0.3:
                        value = values[0] * (1 + avg_growth)
                        return FinancialMetrics(
                            value=value,
                            confidence=0.7,
                            method="historical_trend",
                            inputs=[f"{base_field}_history"],
                            timestamp=datetime.now()
                        )
                        
            elif "_ntm" in field:
                # Similar for forward estimates
                base_field = field.replace("_ntm", "")
                history = await self.polygon.get_financial_history(ticker, base_field)
                estimates = await self.polygon.get_estimates(ticker)
                
                if history and estimates:
                    # Combine historical growth with analyst estimates
                    hist_growth = self.calculator._calculate_growth_rate(
                        history[0]["value"],
                        history[1]["value"]
                    )
                    est_growth = estimates.get(f"{base_field}_growth", 0)
                    
                    # Weighted average
                    growth = (hist_growth * 0.7 + est_growth * 0.3)
                    
                    if -0.5 <= growth <= 2.0:
                        value = data.get(f"{base_field}_ltm", history[0]["value"]) * (1 + growth)
                        return FinancialMetrics(
                            value=value,
                            confidence=0.65,
                            method="historical_and_estimates",
                            inputs=[f"{base_field}_history", f"{base_field}_estimates"],
                            timestamp=datetime.now()
                        )
                        
        except Exception as e:
            logger.warning(f"Historical analysis failed for {field}: {e}")
            
        return None
        
    def _analyze_peers(self,
                      field: str,
                      data: Dict[str, Any],
                      peer_data: List[Dict[str, Any]]) -> Optional[FinancialMetrics]:
        """Analyze peer data to fill gaps"""
        try:
            # Get peer values and ratios
            peer_values = []
            peer_ratios = []
            
            for peer in peer_data:
                if field in peer:
                    peer_values.append(peer[field])
                    
                    # Calculate relevant ratios
                    if "margin" in field and "revenue" in peer:
                        ratio = peer[field] / peer["revenue"]
                        peer_ratios.append(ratio)
                    elif "growth" in field:
                        ratio = self.calculator._calculate_growth_rate(
                            peer[field],
                            peer.get(f"{field}_prev", 0)
                        )
                        if ratio:
                            peer_ratios.append(ratio)
                            
            if peer_values:
                # Use median for more robustness
                if peer_ratios:
                    # Derive from ratio
                    median_ratio = np.median(peer_ratios)
                    if "margin" in field and "revenue" in data:
                        value = data["revenue"] * median_ratio
                    elif "growth" in field and f"{field}_prev" in data:
                        value = data[f"{field}_prev"] * (1 + median_ratio)
                    else:
                        value = np.median(peer_values)
                        
                    return FinancialMetrics(
                        value=value,
                        confidence=0.6,
                        method="peer_analysis",
                        inputs=["peer_data"],
                        timestamp=datetime.now()
                    )
                    
        except Exception as e:
            logger.warning(f"Peer analysis failed for {field}: {e}")
            
        return None
        
    async def _use_ai_assistance(self,
                                field: str,
                                ticker: str,
                                data: Dict[str, Any]) -> Optional[FinancialMetrics]:
        """Use AI to fill gaps as last resort"""
        try:
            # Get company profile for context
            profile = await self.alpha_vantage.get_company_overview(ticker)
            
            # Prepare context for AI
            context = {
                "company_profile": profile,
                "existing_data": data,
                "field_to_fill": field,
                "field_description": self._get_field_description(field)
            }
            
            # Get AI suggestion
            suggestion = await self.ai_filler.suggest_value(
                ticker=ticker,
                field=field,
                context=context
            )
            
            if suggestion and suggestion.get("value"):
                # Validate suggestion
                if self._validate_ai_suggestion(suggestion["value"], field, data):
                    return FinancialMetrics(
                        value=suggestion["value"],
                        confidence=0.5,  # Lower confidence for AI
                        method="ai_assisted",
                        inputs=suggestion.get("reasoning_chain", []),
                        timestamp=datetime.now()
                    )
                    
        except Exception as e:
            logger.warning(f"AI assistance failed for {field}: {e}")
            
        return None
        
    def _get_field_description(self, field: str) -> str:
        """Get description for a field"""
        descriptions = {
            "revenue": "Total sales or revenue",
            "ebitda": "Earnings before interest, taxes, depreciation and amortization",
            "ebit": "Earnings before interest and taxes",
            "net_income": "Net profit after all expenses",
            "eps": "Earnings per share",
            # Add more descriptions
        }
        return descriptions.get(field.replace("_ltm", "").replace("_ntm", ""), "")
        
    def _validate_ai_suggestion(self,
                              value: float,
                              field: str,
                              data: Dict[str, Any]) -> bool:
        """Validate AI suggested value"""
        try:
            # Basic range checks
            if value <= 0 and field not in ["net_income", "free_cash_flow"]:
                return False
                
            # Field-specific checks
            if "margin" in field and not 0 <= value <= 1:
                return False
                
            if "growth" in field and not -0.5 <= value <= 2.0:
                return False
                
            # Relationship checks
            if field == "ebitda_ltm" and "ebit_ltm" in data:
                if value < data["ebit_ltm"]:
                    return False
                    
            if field == "revenue_ltm" and "ebitda_ltm" in data:
                if value < data["ebitda_ltm"]:
                    return False
                    
            return True
            
        except Exception:
            return False
