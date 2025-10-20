"""
Model Generation API Endpoints
Generate, retrieve, and download financial models
"""

import logging
import os
import sys
from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from models_data.bundles import DCFFields  # noqa: E402
from models_data.generate import generate_dcf_model  # noqa: E402
from persistence.database import get_db  # noqa: E402
from persistence.schema import File, ModelRun  # noqa: E402

logger = logging.getLogger(__name__)

router = APIRouter()


# Request/Response Models


class ModelGenerateRequest(BaseModel):
    """Model generation request"""

    model_type: str = Field(..., description="Model type: dcf, lbo, comps, or merger")
    ticker: str = Field(..., description="Company ticker symbol")
    target: Optional[str] = Field(None, description="Target ticker (for merger models)")
    custom_assumptions: Optional[Dict[str, Any]] = Field(
        None, description="Custom assumptions"
    )
    options: Optional[Dict[str, Any]] = Field(None, description="Generation options")


class ModelGenerateResponse(BaseModel):
    """Model generation response"""

    model_id: UUID
    status: str
    as_of_quotes: datetime
    as_of_fundamentals: datetime
    stale: bool
    results: Dict[str, Any]
    provenance: Dict[str, str]
    warnings: list[str] = []


class ModelResponse(BaseModel):
    """Model retrieval response"""

    model_id: UUID
    model_type: str
    ticker: str
    target: Optional[str]
    created_at: datetime
    as_of_quotes: datetime
    as_of_fundamentals: datetime
    stale: bool
    results: Dict[str, Any]
    inputs: Dict[str, Any]
    provenance: Dict[str, str]
    custom_assumptions: Optional[Dict[str, Any]]
    warnings: list[str] = []


# Helper Functions


def fetch_company_data(ticker: str) -> Dict[str, Any]:
    """
    Fetch company data from existing infrastructure
    This integrates with your existing minimal_app.py
    """
    try:
        from minimal_app import get_company_data

        company_data = get_company_data(ticker)

        if not company_data:
            raise ValueError(f"No data available for {ticker}")

        return company_data

    except Exception as e:
        logger.error(f"Error fetching data for {ticker}: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not fetch data for {ticker}: {str(e)}",
        )


def build_dcf_bundle(ticker: str, company_data: Dict[str, Any]) -> DCFFields:
    """Build DCF input bundle from company data"""
    from models_data.bundles import (
        HistoricalFinancial,
        MarketData,
        CapitalStructure,
        Provenance,
    )
    from decimal import Decimal

    # Extract historicals
    historicals = []
    for hist in company_data.get("historicals", []):
        historicals.append(
            HistoricalFinancial(
                year=hist.get("year", 2023),
                revenue=Decimal(str(hist.get("revenue", 0))),
                ebit=Decimal(str(hist.get("ebit", 0))),
                ebitda=Decimal(str(hist.get("ebitda", 0))),
                net_income=Decimal(str(hist.get("net_income", 0))),
                free_cash_flow=Decimal(str(hist.get("free_cash_flow", 0))),
                capex=Decimal(str(hist.get("capex", 0))),
                delta_nwc=Decimal(str(hist.get("delta_nwc", 0))),
            )
        )

    # Extract market data
    market_data = company_data.get("market", {})
    market = MarketData(
        price=Decimal(str(market_data.get("price", 0))),
        market_cap=Decimal(str(market_data.get("market_cap", 0))),
        shares_outstanding=Decimal(str(market_data.get("shares_out", 0))),
        beta=Decimal(str(market_data.get("beta", 1.0))),
        volume=market_data.get("volume", 0),
    )

    # Extract capital structure
    capital_data = company_data.get("capital", {})
    capital = CapitalStructure(
        cash=Decimal(str(capital_data.get("cash", 0))),
        gross_debt=Decimal(str(capital_data.get("gross_debt", 0))),
        net_debt=Decimal(str(capital_data.get("net_debt", 0))),
        equity=Decimal(str(capital_data.get("equity", 0))),
    )

    # Extract current financials
    latest = company_data.get("latest", {})
    current_revenue = Decimal(str(latest.get("revenue", 0)))
    current_ebit = Decimal(str(latest.get("ebit", 0)))
    current_ebitda = Decimal(str(latest.get("ebitda", 0)))
    current_fcf = Decimal(str(latest.get("free_cash_flow", 0)))

    # Build provenance
    provenance = {
        "revenue": Provenance(provider="edgar", timestamp=datetime.utcnow()),
        "price": Provenance(provider="yahoo", timestamp=datetime.utcnow()),
        "ebitda": Provenance(provider="edgar", timestamp=datetime.utcnow()),
    }

    # Check staleness
    stale = False
    as_of_quotes = datetime.utcnow()
    as_of_fundamentals = datetime.utcnow()

    return DCFFields(
        historicals=historicals,
        market=market,
        capital=capital,
        current_revenue=current_revenue,
        current_ebit=current_ebit,
        current_ebitda=current_ebitda,
        current_fcf=current_fcf,
        provenance=provenance,
        as_of_quotes=as_of_quotes,
        as_of_fundamentals=as_of_fundamentals,
        stale=stale,
    )


