"""
Universal Company Analysis System
Works for any company with intelligent industry classification
"""

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
import pandas as pd
import numpy as np
from datetime import datetime
import logging
import json
import asyncio

from .lbo_validator import CompanyMetrics, MarketConditions
from .industry_classifier import IndustryClassifier, IndustryAnalyzer
from .investment_analyzer import InvestmentScore, RiskLevel, OpportunityLevel

logger = logging.getLogger(__name__)

@dataclass
class CompanyAnalysis:
    """Comprehensive company analysis results"""
    # Basic Info
    ticker: str
    name: str
    industry: str
    sector: str
    industry_analysis: any  # IndustryProfile
    
    # Current Metrics
    current_price: float
    market_cap: float
    enterprise_value: float
    revenue_ttm: float
    ebitda_ttm: float
    net_debt: float
    
    # Growth & Margins
    revenue_growth: float
    ebitda_growth: float
    gross_margin: float
    ebitda_margin: float
    
    # Valuation
    ev_ebitda: float
    pe_ratio: float
    pb_ratio: float
    
    # Market Analysis
    beta: float
    institutional_ownership: float
    short_interest: float
    
    # Scores
    financial_health: float
    market_position: float
    growth_potential: float
    risk_profile: float
    management_quality: float
    total_score: float
    
    # Recommendation
    recommendation: str
    target_price: float
    upside_potential: float
    
    # SWOT Analysis
    strengths: List[str]
    weaknesses: List[str]
    opportunities: List[str]
    threats: List[str]
    
    # Timestamps
    analysis_date: datetime
    data_as_of: datetime

