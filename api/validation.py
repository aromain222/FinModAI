#!/usr/bin/env python3
"""
Ticker Validation
"""

import re
import logging

logger = logging.getLogger(__name__)

class TickerValidator:
    """Validates ticker symbols"""
    
    # Valid ticker pattern: 1-5 letters, optional numbers/dots/dashes
    TICKER_PATTERN = re.compile(r'^[A-Z][A-Z0-9.\-]{0,14}$')
    
    # Common invalid patterns
    INVALID_PATTERNS = [
        re.compile(r'^\d+$'),  # Pure numbers
        re.compile(r'^[^A-Z]'),  # Doesn't start with letter
        re.compile(r'[^A-Z0-9.\-]'),  # Invalid characters
    ]
    
    @classmethod
    def is_valid(cls, ticker: str) -> bool:
        """Check if ticker is valid"""
        if not ticker or not isinstance(ticker, str):
            return False
        
        ticker = ticker.upper().strip()
        
        # Check length
        if len(ticker) < 1 or len(ticker) > 15:
            return False
        
        # Check against invalid patterns
        for pattern in cls.INVALID_PATTERNS:
            if pattern.search(ticker):
                return False
        
        # Check against valid pattern
        return bool(cls.TICKER_PATTERN.match(ticker))
    
    @classmethod
    def sanitize(cls, ticker: str) -> str:
        """Sanitize ticker symbol"""
        if not ticker:
            return ""
        
        # Convert to uppercase and strip whitespace
        ticker = ticker.upper().strip()
        
        # Remove invalid characters
        ticker = re.sub(r'[^A-Z0-9.\-]', '', ticker)
        
        return ticker
    
    @classmethod
    def validate_and_sanitize(cls, ticker: str) -> tuple[str, bool]:
        """Validate and sanitize ticker, return (sanitized_ticker, is_valid)"""
        sanitized = cls.sanitize(ticker)
        is_valid = cls.is_valid(sanitized)
        return sanitized, is_valid
