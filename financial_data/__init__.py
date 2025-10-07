"""
Financial Data Layer - Company-specific assumptions with fail-fast validation.
No generic defaults.
"""

from .data_engine import FinancialDataEngine
from .contracts import FinancialData, InsufficientDataError, Config

__all__ = ['FinancialDataEngine', 'FinancialData', 'InsufficientDataError', 'Config']
