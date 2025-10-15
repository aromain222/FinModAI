"""
Runtime guardrails for FastAPI to enforce real data policy.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
import re

from config import config

logger = logging.getLogger(__name__)


class RuntimeGuardrails:
    """Runtime guardrails to enforce real data policy."""
    
    def __init__(self):
        self.data_mode = config.data_mode
        self.is_production = config.is_production
        self.staleness_max_minutes = config.staleness_max_minutes
        self.require_min_fund_years = config.require_min_fund_years
        
        # Blocked patterns for production
        self.blocked_patterns = [
            "fixtures", "mocks", "sampleData", "demoData", "PLACEHOLDER",
            "placeholder", "fake", "toy", "dummy", "test_data", "mock_data"
        ]
        
        # Blocked string literals
        self.blocked_strings = [
            '"placeholder": true', '"placeholder":true', '"mock": true', '"mock":true',
            '"sample": true', '"sample":true', '"demo": true', '"demo":true',
            '"fake": true', '"fake":true', '"dummy": true', '"dummy":true'
        ]
        
        # Sentinel values
        self.sentinel_values = [-999999, -99999, -9999, 999999, 99999, 9999]
        
        # Blocked string values
        self.blocked_string_values = ["MOCK", "DEMO", "SAMPLE", "FAKE", "PLACEHOLDER", "N/A", "n/a"]
    
    async def enforce_real_data_policy(self, response_json: Dict[str, Any], endpoint: str) -> None:
        """
        Enforce real data policy on response.
        
        Args:
            response_json: The response JSON to validate
            endpoint: The endpoint being called
            
        Raises:
            HTTPException: If policy violations are detected
        """
        if not self.is_production:
            return
        
        try:
            # Convert to string for pattern matching
            response_str = json.dumps(response_json, default=str)
            
            # Check for blocked patterns
            self._check_blocked_patterns(response_str, endpoint)
            
            # Check for blocked string literals
            self._check_blocked_strings(response_str, endpoint)
            
            # Check for sentinel values
            self._check_sentinel_values(response_json, endpoint)
            
            # Check for required provenance
            self._check_provenance_requirements(response_json, endpoint)
            
            # Check data freshness
            self._check_data_freshness(response_json, endpoint)
            
            # Check model-specific requirements
            self._check_model_requirements(response_json, endpoint)
            
        except Exception as e:
            logger.error(f"Runtime guardrails error for {endpoint}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="blocked_by_policy: validation error"
            )
    
    def _check_blocked_patterns(self, response_str: str, endpoint: str) -> None:
        """Check for blocked patterns in response."""
        for pattern in self.blocked_patterns:
            if pattern in response_str.lower():
                logger.error(f"Blocked pattern detected in {endpoint}: {pattern}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"blocked_by_policy: placeholder detected - {pattern}"
                )
    
    def _check_blocked_strings(self, response_str: str, endpoint: str) -> None:
        """Check for blocked string literals in response."""
        for blocked_string in self.blocked_strings:
            if blocked_string in response_str:
                logger.error(f"Blocked string literal detected in {endpoint}: {blocked_string}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"blocked_by_policy: placeholder string detected - {blocked_string}"
                )
    
    def _check_sentinel_values(self, response_json: Dict[str, Any], endpoint: str) -> None:
        """Check for sentinel values in response."""
        def check_value(value, path=""):
            if isinstance(value, (int, float)):
                if value in self.sentinel_values:
                    logger.error(f"Sentinel value detected in {endpoint} at {path}: {value}")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"blocked_by_policy: sentinel value detected at {path}"
                    )
            elif isinstance(value, str):
                if value in self.blocked_string_values:
                    logger.error(f"Blocked string value detected in {endpoint} at {path}: {value}")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"blocked_by_policy: blocked string value at {path}"
                    )
            elif isinstance(value, dict):
                for k, v in value.items():
                    check_value(v, f"{path}.{k}" if path else k)
            elif isinstance(value, list):
                for i, item in enumerate(value):
                    check_value(item, f"{path}[{i}]")
        
        check_value(response_json)
    
    def _check_provenance_requirements(self, response_json: Dict[str, Any], endpoint: str) -> None:
        """Check for required provenance and timestamps."""
        if not config.require_provenance:
            return
        
        required_fields = ["as_of_quotes", "as_of_fundamentals", "stale"]
        missing_fields = []
        
        for field in required_fields:
            if field not in response_json:
                missing_fields.append(field)
        
        if missing_fields:
            logger.error(f"Missing provenance fields in {endpoint}: {missing_fields}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"blocked_by_policy: missing provenance timestamps - {missing_fields}"
            )
        
        # Check provenance structure
        if "provenance" in response_json:
            provenance = response_json["provenance"]
            if not isinstance(provenance, dict):
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="blocked_by_policy: invalid provenance structure"
                )
            
            # Check for field-level provenance
            has_field_provenance = any(
                isinstance(v, dict) and "source" in v 
                for v in provenance.values()
            )
            if not has_field_provenance:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="blocked_by_policy: missing field-level provenance"
                )
    
    def _check_data_freshness(self, response_json: Dict[str, Any], endpoint: str) -> None:
        """Check data freshness requirements."""
        if response_json.get("stale", False):
            logger.error(f"Stale data detected in {endpoint}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="data_stale: data marked as stale"
            )
        
        # Check quote freshness
        quotes_as_of = response_json.get("as_of_quotes")
        if quotes_as_of:
            try:
                if isinstance(quotes_as_of, str):
                    quote_time = datetime.fromisoformat(quotes_as_of.replace('Z', '+00:00'))
                else:
                    quote_time = quotes_as_of
                
                age = datetime.now(quote_time.tzinfo) - quote_time
                age_minutes = age.total_seconds() / 60
                
                if age_minutes > self.staleness_max_minutes:
                    logger.error(f"Data too old in {endpoint}: {age_minutes:.1f} minutes")
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail=f"data_stale: quotes too old - {age_minutes:.1f} minutes"
                    )
                    
            except (ValueError, TypeError) as e:
                logger.error(f"Invalid timestamp format in {endpoint}: {e}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="blocked_by_policy: invalid timestamp format"
                )
    
    def _check_model_requirements(self, response_json: Dict[str, Any], endpoint: str) -> None:
        """Check model-specific requirements."""
        if "/dcf" in endpoint:
            self._validate_dcf_bundle(response_json, endpoint)
        elif "/lbo" in endpoint:
            self._validate_lbo_bundle(response_json, endpoint)
        elif "/comps" in endpoint:
            self._validate_comps_bundle(response_json, endpoint)
        elif "/merger" in endpoint:
            self._validate_merger_bundle(response_json, endpoint)
    
    def _validate_dcf_bundle(self, response_json: Dict[str, Any], endpoint: str) -> None:
        """Validate DCF bundle requirements."""
        missing_fields = []
        
        # Check for minimum historical data
        historicals = response_json.get("historicals", {})
        if isinstance(historicals, dict):
            revenue_data = historicals.get("revenue", [])
            ebit_data = historicals.get("ebit", []) or historicals.get("ebitda", [])
            
            if isinstance(revenue_data, list) and isinstance(ebit_data, list):
                valid_years = min(len(revenue_data), len(ebit_data))
                if valid_years < self.require_min_fund_years:
                    missing_fields.append(f"≥{self.require_min_fund_years} FY of revenue & ebit/ebitda")
        
        # Check required fields
        required_fields = ["market", "capital", "wacc_inputs"]
        for field in required_fields:
            if field not in response_json:
                missing_fields.append(field)
        
        # Check capital structure fields
        capital = response_json.get("capital", {})
        capital_fields = ["cash", "net_debt", "shares_out"]
        for field in capital_fields:
            if field not in capital or capital[field] is None:
                missing_fields.append(f"capital.{field}")
        
        # Check market fields
        market = response_json.get("market", {})
        market_fields = ["price", "market_cap"]
        for field in market_fields:
            if field not in market or market[field] is None:
                missing_fields.append(f"market.{field}")
        
        if missing_fields:
            logger.error(f"Missing DCF fields in {endpoint}: {missing_fields}")
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"missing_fields: {', '.join(sorted(set(missing_fields)))}"
            )
    
    def _validate_lbo_bundle(self, response_json: Dict[str, Any], endpoint: str) -> None:
        """Validate LBO bundle requirements."""
        missing_fields = []
        
        required_fields = ["starting", "market", "cap_structure_hints"]
        for field in required_fields:
            if field not in response_json:
                missing_fields.append(field)
        
        # Check starting point fields
        starting = response_json.get("starting", {})
        starting_fields = ["revenue_ltm", "ebitda_ltm", "ebit_ltm", "capex_ltm", "delta_nwc_ltm"]
        for field in starting_fields:
            if field not in starting or starting[field] is None:
                missing_fields.append(f"starting.{field}")
        
        if missing_fields:
            logger.error(f"Missing LBO fields in {endpoint}: {missing_fields}")
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"missing_fields: {', '.join(sorted(set(missing_fields)))}"
            )
    
    def _validate_comps_bundle(self, response_json: Dict[str, Any], endpoint: str) -> None:
        """Validate Comps bundle requirements."""
        peer_rows = response_json.get("peer_rows", [])
        if isinstance(peer_rows, list) and len(peer_rows) < 8:
            logger.error(f"Insufficient peers in {endpoint}: {len(peer_rows)}")
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="missing_fields: ≥8 peer companies required"
            )
        
        # Check that peers have required fields
        if peer_rows:
            sample_peer = peer_rows[0]
            required_peer_fields = ["ticker", "market_cap", "ev", "ev_to_ebitda"]
            missing_peer_fields = []
            
            for field in required_peer_fields:
                if field not in sample_peer or sample_peer[field] is None:
                    missing_peer_fields.append(f"peer.{field}")
            
            if missing_peer_fields:
                logger.error(f"Missing peer fields in {endpoint}: {missing_peer_fields}")
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"missing_fields: {', '.join(sorted(set(missing_peer_fields)))}"
                )
    
    def _validate_merger_bundle(self, response_json: Dict[str, Any], endpoint: str) -> None:
        """Validate Merger bundle requirements."""
        missing_fields = []
        
        required_fields = ["acquirer", "target", "shared"]
        for field in required_fields:
            if field not in response_json:
                missing_fields.append(field)
        
        # Check acquirer and target have required structure
        acquirer = response_json.get("acquirer", {})
        target = response_json.get("target", {})
        
        for entity_name, entity_data in [("acquirer", acquirer), ("target", target)]:
            if not entity_data:
                missing_fields.append(f"{entity_name}")
            else:
                entity_required = ["market", "capital"]
                for field in entity_required:
                    if field not in entity_data:
                        missing_fields.append(f"{entity_name}.{field}")
        
        if missing_fields:
            logger.error(f"Missing merger fields in {endpoint}: {missing_fields}")
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"missing_fields: {', '.join(sorted(set(missing_fields)))}"
            )


# Global instance
runtime_guardrails = RuntimeGuardrails()


async def real_data_middleware(request: Request, call_next):
    """FastAPI middleware to enforce real data policy."""
    response = await call_next(request)
    
    # Only check model-inputs and market endpoints
    if request.url.path.startswith("/api/v1/model-inputs/") or request.url.path.startswith("/api/v1/market/"):
        try:
            # Get response body
            response_body = b""
            async for chunk in response.body_iterator:
                response_body += chunk
            
            # Parse JSON if possible
            try:
                response_json = json.loads(response_body.decode())
            except (json.JSONDecodeError, UnicodeDecodeError):
                # Not JSON, skip validation
                pass
            else:
                # Apply runtime guardrails
                await runtime_guardrails.enforce_real_data_policy(response_json, request.url.path)
        
        except HTTPException:
            # Re-raise HTTP exceptions from guardrails
            raise
        except Exception as e:
            logger.error(f"Middleware error: {e}")
            # Don't fail the request for middleware errors
    
    return response
