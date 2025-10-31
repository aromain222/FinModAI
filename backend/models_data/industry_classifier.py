"""
Intelligent Industry Classification and Analysis System
"""

from dataclasses import dataclass
from typing import Dict, List, Optional, Set, Tuple
import pandas as pd
import numpy as np
from datetime import datetime
import logging
import json

logger = logging.getLogger(__name__)

@dataclass
class IndustryProfile:
    """Industry-specific characteristics and metrics"""
    name: str
    sector: str
    sub_sector: str
    key_metrics: List[str]
    typical_margins: Dict[str, float]
    growth_expectations: Dict[str, float]
    seasonality_pattern: Optional[Dict[str, List[int]]] = None
    macro_sensitivities: Optional[Dict[str, float]] = None
    regulatory_factors: Optional[List[str]] = None
    
    @property
    def is_seasonal(self) -> bool:
        return bool(self.seasonality_pattern and self.seasonality_pattern.get("peak_quarters"))

class IndustryClassifier:
    """Classifies companies into detailed industry profiles"""
    
    def __init__(self):
        self.industry_profiles = self._load_industry_profiles()
        
    def _load_industry_profiles(self) -> Dict[str, IndustryProfile]:
        """Load industry classification profiles"""
        return {
            "consumer_tech": IndustryProfile(
                name="Consumer Technology",
                sector="Information Technology",
                sub_sector="Consumer Electronics",
                key_metrics=["services_revenue", "hardware_margin", "r&d_percent"],
                typical_margins={
                    "gross_margin": 0.40,
                    "ebitda_margin": 0.30,
                    "operating_margin": 0.25
                },
                growth_expectations={
                    "revenue": 0.08,
                    "ebitda": 0.10,
                    "market": 0.07
                },
                seasonality_pattern={
                    "peak_quarters": [1, 4],  # Holiday and product launch
                    "trough_quarters": [2, 3],
                    "product_cycles": [3, 4]  # New product launches
                },
                macro_sensitivities={
                    "consumer_spending": 0.8,
                    "supply_chain": 0.7,
                    "tech_adoption": 0.6,
                    "competition": 0.8
                },
                regulatory_factors=[
                    "Privacy regulations",
                    "App store rules",
                    "Antitrust scrutiny",
                    "Environmental standards"
                ]
            ),
            "auto_manufacturing": IndustryProfile(
                name="Automotive Manufacturing",
                sector="Consumer Discretionary",
                sub_sector="Automobile Manufacturers",
                key_metrics=["units_sold", "asp", "production_capacity"],
                typical_margins={
                    "gross_margin": 0.25,
                    "ebitda_margin": 0.12,
                    "operating_margin": 0.08
                },
                growth_expectations={
                    "revenue": 0.10,
                    "ebitda": 0.12,
                    "market": 0.08
                },
                seasonality_pattern={
                    "peak_quarters": [2, 3],  # Spring/Summer sales
                    "trough_quarters": [1, 4],  # Winter slowdown
                    "model_cycles": [3]  # New model year releases
                },
                macro_sensitivities={
                    "consumer_confidence": 0.9,
                    "interest_rates": 0.8,
                    "fuel_prices": 0.7,
                    "supply_chain": 0.8,
                    "raw_materials": 0.7
                },
                regulatory_factors=[
                    "Emissions standards",
                    "Safety regulations",
                    "Trade policies",
                    "Labor laws"
                ]
            ),
            "luxury_apparel": IndustryProfile(
                name="Luxury Apparel",
                sector="Consumer Discretionary",
                sub_sector="Apparel & Luxury Goods",
                key_metrics=["gross_margin", "dct_revenue_percent", "inventory_turnover"],
                typical_margins={
                    "gross_margin": 0.60,
                    "ebitda_margin": 0.15,
                    "operating_margin": 0.12
                },
                growth_expectations={
                    "revenue": 0.06,
                    "ebitda": 0.07,
                    "market": 0.05
                },
                seasonality_pattern={
                    "peak_quarters": [3, 4],
                    "trough_quarters": [1, 2],
                    "inventory_build": [2, 3]
                },
                macro_sensitivities={
                    "consumer_confidence": 0.8,
                    "disposable_income": 0.7,
                    "tourism": 0.6
                }
            ),
            "semiconductors": IndustryProfile(
                name="Semiconductors",
                sector="Information Technology",
                sub_sector="Semiconductors & Equipment",
                key_metrics=["r&d_percent", "fab_utilization", "design_wins"],
                typical_margins={
                    "gross_margin": 0.55,
                    "ebitda_margin": 0.35,
                    "operating_margin": 0.30
                },
                growth_expectations={
                    "revenue": 0.20,
                    "ebitda": 0.25,
                    "market": 0.15
                },
                seasonality_pattern={
                    "peak_quarters": [3, 4],  # Holiday and year-end demand
                    "trough_quarters": [1],   # Post-holiday slowdown
                    "inventory_cycles": [2, 3]  # Build for peak season
                },
                macro_sensitivities={
                    "ai_adoption": 0.9,
                    "data_center_spending": 0.8,
                    "gaming_market": 0.7,
                    "automotive_demand": 0.6,
                    "supply_chain": 0.8
                },
                regulatory_factors=[
                    "Export controls",
                    "China restrictions",
                    "Government subsidies",
                    "Environmental regulations"
                ]
            ),
            "investment_banking": IndustryProfile(
                name="Investment Banking",
                sector="Financials",
                sub_sector="Capital Markets",
                key_metrics=["trading_revenue", "advisory_fees", "assets_under_management"],
                typical_margins={
                    "gross_margin": 0.85,
                    "ebitda_margin": 0.30,
                    "operating_margin": 0.25
                },
                growth_expectations={
                    "revenue": 0.08,
                    "ebitda": 0.10,
                    "market": 0.07
                },
                seasonality_pattern={
                    "peak_quarters": [4, 1],  # Year-end and bonus season
                    "trough_quarters": [3],   # Summer slowdown
                    "deal_cycles": [2, 4]     # M&A and IPO seasons
                },
                macro_sensitivities={
                    "interest_rates": 0.9,
                    "market_volatility": 0.8,
                    "ipo_market": 0.7,
                    "m&a_activity": 0.8,
                    "regulatory_changes": 0.7
                },
                regulatory_factors=[
                    "Capital requirements",
                    "Trading regulations",
                    "Fiduciary rules",
                    "Stress tests"
                ]
            ),
            "tech_software": IndustryProfile(
                name="Technology Software",
                sector="Information Technology",
                sub_sector="Software",
                key_metrics=["arr", "net_revenue_retention", "cac_ratio"],
                typical_margins={
                    "gross_margin": 0.75,
                    "ebitda_margin": 0.25,
                    "operating_margin": 0.20
                },
                growth_expectations={
                    "revenue": 0.15,
                    "ebitda": 0.20,
                    "market": 0.12
                },
                macro_sensitivities={
                    "business_investment": 0.6,
                    "digital_transformation": 0.8,
                    "interest_rates": 0.4
                }
            )
        }
    
    def classify_company(self, 
                        ticker: str,
                        revenue: float,
                        ebitda: float,
                        description: str = None,
                        sic_code: str = None) -> IndustryProfile:
        """
        Classify a company into its industry profile
        Uses multiple data points for accurate classification
        """
        try:
            # Use SIC code if available
            if sic_code:
                profile = self._classify_by_sic(sic_code)
                if profile:
                    return profile
            
            # Use company description if available
            if description:
                profile = self._classify_by_description(description)
                if profile:
                    return profile
            
            # Fallback to financial metrics
            return self._classify_by_metrics(ticker, revenue, ebitda)
            
        except Exception as e:
            logger.error(f"Error classifying company {ticker}: {e}")
            raise
    
    def _classify_by_sic(self, sic_code: str) -> Optional[IndustryProfile]:
        """Classify based on SIC code"""
        sic_mappings = {
            "2300": "luxury_apparel",    # Apparel
            "7372": "tech_software",     # Software
            "3571": "consumer_tech",     # Electronic Computers
            "3674": "semiconductors",    # Semiconductors
            "3711": "auto_manufacturing" # Motor Vehicles
            # Add more mappings...
        }
        
        industry_key = sic_mappings.get(sic_code[:4])
        return self.industry_profiles.get(industry_key)
    
    def _classify_by_description(self, description: str) -> Optional[IndustryProfile]:
        """Classify based on company description"""
        # Keywords for each industry
        industry_keywords = {
            "luxury_apparel": {
                "apparel", "clothing", "fashion", "luxury", "retail",
                "garments", "accessories", "lifestyle", "wear"
            },
            "tech_software": {
                "software", "saas", "cloud", "platform", "technology",
                "digital", "solutions", "enterprise", "applications"
            }
            # Add more industries...
        }
        
        # Convert description to lowercase words
        words = set(description.lower().split())
        
        # Find best matching industry
        best_match = None
        max_matches = 0
        
        for industry, keywords in industry_keywords.items():
            matches = len(words.intersection(keywords))
            if matches > max_matches:
                max_matches = matches
                best_match = industry
        
        return self.industry_profiles.get(best_match) if best_match else None
    
    def _classify_by_metrics(self, ticker: str, revenue: float, ebitda: float) -> IndustryProfile:
        """Classify based on financial metrics"""
        # Calculate key ratios
        ebitda_margin = ebitda / revenue if revenue else 0
        
        # Find closest matching industry profile
        best_match = None
        smallest_diff = float('inf')
        
        for name, profile in self.industry_profiles.items():
            margin_diff = abs(ebitda_margin - profile.typical_margins["ebitda_margin"])
            if margin_diff < smallest_diff:
                smallest_diff = margin_diff
                best_match = name
        
        return self.industry_profiles[best_match]

