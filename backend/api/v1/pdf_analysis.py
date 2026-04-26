"""
PDF Financial Analysis Endpoint

POST /api/v1/pdf/analyze
  - Accepts a PDF file upload + plain-English goal
  - Extracts financial data using Claude
  - Runs the appropriate model (DCF, LBO, etc.)
  - Returns structured results

POST /api/v1/pdf/extract
  - Accepts a PDF file upload + plain-English goal
  - Returns only the extracted financial data (no model run)
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from backend.agents.financial_task_agent import run_financial_task
from backend.agents.pdf_extraction_agent import extract_financials_from_pdf

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/pdf", tags=["PDF Analysis"])

_MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


def _validate_upload(file: UploadFile) -> None:
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        # Be lenient — some clients don't set the right MIME type
        if not (file.filename or "").lower().endswith(".pdf"):
            raise HTTPException(
                status_code=415,
                detail="Only PDF files are supported. Please upload a .pdf file.",
            )


@router.post("/analyze")
async def analyze_pdf(
    file: UploadFile = File(..., description="PDF file (earnings call, 10-K, 10-Q, presentation)"),
    goal: str = Form(
        ...,
        description=(
            "What you want to do with this document. "
            "Examples: 'Build a DCF model', 'Create an LBO analysis', "
            "'Summarize the financials', 'What is the revenue growth outlook?'"
        ),
    ),
) -> JSONResponse:
    """
    Upload a financial PDF and specify a goal.

    The agent will:
    1. Extract all relevant financial data from the document.
    2. Determine which financial model to run based on your goal.
    3. Build and return the model (DCF, LBO, or general summary).

    Returns a JSON object with:
    - **model_type**: Which model was run
    - **company_info**: Name, ticker, period
    - **extracted_financials**: All data pulled from the PDF
    - **model_results**: Full model output (projections, valuation, etc.)
    - **assumptions_used**: What assumptions were applied
    - **extraction_notes**: Data quality notes
    - **warnings**: Any issues or caveats
    """
    _validate_upload(file)

    pdf_bytes = await file.read()
    if len(pdf_bytes) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 20 MB.")
    if len(pdf_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    logger.info(
        "PDF analysis request: filename=%s size=%d bytes goal=%r",
        file.filename,
        len(pdf_bytes),
        goal,
    )

    try:
        extracted = extract_financials_from_pdf(pdf_bytes=pdf_bytes, goal=goal)
    except EnvironmentError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error("PDF extraction failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"PDF extraction failed: {e}")

    try:
        result = run_financial_task(extracted=extracted, goal=goal)
    except EnvironmentError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error("Financial task failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Financial model failed: {e}")

    return JSONResponse(content=result)


@router.post("/extract")
async def extract_pdf(
    file: UploadFile = File(..., description="PDF file to extract financial data from"),
    goal: str = Form(
        default="Extract all financial data",
        description="Optional hint about what to focus on during extraction",
    ),
) -> JSONResponse:
    """
    Upload a PDF and receive only the structured extracted financial data,
    without running a model. Useful for reviewing what was found before modeling.
    """
    _validate_upload(file)

    pdf_bytes = await file.read()
    if len(pdf_bytes) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 20 MB.")
    if len(pdf_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        extracted = extract_financials_from_pdf(pdf_bytes=pdf_bytes, goal=goal)
    except EnvironmentError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error("PDF extraction failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"PDF extraction failed: {e}")

    return JSONResponse(content=extracted.model_dump(exclude={"raw_text"}))
