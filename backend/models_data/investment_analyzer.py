"""
AI-Powered Investment Analysis Framework
Provides comprehensive scoring and contextual analysis for investment decisions
"""

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
import pandas as pd
import numpy as np
from datetime import datetime
import logging
import json
from enum import Enum

from .lbo_validator import CompanyMetrics, MarketConditions

logger = logging.getLogger(__name__)

class RiskLevel(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

class OpportunityLevel(Enum):
    WEAK = "weak"
    MODERATE = "moderate"
    STRONG = "strong"

@dataclass
class SeasonalityMetrics:
    """Metrics for analyzing business seasonality"""
    peak_quarters: List[int]
    trough_quarters: List[int]
    peak_to_trough_ratio: float
    revenue_std_dev: float
    
    @property
    def is_highly_seasonal(self) -> bool:
        return self.peak_to_trough_ratio > 2.0

@dataclass
class CompetitivePosition:
    """Analysis of company's competitive position"""
    market_share: float
    brand_strength: str  # "weak", "moderate", "strong"
    pricing_power: str   # "low", "medium", "high"
    barriers_to_entry: List[str]
    key_competitors: List[str]

@dataclass
class MacroFactors:
    """Macroeconomic factors affecting the business"""
    interest_rate_sensitivity: float  # 0-1 scale
    consumer_discretionary_exposure: float  # 0-1 scale
    geographic_concentration: Dict[str, float]  # region: percentage
    currency_exposure: Dict[str, float]  # currency: percentage
    recession_sensitivity: float  # 0-1 scale

@dataclass
class InvestmentScore:
    """Comprehensive investment scoring"""
    financial_health: float  # 0-100
    market_position: float   # 0-100
    growth_potential: float  # 0-100
    risk_profile: float     # 0-100
    management_quality: float  # 0-100
    
    @property
    def total_score(self) -> float:
        weights = {
            'financial_health': 0.25,
            'market_position': 0.20,
            'growth_potential': 0.25,
            'risk_profile': 0.15,
            'management_quality': 0.15
        }
        return sum([
            self.financial_health * weights['financial_health'],
            self.market_position * weights['market_position'],
            self.growth_potential * weights['growth_potential'],
            self.risk_profile * weights['risk_profile'],
            self.management_quality * weights['management_quality']
        ])
    
    @property
    def recommendation(self) -> str:
        score = self.total_score
        if score >= 80:
            return "Strong Buy"
        elif score >= 70:
            return "Buy"
        elif score >= 60:
            return "Hold"
        elif score >= 40:
            return "Underweight"
        else:
            return "Sell"

class InvestmentAnalyzer:
    """AI-powered investment analysis"""
    
    def __init__(self, company: CompanyMetrics, market: MarketConditions):
        self.company = company
        self.market = market
        self.seasonality = None
        self.competitive_position = None
        self.macro_factors = None
        self.investment_score = None
        self.analysis_points = []
        
    def analyze(self) -> Dict[str, any]:
        """Run comprehensive investment analysis"""
        try:
            # Analyze each component
            self._analyze_seasonality()
            self._analyze_competitive_position()
            self._analyze_macro_factors()
            self._calculate_investment_score()
            self._generate_analysis_points()
            
            return self._compile_report()
            
        except Exception as e:
            logger.error(f"Error in investment analysis: {e}")
            raise
    
    def _analyze_seasonality(self):
        """Analyze business seasonality"""
        # Example for GOOS
        if self.company.ticker == "GOOS":
            self.seasonality = SeasonalityMetrics(
                peak_quarters=[3, 4],  # Q3, Q4 (winter)
                trough_quarters=[1, 2], # Q1, Q2 (summer)
                peak_to_trough_ratio=2.5,  # Winter sales 2.5x summer
                revenue_std_dev=0.45  # High standard deviation
            )
            
            self.analysis_points.extend([
                "Strong seasonality with winter-focused product line",
                "Q3/Q4 sales typically 2.5x higher than Q1/Q2",
                "Requires strong working capital management",
                "Inventory build-up needed before peak season"
            ])
    
    def _analyze_competitive_position(self):
        """Analyze competitive position"""
        # Example for GOOS
        if self.company.ticker == "GOOS":
            self.competitive_position = CompetitivePosition(
                market_share=0.15,  # 15% of luxury outerwear
                brand_strength="strong",
                pricing_power="high",
                barriers_to_entry=[
                    "Brand recognition",
                    "Premium positioning",
                    "Supply chain relationships",
                    "Design patents"
                ],
                key_competitors=[
                    "Moncler",
                    "The North Face (VF Corp)",
                    "Moose Knuckles",
                    "Mackage"
                ]
            )
            
            self.analysis_points.extend([
                "Strong luxury brand positioning",
                "Premium pricing power maintained",
                "Established supply chain for down filling",
                "Growing competition in luxury outerwear",
                "Direct-to-consumer channel expansion opportunity"
            ])
    
    def _analyze_macro_factors(self):
        """Analyze macroeconomic factors"""
        # Example for GOOS
        if self.company.ticker == "GOOS":
            self.macro_factors = MacroFactors(
                interest_rate_sensitivity=0.6,  # High due to luxury goods
                consumer_discretionary_exposure=0.9,  # Very high
                geographic_concentration={
                    "North America": 0.45,
                    "Europe": 0.25,
                    "Asia": 0.30
                },
                currency_exposure={
                    "USD": 0.40,
                    "CAD": 0.25,
                    "EUR": 0.20,
                    "CNY": 0.15
                },
                recession_sensitivity=0.8  # High sensitivity
            )
            
            self.analysis_points.extend([
                "High exposure to consumer discretionary spending",
                "Geographic diversification provides some buffer",
                "Currency fluctuations impact margins",
                "Recession could significantly impact sales",
                "Interest rates affect consumer financing"
            ])
    
    def _calculate_investment_score(self):
        """Calculate comprehensive investment score"""
        # Financial Health (25%)
        financial_health = self._calculate_financial_health()
        
        # Market Position (20%)
        market_position = self._calculate_market_position()
        
        # Growth Potential (25%)
        growth_potential = self._calculate_growth_potential()
        
        # Risk Profile (15%)
        risk_profile = self._calculate_risk_profile()
        
        # Management Quality (15%)
        management_quality = self._calculate_management_quality()
        
        self.investment_score = InvestmentScore(
            financial_health=financial_health,
            market_position=market_position,
            growth_potential=growth_potential,
            risk_profile=risk_profile,
            management_quality=management_quality
        )
    
    def _calculate_financial_health(self) -> float:
        """Calculate financial health score"""
        metrics = {
            "ebitda_margin": self.company.ebitda_ltm / self.company.revenue_ltm,
            "leverage": self.company.total_debt / self.company.ebitda_ltm,
            "interest_coverage": self.company.ebitda_ltm / (self.company.total_debt * self.market.risk_free_rate),
            "cash_ratio": self.company.cash / self.company.total_debt
        }
        
        # Score each metric (0-100)
        scores = {
            "ebitda_margin": min(100, metrics["ebitda_margin"] * 500),  # 20% = 100
            "leverage": max(0, 100 - metrics["leverage"] * 20),  # 5x = 0
            "interest_coverage": min(100, metrics["interest_coverage"] * 20),  # 5x = 100
            "cash_ratio": min(100, metrics["cash_ratio"] * 100)  # 1x = 100
        }
        
        # Weighted average
        weights = {"ebitda_margin": 0.3, "leverage": 0.3, "interest_coverage": 0.2, "cash_ratio": 0.2}
        return sum(score * weights[metric] for metric, score in scores.items())
    
    def _calculate_market_position(self) -> float:
        """Calculate market position score"""
        if not self.competitive_position:
            return 50.0
            
        scores = {
            "market_share": min(100, self.competitive_position.market_share * 500),  # 20% = 100
            "brand_strength": {"weak": 30, "moderate": 60, "strong": 90}[self.competitive_position.brand_strength],
            "pricing_power": {"low": 30, "medium": 60, "high": 90}[self.competitive_position.pricing_power],
            "barriers": min(100, len(self.competitive_position.barriers_to_entry) * 25)  # 4+ barriers = 100
        }
        
        weights = {"market_share": 0.3, "brand_strength": 0.3, "pricing_power": 0.2, "barriers": 0.2}
        return sum(score * weights[metric] for metric, score in scores.items())
    
    def _calculate_growth_potential(self) -> float:
        """Calculate growth potential score"""
        if not self.company.revenue_growth_3yr:
            return 50.0
            
        metrics = {
            "historical_growth": self.company.revenue_growth_3yr,
            "market_growth": self.company.industry_revenue_growth or 0.05,
            "margin_improvement": (self.company.ebitda_margin_3yr_avg or 0.07) - 
                                (self.company.ebitda_ltm / self.company.revenue_ltm)
        }
        
        scores = {
            "historical_growth": min(100, metrics["historical_growth"] * 500),  # 20% = 100
            "market_growth": min(100, metrics["market_growth"] * 1000),  # 10% = 100
            "margin_improvement": max(0, 100 + metrics["margin_improvement"] * 1000)  # +10% = 100
        }
        
        weights = {"historical_growth": 0.4, "market_growth": 0.3, "margin_improvement": 0.3}
        return sum(score * weights[metric] for metric, score in scores.items())
    
    def _calculate_risk_profile(self) -> float:
        """Calculate risk profile score"""
        if not self.macro_factors:
            return 50.0
            
        risk_factors = {
            "interest_rate": self.macro_factors.interest_rate_sensitivity,
            "discretionary": self.macro_factors.consumer_discretionary_exposure,
            "geographic": 1 - max(self.macro_factors.geographic_concentration.values()),
            "currency": 1 - max(self.macro_factors.currency_exposure.values()),
            "recession": self.macro_factors.recession_sensitivity
        }
        
        # Convert to scores (lower risk = higher score)
        scores = {metric: 100 * (1 - risk) for metric, risk in risk_factors.items()}
        
        weights = {
            "interest_rate": 0.2,
            "discretionary": 0.2,
            "geographic": 0.2,
            "currency": 0.2,
            "recession": 0.2
        }
        return sum(score * weights[metric] for metric, score in scores.items())
    
    def _calculate_management_quality(self) -> float:
        """Calculate management quality score"""
        # For GOOS example
        if self.company.ticker == "GOOS":
            metrics = {
                "strategy_execution": 85,  # Strong brand building
                "capital_allocation": 75,  # Good but could improve
                "governance": 80,  # Strong governance
                "transparency": 85   # Good disclosure
            }
            
            weights = {
                "strategy_execution": 0.3,
                "capital_allocation": 0.3,
                "governance": 0.2,
                "transparency": 0.2
            }
            return sum(score * weights[metric] for metric, score in metrics.items())
        return 50.0
    
    def _generate_analysis_points(self):
        """Generate key analysis points"""
        # Add score-based points
        if self.investment_score:
            if self.investment_score.financial_health >= 80:
                self.analysis_points.append("Strong financial health with good margins and leverage")
            elif self.investment_score.financial_health <= 50:
                self.analysis_points.append("Financial health needs improvement")
                
            if self.investment_score.growth_potential >= 80:
                self.analysis_points.append("Strong growth prospects in key markets")
            elif self.investment_score.growth_potential <= 50:
                self.analysis_points.append("Limited growth opportunities identified")
    
    def _compile_report(self) -> Dict[str, any]:
        """Compile comprehensive investment report"""
        return {
            "company": {
                "ticker": self.company.ticker,
                "current_metrics": {
                    "revenue": self.company.revenue_ltm,
                    "ebitda": self.company.ebitda_ltm,
                    "market_cap": self.company.market_cap
                }
            },
            "seasonality": {
                "is_seasonal": self.seasonality.is_highly_seasonal if self.seasonality else None,
                "peak_quarters": self.seasonality.peak_quarters if self.seasonality else None,
                "trough_quarters": self.seasonality.trough_quarters if self.seasonality else None
            },
            "competitive_position": {
                "market_share": self.competitive_position.market_share if self.competitive_position else None,
                "brand_strength": self.competitive_position.brand_strength if self.competitive_position else None,
                "key_competitors": self.competitive_position.key_competitors if self.competitive_position else None
            },
            "macro_factors": {
                "geographic_exposure": self.macro_factors.geographic_concentration if self.macro_factors else None,
                "recession_sensitivity": self.macro_factors.recession_sensitivity if self.macro_factors else None
            },
            "investment_score": {
                "total": self.investment_score.total_score if self.investment_score else None,
                "recommendation": self.investment_score.recommendation if self.investment_score else None,
                "components": {
                    "financial_health": self.investment_score.financial_health if self.investment_score else None,
                    "market_position": self.investment_score.market_position if self.investment_score else None,
                    "growth_potential": self.investment_score.growth_potential if self.investment_score else None,
                    "risk_profile": self.investment_score.risk_profile if self.investment_score else None,
                    "management_quality": self.investment_score.management_quality if self.investment_score else None
                }
            },
            "analysis_points": self.analysis_points,
            "market_conditions": {
                "risk_free_rate": self.market.risk_free_rate,
                "market_risk_premium": self.market.market_risk_premium
            },
            "timestamp": datetime.now().isoformat()
        }
