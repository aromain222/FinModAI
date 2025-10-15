"""
Lightweight auditing and provenance tracking system.
"""
import json
import logging
import hashlib
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
import uuid

from config import config

logger = logging.getLogger(__name__)


@dataclass
class AuditRecord:
    """Audit record for model input requests."""
    request_id: str
    timestamp: str
    endpoint: str
    ticker: str
    model_type: str
    providers_used: List[str]
    missing_fields: List[str]
    as_of_quotes: Optional[str]
    as_of_fundamentals: Optional[str]
    success: bool
    error_message: Optional[str] = None
    data_hash: Optional[str] = None


@dataclass
class ProvenanceRecord:
    """Field-level provenance record."""
    field: str
    provider: str
    as_of: str
    value_hash: Optional[str] = None


class AuditingSystem:
    """Lightweight auditing and provenance tracking system."""
    
    def __init__(self):
        self.audit_log: List[AuditRecord] = []
        self.max_audit_records = 1000  # Keep last 1000 records
        
    def create_audit_record(
        self,
        endpoint: str,
        ticker: str,
        model_type: str,
        providers_used: List[str],
        missing_fields: List[str],
        as_of_quotes: Optional[str],
        as_of_fundamentals: Optional[str],
        success: bool,
        error_message: Optional[str] = None,
        data: Optional[Dict[str, Any]] = None
    ) -> AuditRecord:
        """Create an audit record for a request."""
        request_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()
        
        # Calculate data hash for integrity
        data_hash = None
        if data:
            data_str = json.dumps(data, sort_keys=True, default=str)
            data_hash = hashlib.sha256(data_str.encode()).hexdigest()[:16]
        
        record = AuditRecord(
            request_id=request_id,
            timestamp=timestamp,
            endpoint=endpoint,
            ticker=ticker,
            model_type=model_type,
            providers_used=providers_used,
            missing_fields=missing_fields,
            as_of_quotes=as_of_quotes,
            as_of_fundamentals=as_of_fundamentals,
            success=success,
            error_message=error_message,
            data_hash=data_hash
        )
        
        # Add to audit log
        self.audit_log.append(record)
        
        # Trim audit log if too large
        if len(self.audit_log) > self.max_audit_records:
            self.audit_log = self.audit_log[-self.max_audit_records:]
        
        # Log audit record
        self._log_audit_record(record)
        
        return record
    
    def _log_audit_record(self, record: AuditRecord) -> None:
        """Log audit record for monitoring."""
        status = "✅ SUCCESS" if record.success else "❌ FAILED"
        
        log_msg = f"📊 AUDIT {status} | {record.ticker} | {record.model_type} | {record.endpoint}"
        
        if record.success:
            log_msg += f" | Providers: {','.join(record.providers_used)}"
            if record.data_hash:
                log_msg += f" | Hash: {record.data_hash}"
        else:
            log_msg += f" | Error: {record.error_message}"
            if record.missing_fields:
                log_msg += f" | Missing: {','.join(record.missing_fields)}"
        
        logger.info(log_msg)
    
    def create_provenance_record(
        self,
        field: str,
        provider: str,
        as_of: str,
        value: Optional[Any] = None
    ) -> ProvenanceRecord:
        """Create a provenance record for a field."""
        # Calculate value hash for integrity
        value_hash = None
        if value is not None:
            value_str = json.dumps(value, sort_keys=True, default=str)
            value_hash = hashlib.sha256(value_str.encode()).hexdigest()[:16]
        
        return ProvenanceRecord(
            field=field,
            provider=provider,
            as_of=as_of,
            value_hash=value_hash
        )
    
    def get_audit_summary(self, hours: int = 24) -> Dict[str, Any]:
        """Get audit summary for the last N hours."""
        cutoff_time = datetime.now(timezone.utc).timestamp() - (hours * 3600)
        
        recent_records = [
            record for record in self.audit_log
            if datetime.fromisoformat(record.timestamp.replace('Z', '+00:00')).timestamp() > cutoff_time
        ]
        
        if not recent_records:
            return {
                "total_requests": 0,
                "successful_requests": 0,
                "failed_requests": 0,
                "success_rate": 0.0,
                "providers_used": {},
                "common_errors": {},
                "tickers_requested": {}
            }
        
        successful = [r for r in recent_records if r.success]
        failed = [r for r in recent_records if not r.success]
        
        # Provider usage stats
        providers_used = {}
        for record in recent_records:
            for provider in record.providers_used:
                providers_used[provider] = providers_used.get(provider, 0) + 1
        
        # Common errors
        common_errors = {}
        for record in failed:
            if record.error_message:
                error_type = record.error_message.split(':')[0] if ':' in record.error_message else record.error_message
                common_errors[error_type] = common_errors.get(error_type, 0) + 1
        
        # Ticker requests
        tickers_requested = {}
        for record in recent_records:
            tickers_requested[record.ticker] = tickers_requested.get(record.ticker, 0) + 1
        
        return {
            "total_requests": len(recent_records),
            "successful_requests": len(successful),
            "failed_requests": len(failed),
            "success_rate": len(successful) / len(recent_records) if recent_records else 0.0,
            "providers_used": providers_used,
            "common_errors": common_errors,
            "tickers_requested": tickers_requested,
            "time_range_hours": hours
        }
    
    def get_provenance_for_ticker(self, ticker: str, hours: int = 24) -> List[AuditRecord]:
        """Get provenance records for a specific ticker."""
        cutoff_time = datetime.now(timezone.utc).timestamp() - (hours * 3600)
        
        return [
            record for record in self.audit_log
            if record.ticker.upper() == ticker.upper() and
            datetime.fromisoformat(record.timestamp.replace('Z', '+00:00')).timestamp() > cutoff_time
        ]
    
    def export_audit_log(self, hours: int = 24) -> List[Dict[str, Any]]:
        """Export audit log as JSON for external analysis."""
        cutoff_time = datetime.now(timezone.utc).timestamp() - (hours * 3600)
        
        recent_records = [
            record for record in self.audit_log
            if datetime.fromisoformat(record.timestamp.replace('Z', '+00:00')).timestamp() > cutoff_time
        ]
        
        return [asdict(record) for record in recent_records]
    
    def verify_data_integrity(self, request_id: str, data: Dict[str, Any]) -> bool:
        """Verify data integrity using stored hash."""
        for record in self.audit_log:
            if record.request_id == request_id:
                if record.data_hash:
                    data_str = json.dumps(data, sort_keys=True, default=str)
                    current_hash = hashlib.sha256(data_str.encode()).hexdigest()[:16]
                    return current_hash == record.data_hash
                return True
        return False


# Global auditing system instance
auditing_system = AuditingSystem()


def audit_model_request(
    endpoint: str,
    ticker: str,
    model_type: str,
    providers_used: List[str],
    missing_fields: List[str],
    as_of_quotes: Optional[str],
    as_of_fundamentals: Optional[str],
    success: bool,
    error_message: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None
) -> str:
    """
    Audit a model request and return the request ID.
    
    Returns:
        str: Request ID for tracking
    """
    record = auditing_system.create_audit_record(
        endpoint=endpoint,
        ticker=ticker,
        model_type=model_type,
        providers_used=providers_used,
        missing_fields=missing_fields,
        as_of_quotes=as_of_quotes,
        as_of_fundamentals=as_of_fundamentals,
        success=success,
        error_message=error_message,
        data=data
    )
    
    return record.request_id


def create_field_provenance(
    field: str,
    provider: str,
    as_of: str,
    value: Optional[Any] = None
) -> Dict[str, Any]:
    """Create field-level provenance information."""
    provenance_record = auditing_system.create_provenance_record(
        field=field,
        provider=provider,
        as_of=as_of,
        value=value
    )
    
    return {
        "source": provider,
        "as_of": as_of,
        "hash": provenance_record.value_hash
    }