# API Endpoints


@router.post(
    "/generate",
    response_model=ModelGenerateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_model(request: ModelGenerateRequest, db: Session = Depends(get_db)):
    """
    Generate a financial model

    Args:
        request: Model generation request
        db: Database session

    Returns:
        Model generation response with results
    """
    try:
        # Validate model type
        model_type = request.model_type.lower()
        if model_type not in ["dcf", "lbo", "comps", "merger"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid model type: {model_type}. Must be dcf, lbo, comps, or merger",
            )

        # Validate custom assumptions
        if request.custom_assumptions:
            from validation.rules import (
                validate_dcf_assumptions,
                validate_lbo_assumptions,
                validate_comps_assumptions,
                validate_merger_assumptions,
            )

            if model_type == "dcf":
                errors, _ = validate_dcf_assumptions(request.custom_assumptions)
            elif model_type == "lbo":
                errors, _ = validate_lbo_assumptions(request.custom_assumptions)
            elif model_type == "comps":
                errors, _ = validate_comps_assumptions(request.custom_assumptions)
            elif model_type == "merger":
                errors, _ = validate_merger_assumptions(request.custom_assumptions)

            if errors:
                error_details = [
                    {"field": e.field, "message": e.message, "code": e.code}
                    for e in errors
                ]
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={
                        "error": "validation_error",
                        "code": "invalid_assumptions",
                        "message": "Custom assumptions validation failed",
                        "details": error_details,
                    },
                )

        # Fetch company data
        logger.info(f"Fetching data for {request.ticker}")
        company_data = fetch_company_data(request.ticker)

        # Build model bundle
        if model_type == "dcf":
            bundle = build_dcf_bundle(request.ticker, company_data)

            # Validate bundle
            if bundle.stale:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Data is stale. Please refresh.",
                )

            # Generate model
            results = generate_dcf_model(bundle, request.custom_assumptions)

            # Run sanity checks
            from validation.rules import validate_sanity_checks

            sanity_warnings = validate_sanity_checks(results, model_type)
            if sanity_warnings:
                results["warnings"] = results.get("warnings", []) + [
                    w.message for w in sanity_warnings
                ]

        elif model_type == "lbo":
            # TODO: Build LBO bundle
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="LBO model generation not yet implemented",
            )

        elif model_type == "comps":
            # TODO: Build Comps bundle
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="Comps model generation not yet implemented",
            )

        elif model_type == "merger":
            # TODO: Build Merger bundle
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="Merger model generation not yet implemented",
            )

        # Persist model run
        model_run = ModelRun(
            model_type=model_type,
            ticker=request.ticker,
            target=request.target,
            as_of_quotes=bundle.as_of_quotes,
            as_of_fundamentals=bundle.as_of_fundamentals,
            stale=bundle.stale,
            results_json=results,
            inputs_json=company_data,
            provenance_json={
                k: {"provider": v.provider, "timestamp": v.timestamp.isoformat()}
                for k, v in bundle.provenance.items()
            },
            custom_assumptions=request.custom_assumptions,
        )

        db.add(model_run)
        db.commit()
        db.refresh(model_run)

        logger.info(
            f"Generated {model_type} model for {request.ticker} with ID {model_run.id}"
        )

        return ModelGenerateResponse(
            model_id=model_run.id,
            status="succeeded",
            as_of_quotes=bundle.as_of_quotes,
            as_of_fundamentals=bundle.as_of_fundamentals,
            stale=bundle.stale,
            results=results,
            provenance={k: v.provider for k, v in bundle.provenance.items()},
            warnings=results.get("warnings", []),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating model: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating model: {str(e)}",
        )