class IndustryAnalyzer:
    """Analyzes company performance within its industry context"""
    
    def __init__(self, industry_profile: IndustryProfile):
        self.profile = industry_profile
    
    def analyze_margins(self, company_margins: Dict[str, float]) -> Dict[str, any]:
        """Analyze company margins vs industry standards"""
        analysis = {}
        
        for margin_type, industry_margin in self.profile.typical_margins.items():
            company_margin = company_margins.get(margin_type, 0)
            diff = company_margin - industry_margin
            
            analysis[margin_type] = {
                "company": company_margin,
                "industry": industry_margin,
                "difference": diff,
                "assessment": "above" if diff > 0.02 else "below" if diff < -0.02 else "in-line"
            }
        
        return analysis
    
    def analyze_growth(self, historical_growth: float) -> Dict[str, any]:
        """Analyze growth rates vs industry expectations"""
        industry_growth = self.profile.growth_expectations["revenue"]
        diff = historical_growth - industry_growth
        
        return {
            "company_growth": historical_growth,
            "industry_growth": industry_growth,
            "difference": diff,
            "assessment": "above" if diff > 0.02 else "below" if diff < -0.02 else "in-line",
            "outlook": self._assess_growth_outlook(historical_growth, industry_growth)
        }
    
    def _assess_growth_outlook(self, historical: float, industry: float) -> str:
        """Assess growth outlook based on historical performance"""
        if historical > industry * 1.5:
            return "Strong growth momentum above industry average"
        elif historical > industry:
            return "Moderate growth above industry average"
        elif historical > industry * 0.5:
            return "Growth below industry average but positive"
        else:
            return "Growth significantly lags industry"
    
    def analyze_seasonality(self) -> Optional[Dict[str, any]]:
        """Analyze seasonality impact if applicable"""
        if not self.profile.seasonality_pattern:
            return None
            
        return {
            "pattern": self.profile.seasonality_pattern,
            "implications": self._get_seasonality_implications(),
            "risk_level": self._assess_seasonality_risk()
        }
    
    def _get_seasonality_implications(self) -> List[str]:
        """Get business implications of seasonality"""
        if not self.profile.seasonality_pattern:
            return []
            
        implications = []
        peak_quarters = self.profile.seasonality_pattern.get("peak_quarters", [])
        
        if peak_quarters:
            implications.extend([
                "Working capital needs vary significantly by season",
                "Inventory management critical before peak season",
                "Cash flow patterns highly seasonal"
            ])
            
        return implications
    
    def _assess_seasonality_risk(self) -> str:
        """Assess risk level from seasonality"""
        if not self.profile.seasonality_pattern:
            return "low"
            
        peak_quarters = len(self.profile.seasonality_pattern.get("peak_quarters", []))
        if peak_quarters <= 1:
            return "high"
        elif peak_quarters <= 2:
            return "medium"
        else:
            return "low"
    
    def analyze_macro_sensitivity(self) -> Dict[str, any]:
        """Analyze macroeconomic sensitivities"""
        if not self.profile.macro_sensitivities:
            return {}
            
        high_sensitivity = []
        medium_sensitivity = []
        low_sensitivity = []
        
        for factor, sensitivity in self.profile.macro_sensitivities.items():
            if sensitivity >= 0.7:
                high_sensitivity.append(factor)
            elif sensitivity >= 0.4:
                medium_sensitivity.append(factor)
            else:
                low_sensitivity.append(factor)
        
        return {
            "high_sensitivity": high_sensitivity,
            "medium_sensitivity": medium_sensitivity,
            "low_sensitivity": low_sensitivity,
            "overall_risk": self._assess_macro_risk()
        }
    
    def _assess_macro_risk(self) -> str:
        """Assess overall macroeconomic risk"""
        if not self.profile.macro_sensitivities:
            return "medium"
            
        avg_sensitivity = sum(self.profile.macro_sensitivities.values()) / len(self.profile.macro_sensitivities)
        
        if avg_sensitivity >= 0.7:
            return "high"
        elif avg_sensitivity >= 0.4:
            return "medium"
        else:
            return "low"