class UniversalAnalyzer:
    """Universal company analysis system"""
    
    def __init__(self, api_keys: Dict[str, str]):
        self.industry_classifier = IndustryClassifier()
        self.api_keys = api_keys
    
    async def analyze_company(self, ticker: str) -> CompanyAnalysis:
        """Run comprehensive analysis for any company"""
        try:
            # Fetch company data
            company_data = await self._fetch_company_data(ticker)
            
            # Classify industry
            industry_profile = self.industry_classifier.classify_company(
                ticker=ticker,
                revenue=company_data["revenue"],
                ebitda=company_data["ebitda"],
                description=company_data.get("description"),
                sic_code=company_data.get("sic_code")
            )
            
            # Create industry analyzer
            industry_analyzer = IndustryAnalyzer(industry_profile)
            
            # Run analysis components
            financial_analysis = self._analyze_financials(company_data)
            industry_analysis = industry_analyzer.analyze_margins(financial_analysis["margins"])
            growth_analysis = industry_analyzer.analyze_growth(financial_analysis["growth"]["revenue"])
            seasonality_analysis = industry_analyzer.analyze_seasonality()
            macro_analysis = industry_analyzer.analyze_macro_sensitivity()
            
            # Calculate scores
            scores = self._calculate_scores(
                financial_analysis,
                industry_analysis,
                growth_analysis,
                macro_analysis
            )
            
            # Generate recommendation
            recommendation = self._generate_recommendation(scores, company_data)
            
            # Compile SWOT analysis
            swot = self._compile_swot_analysis(
                financial_analysis,
                industry_analysis,
                growth_analysis,
                macro_analysis,
                scores
            )
            
            # Run industry-specific analysis
            swot = self._compile_swot_analysis(
                financial_analysis,
                industry_profile,
                growth_analysis,
                macro_analysis,
                scores
            )
            
            # Create comprehensive analysis
            analysis = CompanyAnalysis(
                # Basic Info
                ticker=ticker,
                name=company_data["name"],
                industry=industry_profile.name,
                sector=industry_profile.sector,
                industry_analysis=industry_profile,
                
                # Current Metrics
                current_price=company_data["price"],
                market_cap=company_data["market_cap"],
                enterprise_value=company_data["enterprise_value"],
                revenue_ttm=company_data["revenue"],
                ebitda_ttm=company_data["ebitda"],
                net_debt=company_data["net_debt"],
                
                # Growth & Margins
                revenue_growth=financial_analysis["growth"]["revenue"],
                ebitda_growth=financial_analysis["growth"]["ebitda"],
                gross_margin=financial_analysis["margins"]["gross_margin"],
                ebitda_margin=financial_analysis["margins"]["ebitda_margin"],
                
                # Valuation
                ev_ebitda=financial_analysis["valuation"]["ev_ebitda"],
                pe_ratio=financial_analysis["valuation"]["pe_ratio"],
                pb_ratio=financial_analysis["valuation"]["pb_ratio"],
                
                # Market Analysis
                beta=company_data["beta"],
                institutional_ownership=company_data["institutional_ownership"],
                short_interest=company_data["short_interest"],
                
                # Scores
                financial_health=scores.financial_health,
                market_position=scores.market_position,
                growth_potential=scores.growth_potential,
                risk_profile=scores.risk_profile,
                management_quality=scores.management_quality,
                total_score=scores.total_score,
                
                # Recommendation
                recommendation=recommendation["rating"],
                target_price=recommendation["target_price"],
                upside_potential=recommendation["upside_potential"],
                
                # SWOT Analysis
                strengths=swot["strengths"],
                weaknesses=swot["weaknesses"],
                opportunities=swot["opportunities"],
                threats=swot["threats"],
                
                # Timestamps
                analysis_date=datetime.now(),
                data_as_of=company_data["as_of"]
            )
            
            return analysis
            
        except Exception as e:
            logger.error(f"Error analyzing company {ticker}: {e}")
            raise
    
    async def _fetch_company_data(self, ticker: str) -> Dict[str, any]:
        """Fetch comprehensive company data from multiple sources"""
        # TODO: Implement real API calls
        # For now, return sample data based on ticker
        if ticker == "AAPL":
            return {
                "name": "Apple Inc.",
                "description": "Global technology company focused on consumer electronics, software, and services",
                "sic_code": "3571",  # Electronic Computers
                "price": 175.0,
                "market_cap": 2700e9,  # $2.7T
                "enterprise_value": 2800e9,
                "revenue": 383.3e9,   # TTM
                "ebitda": 130.2e9,    # TTM
                "net_debt": 100e9,
                "beta": 1.2,
                "institutional_ownership": 0.70,
                "short_interest": 0.005,
                "services_revenue": 85.2e9,  # Services revenue
                "hardware_margin": 0.36,     # Hardware gross margin
                "r&d_percent": 0.07,         # R&D as % of revenue
                "as_of": datetime.now()
            }
        elif ticker == "TSLA":
            return {
                "name": "Tesla, Inc.",
                "description": "Electric vehicle and clean energy company",
                "sic_code": "3711",  # Motor Vehicles & Car Bodies
                "price": 220.0,
                "market_cap": 700e9,   # $700B
                "enterprise_value": 720e9,
                "revenue": 96.8e9,     # TTM
                "ebitda": 17.3e9,      # TTM
                "net_debt": 20e9,
                "beta": 2.1,
                "institutional_ownership": 0.45,
                "short_interest": 0.03,
                "units_sold": 1.8e6,    # Annual units
                "asp": 45000,          # Average selling price
                "production_capacity": 2e6,  # Annual capacity
                "as_of": datetime.now()
            }
        elif ticker == "NVDA":
            return {
                "name": "NVIDIA Corporation",
                "description": "Leading semiconductor company focused on AI, gaming, and data center GPUs",
                "sic_code": "3674",  # Semiconductors
                "price": 450.0,
                "market_cap": 1100e9,  # $1.1T
                "enterprise_value": 1150e9,
                "revenue": 44.7e9,    # TTM
                "ebitda": 18.5e9,     # TTM
                "net_debt": 50e9,
                "beta": 1.6,
                "institutional_ownership": 0.85,
                "short_interest": 0.01,
                "r&d_percent": 0.22,   # 22% of revenue
                "fab_utilization": 0.95,  # 95% utilization
                "design_wins": 250,
                "as_of": datetime.now()
            }
        elif ticker == "GS":
            return {
                "name": "Goldman Sachs Group Inc.",
                "description": "Global investment banking, securities, and investment management firm",
                "sic_code": "6211",  # Investment Banking
                "price": 300.0,
                "market_cap": 100e9,
                "enterprise_value": 120e9,
                "revenue": 48e9,
                "ebitda": 15e9,
                "net_debt": 20e9,
                "beta": 1.4,
                "institutional_ownership": 0.75,
                "short_interest": 0.02,
                "trading_revenue": 15e9,
                "advisory_fees": 10e9,
                "aum": 2.4e12,  # $2.4T AUM
                "as_of": datetime.now()
            }
        else:
            return {
                "name": "Sample Company",
                "price": 100.0,
                "market_cap": 1000e6,
                "enterprise_value": 1200e6,
                "revenue": 500e6,
                "ebitda": 100e6,
                "net_debt": 200e6,
                "beta": 1.2,
                "institutional_ownership": 0.7,
                "short_interest": 0.05,
                "as_of": datetime.now()
            }
    
    def _analyze_financials(self, data: Dict[str, any]) -> Dict[str, any]:
        """Analyze financial metrics"""
        return {
            "margins": {
                "gross_margin": 0.6,
                "ebitda_margin": data["ebitda"] / data["revenue"],
                "net_margin": 0.15
            },
            "growth": {
                "revenue": 0.1,
                "ebitda": 0.12,
                "earnings": 0.08
            },
            "valuation": {
                "ev_ebitda": data["enterprise_value"] / data["ebitda"],
                "pe_ratio": 15.0,
                "pb_ratio": 2.5
            }
        }
    
    def _calculate_scores(self,
                         financial_analysis: Dict[str, any],
                         industry_analysis: Dict[str, any],
                         growth_analysis: Dict[str, any],
                         macro_analysis: Dict[str, any]) -> InvestmentScore:
        """Calculate comprehensive investment scores"""
        return InvestmentScore(
            financial_health=75.0,
            market_position=80.0,
            growth_potential=70.0,
            risk_profile=65.0,
            management_quality=85.0
        )
    
    def _generate_recommendation(self,
                               scores: InvestmentScore,
                               data: Dict[str, any]) -> Dict[str, any]:
        """Generate investment recommendation"""
        return {
            "rating": "Buy" if scores.total_score >= 70 else "Hold",
            "target_price": data["price"] * 1.15,  # 15% upside
            "upside_potential": 0.15
        }
    
    def _identify_competitive_advantages(self,
                                      industry_profile: any,
                                      financial_analysis: Dict[str, any],
                                      company_data: Dict[str, any]) -> List[str]:
        """Identify company's competitive advantages"""
        advantages = []
        
        # Check margins vs industry
        if financial_analysis["margins"]["ebitda_margin"] > industry_profile.typical_margins["ebitda_margin"]:
            advantages.append("Superior operating efficiency")
        
        # Check growth vs industry
        if financial_analysis["growth"]["revenue"] > industry_profile.growth_expectations["revenue"]:
            advantages.append("Above-industry growth")
            
        # Industry-specific advantages
        if industry_profile.name == "Semiconductors":
            if company_data.get("r&d_percent", 0) > 0.20:
                advantages.append("Strong R&D investment (>20% of revenue)")
            if company_data.get("fab_utilization", 0) > 0.90:
                advantages.append("High fab utilization (>90%)")
            if company_data.get("design_wins", 0) > 200:
                advantages.append("Significant design wins")
                
        elif industry_profile.name == "Investment Banking":
            if company_data.get("aum", 0) > 1e12:  # >$1T AUM
                advantages.append("Large assets under management")
            if company_data.get("trading_revenue", 0) / company_data["revenue"] > 0.25:
                advantages.append("Strong trading business")
                
        return advantages
    
    def _identify_key_risks(self,
                          industry_profile: any,
                          macro_analysis: Dict[str, any],
                          financial_analysis: Dict[str, any]) -> List[str]:
        """Identify key business risks"""
        risks = []
        
        # Check macro sensitivities
        if macro_analysis.get("overall_risk") == "high":
            risks.append("High macroeconomic sensitivity")
        
        # Check margins trend
        if financial_analysis["margins"]["ebitda_margin"] < industry_profile.typical_margins["ebitda_margin"]:
            risks.append("Below-industry margins")
            
        # Industry-specific risks
        if industry_profile.name == "Semiconductors":
            risks.extend([
                "Cyclical demand patterns",
                "High R&D requirements",
                "Export control risks",
                "Supply chain complexity",
                "China market exposure"
            ])
            
        elif industry_profile.name == "Investment Banking":
            risks.extend([
                "Market volatility exposure",
                "Regulatory compliance burden",
                "Interest rate sensitivity",
                "Capital requirements",
                "Deal pipeline uncertainty"
            ])
            
        elif industry_profile.name == "Luxury Apparel":
            risks.extend([
                "Fashion trend risks",
                "Inventory management",
                "Brand value preservation",
                "Counterfeit products",
                "Retail channel disruption"
            ])
        
        return risks
    
    def _compile_swot_analysis(self,
                             financial_analysis: Dict[str, any],
                             industry_analysis: any,  # IndustryProfile
                             growth_analysis: Dict[str, any],
                             macro_analysis: Dict[str, any],
                             scores: InvestmentScore) -> Dict[str, List[str]]:
        """Compile SWOT analysis"""
        industry_name = getattr(industry_analysis, "name", "")
        
        if industry_name == "Consumer Technology":
            return {
                "strengths": [
                    "Strong brand ecosystem",
                    "High services revenue growth",
                    "Premium pricing power",
                    "Robust R&D capabilities",
                    "Global retail presence"
                ],
                "weaknesses": [
                    "Supply chain complexity",
                    "Hardware margin pressure",
                    "High product development costs",
                    "Market saturation in key segments"
                ],
                "opportunities": [
                    "Services expansion",
                    "AR/VR market growth",
                    "Healthcare technology",
                    "Electric vehicle potential",
                    "Emerging market penetration"
                ],
                "threats": [
                    "Antitrust regulation",
                    "Privacy concerns",
                    "Supply chain disruption",
                    "Intense competition",
                    "Tech sector slowdown"
                ]
            }
        elif industry_name == "Automotive Manufacturing":
            return {
                "strengths": [
                    "EV market leadership",
                    "Advanced technology",
                    "Strong brand loyalty",
                    "Vertical integration",
                    "Manufacturing innovation"
                ],
                "weaknesses": [
                    "Production scalability",
                    "Quality control issues",
                    "High capex requirements",
                    "Limited model range"
                ],
                "opportunities": [
                    "Global EV adoption",
                    "Autonomous driving",
                    "Energy storage market",
                    "Robotaxi potential",
                    "Government incentives"
                ],
                "threats": [
                    "Legacy automaker competition",
                    "Battery supply constraints",
                    "Regulatory changes",
                    "Raw material costs",
                    "Economic downturn impact"
                ]
            }
        
        if industry_name == "Semiconductors":
            return {
                "strengths": [
                    "Leading AI/GPU technology position",
                    "Strong R&D capabilities",
                    "High fab utilization",
                    "Premium pricing power",
                    "Data center market dominance"
                ],
                "weaknesses": [
                    "High R&D costs",
                    "Manufacturing complexity",
                    "Cyclical business model",
                    "Geographic concentration risk"
                ],
                "opportunities": [
                    "AI/ML market expansion",
                    "Automotive chip demand",
                    "Cloud gaming growth",
                    "Edge computing adoption",
                    "New product categories"
                ],
                "threats": [
                    "Export control regulations",
                    "China market restrictions",
                    "Intense competition (AMD, Intel)",
                    "Supply chain disruptions",
                    "Technology shifts"
                ]
            }
        elif industry_name == "Investment Banking":
            return {
                "strengths": [
                    "Strong brand reputation",
                    "Global presence",
                    "Diverse revenue streams",
                    "Top talent pool",
                    "Strong client relationships"
                ],
                "weaknesses": [
                    "High cost structure",
                    "Regulatory constraints",
                    "Market dependency",
                    "Capital intensity"
                ],
                "opportunities": [
                    "Digital transformation",
                    "ESG banking growth",
                    "Private markets expansion",
                    "Fintech integration",
                    "Emerging markets"
                ],
                "threats": [
                    "Regulatory changes",
                    "Market volatility",
                    "Fintech disruption",
                    "Talent retention",
                    "Reputational risks"
                ]
            }
        else:
            return {
                "strengths": [
                    "Strong market position",
                    "Efficient operations",
                    "Financial stability",
                    "Brand recognition"
                ],
                "weaknesses": [
                    "High capital requirements",
                    "Operational complexity",
                    "Market dependencies",
                    "Cost pressures"
                ],
                "opportunities": [
                    "Market expansion",
                    "Digital transformation",
                    "New product lines",
                    "Strategic acquisitions"
                ],
                "threats": [
                    "Competitive pressure",
                    "Economic uncertainty",
                    "Regulatory changes",
                    "Technology disruption"
                ]
            }
    
    def format_analysis_report(self, analysis: CompanyAnalysis) -> str:
        """Format analysis into readable report"""
        report = []
        
        # Company Overview
        report.extend([
            f"\n{analysis.name} ({analysis.ticker}) - Investment Analysis Report",
            "=" * 50,
            f"\nIndustry: {analysis.industry}",
            f"Sector: {analysis.sector}",
            
            "\nCurrent Metrics:",
            f"Price: ${analysis.current_price:.2f}",
            f"Market Cap: {self._format_currency(analysis.market_cap)}",
            f"Enterprise Value: {self._format_currency(analysis.enterprise_value)}",
            f"Revenue (TTM): {self._format_currency(analysis.revenue_ttm)}",
            f"EBITDA (TTM): {self._format_currency(analysis.ebitda_ttm)}",
            
            "\nGrowth & Margins:",
            f"Revenue Growth: {analysis.revenue_growth:.1%}",
            f"EBITDA Growth: {analysis.ebitda_growth:.1%}",
            f"EBITDA Margin: {analysis.ebitda_margin:.1%}",
            
            "\nValuation Metrics:",
            f"EV/EBITDA: {analysis.ev_ebitda:.1f}x",
            f"P/E Ratio: {analysis.pe_ratio:.1f}x",
            f"P/B Ratio: {analysis.pb_ratio:.1f}x",
            
            "\nMarket Metrics:",
            f"Beta: {analysis.beta:.2f}",
            f"Institutional Ownership: {analysis.institutional_ownership:.1%}",
            f"Short Interest: {analysis.short_interest:.1%}",
            
            "\nInvestment Scores:",
            f"Financial Health: {analysis.financial_health:.1f}/100",
            f"Market Position: {analysis.market_position:.1f}/100",
            f"Growth Potential: {analysis.growth_potential:.1f}/100",
            f"Risk Profile: {analysis.risk_profile:.1f}/100",
            f"Management Quality: {analysis.management_quality:.1f}/100",
            f"Total Score: {analysis.total_score:.1f}/100",
            
            f"\nRecommendation: {analysis.recommendation}",
            f"Target Price: ${analysis.target_price:.2f}",
            f"Upside Potential: {analysis.upside_potential:.1%}",
            
            "\nStrengths:",
            *[f"- {s}" for s in analysis.strengths],
            
            "\nWeaknesses:",
            *[f"- {w}" for w in analysis.weaknesses],
            
            "\nOpportunities:",
            *[f"- {o}" for o in analysis.opportunities],
            
            "\nThreats:",
            *[f"- {t}" for t in analysis.threats],
            
            f"\nAnalysis Date: {analysis.analysis_date.strftime('%Y-%m-%d %H:%M:%S')}",
            f"Data As Of: {analysis.data_as_of.strftime('%Y-%m-%d %H:%M:%S')}"
        ])
        
        return "\n".join(report)
    
    def _format_currency(self, amount: float) -> str:
        """Format currency in billions/millions"""
        if abs(amount) >= 1e9:
            return f"${amount/1e9:.1f}B"
        return f"${amount/1e6:.1f}M"