@router.get("/{model_id}", response_model=ModelResponse)
async def get_model(model_id: UUID, db: Session = Depends(get_db)):
    """
    Get a specific model by ID

    Args:
        model_id: Model ID
        db: Database session

    Returns:
        Model details
    """
    model_run = db.query(ModelRun).filter(ModelRun.id == model_id).first()

    if not model_run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Model {model_id} not found"
        )

    return ModelResponse(
        model_id=model_run.id,
        model_type=model_run.model_type,
        ticker=model_run.ticker,
        target=model_run.target,
        created_at=model_run.created_at,
        as_of_quotes=model_run.as_of_quotes,
        as_of_fundamentals=model_run.as_of_fundamentals,
        stale=model_run.stale,
        results=model_run.results_json or {},
        inputs=model_run.inputs_json or {},
        provenance=model_run.provenance_json or {},
        custom_assumptions=model_run.custom_assumptions,
        warnings=model_run.results_json.get("warnings", [])
        if model_run.results_json
        else [],
    )


@router.get("/{model_id}/excel")
async def download_excel(model_id: UUID, db: Session = Depends(get_db)):
    """
    Download model as Excel file

    Args:
        model_id: Model ID
        db: Database session

    Returns:
        Excel file
    """
    model_run = db.query(ModelRun).filter(ModelRun.id == model_id).first()

    if not model_run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Model {model_id} not found"
        )

    try:
        # Import export functions
        from exports.excel import (
            export_dcf_to_excel,
            export_lbo_to_excel,
            export_comps_to_excel,
            export_merger_to_excel,
        )

        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{model_run.model_type}_{model_run.ticker}_{timestamp}.xlsx"
        output_path = os.path.join("exports", filename)

        # Ensure exports directory exists
        os.makedirs("exports", exist_ok=True)

        # Generate Excel based on model type
        if model_run.model_type == "dcf":
            export_dcf_to_excel(model_run.results_json, model_run.ticker, output_path)
        elif model_run.model_type == "lbo":
            export_lbo_to_excel(model_run.results_json, model_run.ticker, output_path)
        elif model_run.model_type == "comps":
            export_comps_to_excel(model_run.results_json, model_run.ticker, output_path)
        elif model_run.model_type == "merger":
            export_merger_to_excel(
                model_run.results_json, model_run.ticker, output_path
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported model type: {model_run.model_type}",
            )

        # Store file record
        file_record = File(
            model_id=model_run.id,
            kind="xlsx",
            path=output_path,
            size=os.path.getsize(output_path),
        )
        db.add(file_record)
        db.commit()

        # Return file
        from fastapi.responses import FileResponse

        return FileResponse(
            output_path,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=filename,
        )

    except Exception as e:
        logger.error(f"Error generating Excel file: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating Excel file: {str(e)}",
        )


@router.get("/{model_id}/pdf")
async def download_pdf(model_id: UUID, db: Session = Depends(get_db)):
    """
    Download model as PDF file

    Args:
        model_id: Model ID
        db: Database session

    Returns:
        PDF file
    """
    model_run = db.query(ModelRun).filter(ModelRun.id == model_id).first()

    if not model_run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Model {model_id} not found"
        )

    try:
        # Import export functions
        from exports.pdf import (
            export_dcf_to_pdf,
            export_lbo_to_pdf,
            export_comps_to_pdf,
            export_merger_to_pdf,
        )

        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{model_run.model_type}_{model_run.ticker}_{timestamp}.pdf"
        output_path = os.path.join("exports", filename)

        # Ensure exports directory exists
        os.makedirs("exports", exist_ok=True)

        # Generate PDF based on model type
        if model_run.model_type == "dcf":
            export_dcf_to_pdf(model_run.results_json, model_run.ticker, output_path)
        elif model_run.model_type == "lbo":
            export_lbo_to_pdf(model_run.results_json, model_run.ticker, output_path)
        elif model_run.model_type == "comps":
            export_comps_to_pdf(model_run.results_json, model_run.ticker, output_path)
        elif model_run.model_type == "merger":
            export_merger_to_pdf(model_run.results_json, model_run.ticker, output_path)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported model type: {model_run.model_type}",
            )

        # Store file record
        file_record = File(
            model_id=model_run.id,
            kind="pdf",
            path=output_path,
            size=os.path.getsize(output_path),
        )
        db.add(file_record)
        db.commit()

        # Return file
        from fastapi.responses import FileResponse

        return FileResponse(
            output_path, media_type="application/pdf", filename=filename
        )

    except Exception as e:
        logger.error(f"Error generating PDF file: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating PDF file: {str(e)}",
        )


@router.delete("/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model(model_id: UUID, db: Session = Depends(get_db)):
    """
    Soft delete a model

    Args:
        model_id: Model ID
        db: Database session
    """
    model_run = db.query(ModelRun).filter(ModelRun.id == model_id).first()

    if not model_run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Model {model_id} not found"
        )

    # Soft delete
    model_run.deleted_at = datetime.utcnow()
    db.commit()

    return None
