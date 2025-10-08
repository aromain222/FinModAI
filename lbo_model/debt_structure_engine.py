"""
Company-Specific Debt Structure Engine
Generates tailored debt schedules based on company characteristics.
"""

from dataclasses import dataclass
from typing import Dict, List, Any, Optional
from enum import Enum
import math

from .company_analyzer import CompanyProfile, CompanySize, IndustrySector, CreditQuality

class DebtTrancheType(Enum):
    SENIOR_TERM_LOAN_A = "Senior Term Loan A"
    SENIOR_TERM_LOAN_B = "Senior Term Loan B"
    MEZZANINE = "Mezzanine Debt"
    REVOLVER = "Revolver"
    BRIDGE_LOAN = "Bridge Loan"
    PIK_TOGGLE = "PIK Toggle"

@dataclass
class DebtTranche:
    """Individual debt tranche with company-specific terms."""
    name: str
    tranche_type: DebtTrancheType
    initial_amount: float
    interest_rate: float
    interest_only_periods: int
    amortization_years: int
    outstanding_balance: List[float]
    interest_expense: List[float]
    principal_payments: List[float]
    covenants: Dict[str, Any]

class DebtStructureEngine:
    """Generates company-specific debt structures based on profile analysis."""
    
    def __init__(self):
        self.industry_debt_structures = self._build_industry_structures()
        self.size_debt_structures = self._build_size_structures()
        self.credit_debt_structures = self._build_credit_structures()
    
    def _build_industry_structures(self) -> Dict[IndustrySector, Dict[str, Any]]:
        """Define industry-specific debt structure preferences."""
        return {
            IndustrySector.TECHNOLOGY: {
                'max_leverage': 4.0,  # Lower leverage for tech
                'senior_rate_base': 0.05,  # Better rates
                'mezzanine_rate_base': 0.10,
                'revolver_rate_base': 0.04,
                'prefer_term_loans': True,
                'min_io_periods': 2
            },
            IndustrySector.HEALTHCARE: {
                'max_leverage': 5.0,
                'senior_rate_base': 0.055,
                'mezzanine_rate_base': 0.11,
                'revolver_rate_base': 0.045,
                'prefer_term_loans': True,
                'min_io_periods': 1
            },
            IndustrySector.FINANCIAL: {
                'max_leverage': 3.0,  # Much lower leverage for financials
                'senior_rate_base': 0.045,
                'mezzanine_rate_base': 0.09,
                'revolver_rate_base': 0.035,
                'prefer_term_loans': False,
                'min_io_periods': 0
            },
            IndustrySector.CONSUMER: {
                'max_leverage': 5.5,
                'senior_rate_base': 0.06,
                'mezzanine_rate_base': 0.12,
                'revolver_rate_base': 0.05,
                'prefer_term_loans': True,
                'min_io_periods': 2
            },
            IndustrySector.ENERGY: {
                'max_leverage': 4.5,
                'senior_rate_base': 0.065,
                'mezzanine_rate_base': 0.13,
                'revolver_rate_base': 0.055,
                'prefer_term_loans': True,
                'min_io_periods': 1
            },
            IndustrySector.INDUSTRIAL: {
                'max_leverage': 5.0,
                'senior_rate_base': 0.06,
                'mezzanine_rate_base': 0.12,
                'revolver_rate_base': 0.05,
                'prefer_term_loans': True,
                'min_io_periods': 2
            },
            IndustrySector.MATERIALS: {
                'max_leverage': 4.5,
                'senior_rate_base': 0.065,
                'mezzanine_rate_base': 0.13,
                'revolver_rate_base': 0.055,
                'prefer_term_loans': True,
                'min_io_periods': 1
            },
            IndustrySector.UTILITIES: {
                'max_leverage': 6.0,  # Higher leverage for utilities
                'senior_rate_base': 0.05,
                'mezzanine_rate_base': 0.10,
                'revolver_rate_base': 0.04,
                'prefer_term_loans': True,
                'min_io_periods': 3
            },
            IndustrySector.REIT: {
                'max_leverage': 6.5,  # Highest leverage for REITs
                'senior_rate_base': 0.055,
                'mezzanine_rate_base': 0.11,
                'revolver_rate_base': 0.045,
                'prefer_term_loans': True,
                'min_io_periods': 4
            },
            IndustrySector.COMMUNICATION: {
                'max_leverage': 5.0,
                'senior_rate_base': 0.06,
                'mezzanine_rate_base': 0.12,
                'revolver_rate_base': 0.05,
                'prefer_term_loans': True,
                'min_io_periods': 2
            },
            IndustrySector.GROWTH: {
                'max_leverage': 4.5,
                'senior_rate_base': 0.07,
                'mezzanine_rate_base': 0.14,
                'revolver_rate_base': 0.06,
                'prefer_term_loans': True,
                'min_io_periods': 3
            }
        }
    
    def _build_size_structures(self) -> Dict[CompanySize, Dict[str, Any]]:
        """Define size-specific debt structure preferences."""
        return {
            CompanySize.MICRO_CAP: {
                'max_tranches': 2,
                'min_tranche_size': 1_000_000,  # Lower minimum for smaller companies
                'rate_premium': 0.02,  # Higher rates for smaller companies
                'prefer_simple': True
            },
            CompanySize.SMALL_CAP: {
                'max_tranches': 3,
                'min_tranche_size': 5_000_000,  # Lower minimum
                'rate_premium': 0.015,
                'prefer_simple': True
            },
            CompanySize.MID_CAP: {
                'max_tranches': 4,
                'min_tranche_size': 10_000_000,  # Lower minimum
                'rate_premium': 0.01,
                'prefer_simple': False
            },
            CompanySize.LARGE_CAP: {
                'max_tranches': 5,
                'min_tranche_size': 25_000_000,  # Lower minimum
                'rate_premium': 0.005,
                'prefer_simple': False
            },
            CompanySize.MEGA_CAP: {
                'max_tranches': 6,
                'min_tranche_size': 50_000_000,  # Lower minimum
                'rate_premium': 0.0,  # Best rates for mega caps
                'prefer_simple': False
            }
        }
    
    def _build_credit_structures(self) -> Dict[CreditQuality, Dict[str, Any]]:
        """Define credit quality-specific debt structure preferences."""
        return {
            CreditQuality.INVESTMENT_GRADE: {
                'rate_discount': 0.01,  # Better rates for investment grade
                'max_leverage_multiplier': 1.2,
                'covenant_light': True,
                'flexible_terms': True
            },
            CreditQuality.HIGH_YIELD: {
                'rate_discount': 0.0,
                'max_leverage_multiplier': 1.0,
                'covenant_light': False,
                'flexible_terms': False
            },
            CreditQuality.DISTRESSED: {
                'rate_discount': -0.02,  # Higher rates for distressed
                'max_leverage_multiplier': 0.8,
                'covenant_light': False,
                'flexible_terms': False
            }
        }
    
    def generate_debt_structure(self, profile: CompanyProfile, 
                              target_leverage: float = None) -> List[DebtTranche]:
        """Generate company-specific debt structure based on profile."""
        print(f"🏦 Generating debt structure for {profile.ticker}...")
        
        # Determine target leverage
        if target_leverage is None:
            target_leverage = self._calculate_target_leverage(profile)
        
        # Get industry, size, and credit-specific parameters
        industry_params = self.industry_debt_structures[profile.industry]
        size_params = self.size_debt_structures[profile.size_tier]
        credit_params = self.credit_debt_structures[profile.credit_quality]
        
        # Calculate total debt amount
        total_debt = profile.ebitda * target_leverage
        
        # Generate tranches based on company characteristics
        tranches = []
        
        # Senior Term Loan A (always present)
        senior_amount = total_debt * 0.6  # 60% of total debt
        if senior_amount >= size_params['min_tranche_size']:
            senior_rate = (industry_params['senior_rate_base'] + 
                          size_params['rate_premium'] + 
                          credit_params['rate_discount'])
            
            tranches.append(self._create_senior_term_loan_a(
                senior_amount, senior_rate, profile, industry_params
            ))
        
        # Senior Term Loan B (for larger companies)
        if (profile.size_tier in [CompanySize.LARGE_CAP, CompanySize.MEGA_CAP] and 
            len(tranches) < size_params['max_tranches']):
            term_b_amount = total_debt * 0.2  # 20% of total debt
            if term_b_amount >= size_params['min_tranche_size']:
                term_b_rate = senior_rate + 0.005  # 50bps premium to Term A
                tranches.append(self._create_senior_term_loan_b(
                    term_b_amount, term_b_rate, profile, industry_params
                ))
        
        # Mezzanine Debt (for most companies)
        if len(tranches) < size_params['max_tranches']:
            mezzanine_amount = total_debt * 0.25  # 25% of total debt
            if mezzanine_amount >= size_params['min_tranche_size']:
                mezzanine_rate = (industry_params['mezzanine_rate_base'] + 
                                size_params['rate_premium'] + 
                                credit_params['rate_discount'])
                tranches.append(self._create_mezzanine_debt(
                    mezzanine_amount, mezzanine_rate, profile, industry_params
                ))
        
        # Revolver (for most companies)
        if len(tranches) < size_params['max_tranches']:
            revolver_amount = total_debt * 0.15  # 15% of total debt
            if revolver_amount >= size_params['min_tranche_size']:
                revolver_rate = (industry_params['revolver_rate_base'] + 
                               size_params['rate_premium'] + 
                               credit_params['rate_discount'])
                tranches.append(self._create_revolver(
                    revolver_amount, revolver_rate, profile, industry_params
                ))
        
        # Additional tranches for mega caps
        if (profile.size_tier == CompanySize.MEGA_CAP and 
            len(tranches) < size_params['max_tranches']):
            # Bridge Loan
            bridge_amount = total_debt * 0.1
            if bridge_amount >= size_params['min_tranche_size']:
                bridge_rate = revolver_rate + 0.01  # 100bps premium to revolver
                tranches.append(self._create_bridge_loan(
                    bridge_amount, bridge_rate, profile
                ))
        
        print(f"✅ Generated {len(tranches)} debt tranches for {profile.ticker}")
        for tranche in tranches:
            print(f"   {tranche.name}: ${tranche.initial_amount:,.0f} @ {tranche.interest_rate:.1%}")
        
        return tranches
    
    def _calculate_target_leverage(self, profile: CompanyProfile) -> float:
        """Calculate target leverage based on company characteristics."""
        # Base leverage from industry
        industry_params = self.industry_debt_structures[profile.industry]
        base_leverage = industry_params['max_leverage']
        
        # Adjust for credit quality
        credit_params = self.credit_debt_structures[profile.credit_quality]
        leverage_multiplier = credit_params['max_leverage_multiplier']
        
        # Adjust for size (larger companies can handle more leverage)
        size_adjustment = {
            CompanySize.MICRO_CAP: 0.8,
            CompanySize.SMALL_CAP: 0.9,
            CompanySize.MID_CAP: 1.0,
            CompanySize.LARGE_CAP: 1.1,
            CompanySize.MEGA_CAP: 1.2
        }
        
        # Adjust for financial health
        health_adjustment = 1.0
        if profile.ebitda_margin > 0.3:  # High margin companies
            health_adjustment += 0.1
        elif profile.ebitda_margin < 0.1:  # Low margin companies
            health_adjustment -= 0.1
        
        if profile.interest_coverage > 5.0:  # Strong interest coverage
            health_adjustment += 0.1
        elif profile.interest_coverage < 2.0:  # Weak interest coverage
            health_adjustment -= 0.2
        
        # Calculate final leverage
        target_leverage = (base_leverage * leverage_multiplier * 
                          size_adjustment[profile.size_tier] * health_adjustment)
        
        # Ensure reasonable bounds
        target_leverage = max(2.0, min(target_leverage, 8.0))
        
        print(f"   Target leverage: {target_leverage:.1f}x (Base: {base_leverage:.1f}x)")
        return target_leverage
    
    def _create_senior_term_loan_a(self, amount: float, rate: float, 
                                  profile: CompanyProfile, 
                                  industry_params: Dict[str, Any]) -> DebtTranche:
        """Create Senior Term Loan A tranche."""
        # Calculate amortization schedule
        holding_period = 5  # Standard LBO holding period
        outstanding_balance = []
        interest_expense = []
        principal_payments = []
        
        remaining_balance = amount
        for year in range(holding_period + 1):
            outstanding_balance.append(remaining_balance)
            
            # Interest expense
            interest = remaining_balance * rate
            interest_expense.append(interest)
            
            # Principal payment (straight-line amortization)
            if year < holding_period:
                principal = amount / holding_period
                principal_payments.append(principal)
                remaining_balance -= principal
            else:
                principal_payments.append(0)
        
        # Covenants
        covenants = {
            'debt_to_ebitda_max': 4.0,
            'interest_coverage_min': 3.0,
            'maintenance_capex': True
        }
        
        return DebtTranche(
            name="Senior Term Loan A",
            tranche_type=DebtTrancheType.SENIOR_TERM_LOAN_A,
            initial_amount=amount,
            interest_rate=rate,
            interest_only_periods=0,  # Immediate amortization
            amortization_years=holding_period,
            outstanding_balance=outstanding_balance,
            interest_expense=interest_expense,
            principal_payments=principal_payments,
            covenants=covenants
        )
    
    def _create_senior_term_loan_b(self, amount: float, rate: float, 
                                  profile: CompanyProfile, 
                                  industry_params: Dict[str, Any]) -> DebtTranche:
        """Create Senior Term Loan B tranche."""
        # Calculate amortization schedule (bullet payment)
        holding_period = 5
        outstanding_balance = []
        interest_expense = []
        principal_payments = []
        
        for year in range(holding_period + 1):
            outstanding_balance.append(amount)
            interest_expense.append(amount * rate)
            
            if year < holding_period:
                principal_payments.append(0)  # No principal payments
            else:
                principal_payments.append(amount)  # Bullet payment
        
        # Covenants
        covenants = {
            'debt_to_ebitda_max': 4.5,
            'interest_coverage_min': 2.5,
            'maintenance_capex': True
        }
        
        return DebtTranche(
            name="Senior Term Loan B",
            tranche_type=DebtTrancheType.SENIOR_TERM_LOAN_B,
            initial_amount=amount,
            interest_rate=rate,
            interest_only_periods=holding_period,
            amortization_years=holding_period,
            outstanding_balance=outstanding_balance,
            interest_expense=interest_expense,
            principal_payments=principal_payments,
            covenants=covenants
        )
    
    def _create_mezzanine_debt(self, amount: float, rate: float, 
                              profile: CompanyProfile, 
                              industry_params: Dict[str, Any]) -> DebtTranche:
        """Create Mezzanine Debt tranche."""
        # Calculate amortization schedule (bullet payment)
        holding_period = 5
        outstanding_balance = []
        interest_expense = []
        principal_payments = []
        
        for year in range(holding_period + 1):
            outstanding_balance.append(amount)
            interest_expense.append(amount * rate)
            
            if year < holding_period:
                principal_payments.append(0)  # No principal payments
            else:
                principal_payments.append(amount)  # Bullet payment
        
        # Covenants
        covenants = {
            'debt_to_ebitda_max': 5.0,
            'interest_coverage_min': 2.0,
            'maintenance_capex': False
        }
        
        return DebtTranche(
            name="Mezzanine Debt",
            tranche_type=DebtTrancheType.MEZZANINE,
            initial_amount=amount,
            interest_rate=rate,
            interest_only_periods=holding_period,
            amortization_years=holding_period,
            outstanding_balance=outstanding_balance,
            interest_expense=interest_expense,
            principal_payments=principal_payments,
            covenants=covenants
        )
    
    def _create_revolver(self, amount: float, rate: float, 
                        profile: CompanyProfile, 
                        industry_params: Dict[str, Any]) -> DebtTranche:
        """Create Revolver tranche."""
        # Calculate amortization schedule (bullet payment)
        holding_period = 5
        outstanding_balance = []
        interest_expense = []
        principal_payments = []
        
        for year in range(holding_period + 1):
            outstanding_balance.append(amount)  # Fully drawn
            interest_expense.append(amount * rate)
            principal_payments.append(0)  # No principal payments
        
        # Covenants
        covenants = {
            'debt_to_ebitda_max': 6.0,
            'interest_coverage_min': 1.5,
            'maintenance_capex': False
        }
        
        return DebtTranche(
            name="Revolver",
            tranche_type=DebtTrancheType.REVOLVER,
            initial_amount=amount,
            interest_rate=rate,
            interest_only_periods=holding_period,
            amortization_years=holding_period,
            outstanding_balance=outstanding_balance,
            interest_expense=interest_expense,
            principal_payments=principal_payments,
            covenants=covenants
        )
    
    def _create_bridge_loan(self, amount: float, rate: float, 
                           profile: CompanyProfile) -> DebtTranche:
        """Create Bridge Loan tranche."""
        # Calculate amortization schedule (bullet payment)
        holding_period = 5
        outstanding_balance = []
        interest_expense = []
        principal_payments = []
        
        for year in range(holding_period + 1):
            outstanding_balance.append(amount)
            interest_expense.append(amount * rate)
            
            if year < holding_period:
                principal_payments.append(0)  # No principal payments
            else:
                principal_payments.append(amount)  # Bullet payment
        
        # Covenants
        covenants = {
            'debt_to_ebitda_max': 6.5,
            'interest_coverage_min': 1.0,
            'maintenance_capex': False
        }
        
        return DebtTranche(
            name="Bridge Loan",
            tranche_type=DebtTrancheType.BRIDGE_LOAN,
            initial_amount=amount,
            interest_rate=rate,
            interest_only_periods=holding_period,
            amortization_years=holding_period,
            outstanding_balance=outstanding_balance,
            interest_expense=interest_expense,
            principal_payments=principal_payments,
            covenants=covenants
        )
