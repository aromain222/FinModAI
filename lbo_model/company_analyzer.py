"""
Company-Specific LBO Analysis Engine
Analyzes company characteristics to generate tailored LBO assumptions and debt structures.
"""

from dataclasses import dataclass
from typing import Dict, List, Any, Optional, Tuple
from enum import Enum
import math

class CompanySize(Enum):
    MICRO_CAP = "Micro Cap"      # < $300M market cap
    SMALL_CAP = "Small Cap"      # $300M - $2B market cap
    MID_CAP = "Mid Cap"          # $2B - $10B market cap
    LARGE_CAP = "Large Cap"      # $10B - $200B market cap
    MEGA_CAP = "Mega Cap"        # > $200B market cap

class IndustrySector(Enum):
    TECHNOLOGY = "Technology"
    HEALTHCARE = "Healthcare"
    FINANCIAL = "Financial Services"
    CONSUMER = "Consumer"
    ENERGY = "Energy"
    INDUSTRIAL = "Industrial"
    MATERIALS = "Materials"
    UTILITIES = "Utilities"
    REIT = "REIT"
    COMMUNICATION = "Communication Services"
    GROWTH = "Growth"

class CreditQuality(Enum):
    INVESTMENT_GRADE = "Investment Grade"      # BBB+ and above
    HIGH_YIELD = "High Yield"                  # BB+ to B-
    DISTRESSED = "Distressed"                  # CCC+ and below

@dataclass
class CompanyProfile:
    """Comprehensive company profile for LBO analysis."""
    ticker: str
    company_name: str
    market_cap: float
    revenue: float
    ebitda: float
    ebitda_margin: float
    revenue_growth: List[float]
    industry: IndustrySector
    size_tier: CompanySize
    credit_quality: CreditQuality
    beta: float
    wacc: float
    tax_rate: float
    
    # Additional financial metrics
    debt_to_ebitda: float = 0.0
    interest_coverage: float = 0.0
    free_cash_flow: float = 0.0
    cash_balance: float = 0.0
    total_debt: float = 0.0

class CompanyAnalyzer:
    """Analyzes company characteristics to generate tailored LBO assumptions."""
    
    def __init__(self):
        self.industry_mappings = self._build_industry_mappings()
        self.size_thresholds = self._build_size_thresholds()
        self.credit_metrics = self._build_credit_metrics()
    
    def _build_industry_mappings(self) -> Dict[str, IndustrySector]:
        """Map company names/descriptions to industry sectors."""
        return {
            # Technology
            'microsoft': IndustrySector.TECHNOLOGY,
            'apple': IndustrySector.TECHNOLOGY,
            'google': IndustrySector.TECHNOLOGY,
            'alphabet': IndustrySector.TECHNOLOGY,
            'meta': IndustrySector.TECHNOLOGY,
            'netflix': IndustrySector.TECHNOLOGY,
            'nvidia': IndustrySector.TECHNOLOGY,
            'amazon': IndustrySector.TECHNOLOGY,
            'salesforce': IndustrySector.TECHNOLOGY,
            'oracle': IndustrySector.TECHNOLOGY,
            'adobe': IndustrySector.TECHNOLOGY,
            'intel': IndustrySector.TECHNOLOGY,
            'cisco': IndustrySector.TECHNOLOGY,
            'ibm': IndustrySector.TECHNOLOGY,
            'snowflake': IndustrySector.TECHNOLOGY,
            'crowdstrike': IndustrySector.TECHNOLOGY,
            'okta': IndustrySector.TECHNOLOGY,
            'datadog': IndustrySector.TECHNOLOGY,
            'cloudflare': IndustrySector.TECHNOLOGY,
            'palantir': IndustrySector.TECHNOLOGY,
            'unity': IndustrySector.TECHNOLOGY,
            'shopify': IndustrySector.TECHNOLOGY,
            'twilio': IndustrySector.TECHNOLOGY,
            'pinterest': IndustrySector.TECHNOLOGY,
            'snap': IndustrySector.TECHNOLOGY,
            'spotify': IndustrySector.TECHNOLOGY,
            'uber': IndustrySector.TECHNOLOGY,
            'lyft': IndustrySector.TECHNOLOGY,
            'airbnb': IndustrySector.TECHNOLOGY,
            'coinbase': IndustrySector.TECHNOLOGY,
            'robinhood': IndustrySector.TECHNOLOGY,
            'zoom': IndustrySector.TECHNOLOGY,
            'docusign': IndustrySector.TECHNOLOGY,
            'roku': IndustrySector.TECHNOLOGY,
            'block': IndustrySector.TECHNOLOGY,
            'peloton': IndustrySector.TECHNOLOGY,
            'beyond meat': IndustrySector.TECHNOLOGY,
            
            # Healthcare
            'johnson': IndustrySector.HEALTHCARE,
            'pfizer': IndustrySector.HEALTHCARE,
            'merck': IndustrySector.HEALTHCARE,
            'abbott': IndustrySector.HEALTHCARE,
            'bristol': IndustrySector.HEALTHCARE,
            'eli lilly': IndustrySector.HEALTHCARE,
            'amgen': IndustrySector.HEALTHCARE,
            'gilead': IndustrySector.HEALTHCARE,
            'biogen': IndustrySector.HEALTHCARE,
            'regeneron': IndustrySector.HEALTHCARE,
            'moderna': IndustrySector.HEALTHCARE,
            'illumina': IndustrySector.HEALTHCARE,
            'thermo fisher': IndustrySector.HEALTHCARE,
            'danaher': IndustrySector.HEALTHCARE,
            'boston scientific': IndustrySector.HEALTHCARE,
            'medtronic': IndustrySector.HEALTHCARE,
            'unitedhealth': IndustrySector.HEALTHCARE,
            'anthem': IndustrySector.HEALTHCARE,
            'humana': IndustrySector.HEALTHCARE,
            'cigna': IndustrySector.HEALTHCARE,
            'aetna': IndustrySector.HEALTHCARE,
            'kroger': IndustrySector.HEALTHCARE,
            'walmart': IndustrySector.CONSUMER,
            'target': IndustrySector.CONSUMER,
            'costco': IndustrySector.CONSUMER,
            'home depot': IndustrySector.CONSUMER,
            'lowe': IndustrySector.CONSUMER,
            'starbucks': IndustrySector.CONSUMER,
            'mcdonald': IndustrySector.CONSUMER,
            'nike': IndustrySector.CONSUMER,
            'adidas': IndustrySector.CONSUMER,
            'lululemon': IndustrySector.CONSUMER,
            'canada goose': IndustrySector.CONSUMER,
            'tesla': IndustrySector.TECHNOLOGY,
            'ford': IndustrySector.INDUSTRIAL,
            'general motors': IndustrySector.INDUSTRIAL,
            'boeing': IndustrySector.INDUSTRIAL,
            'caterpillar': IndustrySector.INDUSTRIAL,
            '3m': IndustrySector.INDUSTRIAL,
            'honeywell': IndustrySector.INDUSTRIAL,
            'general electric': IndustrySector.INDUSTRIAL,
            'exxon': IndustrySector.ENERGY,
            'chevron': IndustrySector.ENERGY,
            'conocophillips': IndustrySector.ENERGY,
            'eog': IndustrySector.ENERGY,
            'pioneer': IndustrySector.ENERGY,
            'schlumberger': IndustrySector.ENERGY,
            'halliburton': IndustrySector.ENERGY,
            'nextEra': IndustrySector.UTILITIES,
            'duke': IndustrySector.UTILITIES,
            'southern': IndustrySector.UTILITIES,
            'dominion': IndustrySector.UTILITIES,
            'exelon': IndustrySector.UTILITIES,
            'american electric': IndustrySector.UTILITIES,
            'xcel': IndustrySector.UTILITIES,
            'wec': IndustrySector.UTILITIES,
            'eversource': IndustrySector.UTILITIES,
            'consolidated edison': IndustrySector.UTILITIES,
            'linde': IndustrySector.MATERIALS,
            'air products': IndustrySector.MATERIALS,
            'sherwin': IndustrySector.MATERIALS,
            'ecolab': IndustrySector.MATERIALS,
            'dupont': IndustrySector.MATERIALS,
            'dow': IndustrySector.MATERIALS,
            'ppg': IndustrySector.MATERIALS,
            'newmont': IndustrySector.MATERIALS,
            'freeport': IndustrySector.MATERIALS,
            'nucor': IndustrySector.MATERIALS,
            'verizon': IndustrySector.COMMUNICATION,
            'at&t': IndustrySector.COMMUNICATION,
            't-mobile': IndustrySector.COMMUNICATION,
            'charter': IndustrySector.COMMUNICATION,
            'comcast': IndustrySector.COMMUNICATION,
            'disney': IndustrySector.COMMUNICATION,
            'twitter': IndustrySector.COMMUNICATION,
            'jpmorgan': IndustrySector.FINANCIAL,
            'bank of america': IndustrySector.FINANCIAL,
            'wells fargo': IndustrySector.FINANCIAL,
            'goldman sachs': IndustrySector.FINANCIAL,
            'morgan stanley': IndustrySector.FINANCIAL,
            'citigroup': IndustrySector.FINANCIAL,
            'american express': IndustrySector.FINANCIAL,
            'visa': IndustrySector.FINANCIAL,
            'mastercard': IndustrySector.FINANCIAL,
            'paypal': IndustrySector.FINANCIAL,
            'square': IndustrySector.FINANCIAL,
            'berkshire': IndustrySector.FINANCIAL,
            'blackrock': IndustrySector.FINANCIAL,
            'vanguard': IndustrySector.FINANCIAL,
            'american tower': IndustrySector.REIT,
            'prologis': IndustrySector.REIT,
            'crown castle': IndustrySector.REIT,
            'equinix': IndustrySector.REIT,
            'public storage': IndustrySector.REIT,
            'extra space': IndustrySector.REIT,
            'avalonbay': IndustrySector.REIT,
            'equity residential': IndustrySector.REIT,
            'mid-america': IndustrySector.REIT,
            'welltower': IndustrySector.REIT
        }
    
    def _build_size_thresholds(self) -> Dict[CompanySize, Tuple[float, float]]:
        """Define market cap thresholds for company size tiers."""
        return {
            CompanySize.MICRO_CAP: (0, 300_000_000),
            CompanySize.SMALL_CAP: (300_000_000, 2_000_000_000),
            CompanySize.MID_CAP: (2_000_000_000, 10_000_000_000),
            CompanySize.LARGE_CAP: (10_000_000_000, 200_000_000_000),
            CompanySize.MEGA_CAP: (200_000_000_000, float('inf'))
        }
    
    def _build_credit_metrics(self) -> Dict[CreditQuality, Dict[str, float]]:
        """Define credit quality metrics and thresholds."""
        return {
            CreditQuality.INVESTMENT_GRADE: {
                'debt_to_ebitda_max': 3.0,
                'interest_coverage_min': 4.0,
                'ebitda_margin_min': 0.15,
                'revenue_growth_min': 0.02
            },
            CreditQuality.HIGH_YIELD: {
                'debt_to_ebitda_max': 5.0,
                'interest_coverage_min': 2.0,
                'ebitda_margin_min': 0.08,
                'revenue_growth_min': 0.0
            },
            CreditQuality.DISTRESSED: {
                'debt_to_ebitda_max': 8.0,
                'interest_coverage_min': 1.0,
                'ebitda_margin_min': 0.03,
                'revenue_growth_min': -0.05
            }
        }
    
    def analyze_company(self, ticker: str, historical_data: Dict[str, Any]) -> CompanyProfile:
        """Analyze company characteristics and create comprehensive profile."""
        print(f"🔍 Analyzing company profile for {ticker}...")
        
        # Extract basic financial data
        company_name = historical_data.get('company_name', 'Unknown Company')
        revenue = historical_data.get('historicals', {}).get('revenue', [0])[-1] if historical_data.get('historicals', {}).get('revenue') else 0
        ebitda = historical_data.get('historicals', {}).get('ebitda', [0])[-1] if historical_data.get('historicals', {}).get('ebitda') else 0
        ebitda_margin = historical_data.get('historicals', {}).get('op_margin', [0.25])[-1] if historical_data.get('historicals', {}).get('op_margin') else 0.25
        
        # Handle case where EBITDA is missing - calculate from revenue and margin
        if ebitda <= 0 and revenue > 0 and ebitda_margin > 0:
            ebitda = revenue * ebitda_margin
            print(f"💰 Calculated EBITDA from revenue and margin: ${ebitda:,.0f}")
        revenue_growth = historical_data.get('assumptions', {}).get('revenue_growth', [0.05, 0.05, 0.05])
        beta = historical_data.get('assumptions', {}).get('beta', 1.0)
        wacc = historical_data.get('assumptions', {}).get('wacc', 0.10)
        tax_rate = historical_data.get('assumptions', {}).get('tax_rate', 0.25)
        
        # Calculate market cap (estimate from revenue multiple)
        market_cap = self._estimate_market_cap(revenue, ebitda_margin, beta)
        
        # Determine industry
        industry = self._determine_industry(company_name, ticker)
        
        # Determine size tier
        size_tier = self._determine_size_tier(market_cap)
        
        # Calculate credit quality
        credit_quality = self._calculate_credit_quality(ebitda, ebitda_margin, revenue_growth, market_cap)
        
        # Calculate additional metrics
        debt_to_ebitda = self._calculate_debt_to_ebitda(ebitda, market_cap)
        interest_coverage = self._calculate_interest_coverage(ebitda, market_cap)
        free_cash_flow = self._calculate_free_cash_flow(ebitda, market_cap)
        cash_balance = self._calculate_cash_balance(market_cap)
        total_debt = self._calculate_total_debt(market_cap)
        
        profile = CompanyProfile(
            ticker=ticker,
            company_name=company_name,
            market_cap=market_cap,
            revenue=revenue,
            ebitda=ebitda,
            ebitda_margin=ebitda_margin,
            revenue_growth=revenue_growth,
            industry=industry,
            size_tier=size_tier,
            credit_quality=credit_quality,
            beta=beta,
            wacc=wacc,
            tax_rate=tax_rate,
            debt_to_ebitda=debt_to_ebitda,
            interest_coverage=interest_coverage,
            free_cash_flow=free_cash_flow,
            cash_balance=cash_balance,
            total_debt=total_debt
        )
        
        print(f"✅ Company Profile: {company_name}")
        print(f"   Industry: {industry.value}")
        print(f"   Size: {size_tier.value} (${market_cap:,.0f})")
        print(f"   Credit: {credit_quality.value}")
        print(f"   EBITDA Margin: {ebitda_margin:.1%}")
        print(f"   Revenue Growth: {revenue_growth[0]:.1%}")
        
        return profile
    
    def _estimate_market_cap(self, revenue: float, ebitda_margin: float, beta: float) -> float:
        """Estimate market cap based on revenue and industry characteristics."""
        if revenue <= 0:
            return 1_000_000_000  # Default $1B for demo data
        
        # Base revenue multiple varies by margin and beta
        base_multiple = 2.0 + (ebitda_margin * 3.0) + (beta * 0.5)
        
        # Apply industry adjustments
        if ebitda_margin > 0.3:  # High margin companies
            base_multiple *= 1.2
        elif ebitda_margin < 0.1:  # Low margin companies
            base_multiple *= 0.8
        
        return revenue * base_multiple
    
    def _determine_industry(self, company_name: str, ticker: str) -> IndustrySector:
        """Determine industry sector based on company name and ticker."""
        name_lower = company_name.lower()
        
        for keyword, sector in self.industry_mappings.items():
            if keyword in name_lower:
                return sector
        
        # Default based on ticker patterns
        if ticker in ['MSFT', 'AAPL', 'GOOGL', 'META', 'NFLX', 'NVDA', 'AMZN']:
            return IndustrySector.TECHNOLOGY
        elif ticker in ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'C']:
            return IndustrySector.FINANCIAL
        elif ticker in ['JNJ', 'PFE', 'MRK', 'ABT', 'BMY']:
            return IndustrySector.HEALTHCARE
        elif ticker in ['WMT', 'TGT', 'COST', 'HD', 'LOW']:
            return IndustrySector.CONSUMER
        elif ticker in ['XOM', 'CVX', 'COP', 'EOG', 'PXD']:
            return IndustrySector.ENERGY
        else:
            return IndustrySector.GROWTH  # Default for unknown companies
    
    def _determine_size_tier(self, market_cap: float) -> CompanySize:
        """Determine company size tier based on market cap."""
        for size, (min_cap, max_cap) in self.size_thresholds.items():
            if min_cap <= market_cap < max_cap:
                return size
        return CompanySize.MEGA_CAP  # Default for very large companies
    
    def _calculate_credit_quality(self, ebitda: float, ebitda_margin: float, 
                                revenue_growth: List[float], market_cap: float) -> CreditQuality:
        """Calculate credit quality based on financial metrics."""
        if ebitda <= 0:
            return CreditQuality.DISTRESSED
        
        # Calculate debt-to-EBITDA ratio
        estimated_debt = market_cap * 0.3  # Assume 30% debt-to-equity
        debt_to_ebitda = estimated_debt / ebitda
        
        # Calculate interest coverage
        interest_expense = estimated_debt * 0.06  # Assume 6% interest rate
        interest_coverage = ebitda / interest_expense if interest_expense > 0 else 0
        
        # Calculate average revenue growth
        avg_growth = sum(revenue_growth) / len(revenue_growth) if revenue_growth else 0
        
        # Determine credit quality
        if (debt_to_ebitda <= 3.0 and interest_coverage >= 4.0 and 
            ebitda_margin >= 0.15 and avg_growth >= 0.02):
            return CreditQuality.INVESTMENT_GRADE
        elif (debt_to_ebitda <= 5.0 and interest_coverage >= 2.0 and 
              ebitda_margin >= 0.08 and avg_growth >= 0.0):
            return CreditQuality.HIGH_YIELD
        else:
            return CreditQuality.DISTRESSED
    
    def _calculate_debt_to_ebitda(self, ebitda: float, market_cap: float) -> float:
        """Calculate debt-to-EBITDA ratio."""
        if ebitda <= 0:
            return 0.0
        estimated_debt = market_cap * 0.3  # Assume 30% debt-to-equity
        return estimated_debt / ebitda
    
    def _calculate_interest_coverage(self, ebitda: float, market_cap: float) -> float:
        """Calculate interest coverage ratio."""
        estimated_debt = market_cap * 0.3
        interest_expense = estimated_debt * 0.06
        return ebitda / interest_expense if interest_expense > 0 else 0
    
    def _calculate_free_cash_flow(self, ebitda: float, market_cap: float) -> float:
        """Calculate estimated free cash flow."""
        # Assume 70% of EBITDA converts to FCF
        return ebitda * 0.7
    
    def _calculate_cash_balance(self, market_cap: float) -> float:
        """Calculate estimated cash balance."""
        # Assume 5% of market cap in cash
        return market_cap * 0.05
    
    def _calculate_total_debt(self, market_cap: float) -> float:
        """Calculate estimated total debt."""
        # Assume 30% debt-to-equity ratio
        return market_cap * 0.3
