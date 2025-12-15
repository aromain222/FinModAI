#!/usr/bin/env python3
"""
FINMODAI API - FastAPI Integration

Provides REST API endpoints for FINMODAI financial analysis engine.
Integrates with existing data providers and infrastructure.
"""

import os
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Import FINMODAI engine
from finmodai_engine import FINMODAIEngine, FINMODAIReport, QueryType, quick_analysis

# Import existing data providers
try:
    from api.providers import ProviderManager
    PROVIDERS_AVAILABLE = True
except ImportError:
    PROVIDERS_AVAILABLE = False
    logging.warning("ProviderManager not available, using estimates only")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('FINMODAI_API')

# Create FastAPI app
app = FastAPI(
    title="FINMODAI API",
    description="Elite Private-Equity-Grade Financial Analysis API - Always generates 4-phase structured reports",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global instances
finmodai_engine: Optional[FINMODAIEngine] = None
provider_manager: Optional[Any] = None


# Pydantic models for API
class AnalysisRequest(BaseModel):
    """Request model for financial analysis"""
    query: str = Field(..., description="Financial question or analysis request", min_length=10)
    ticker: Optional[str] = Field(None, description="Company ticker symbol (optional)")
    company_name: Optional[str] = Field(None, description="Company name (optional)")
    context: Optional[Dict[str, Any]] = Field(None, description="Additional context data")
    
    class Config:
        schema_extra = {
            "example": {
                "query": "What is the DCF valuation of Apple Inc?",
                "ticker": "AAPL",
                "company_name": "Apple Inc"
            }
        }


class AnalysisResponse(BaseModel):
    """Response model for financial analysis"""
    success: bool
    query: str
    query_type: str
    report: Dict[str, Any]
    generated_at: str
    processing_time_seconds: float
    
    class Config:
        schema_extra = {
            "example": {
                "success": True,
                "query": "What is the DCF valuation of Apple Inc?",
                "query_type": "valuation",
                "report": {
                    "narrative": "Apple Inc presents a compelling valuation...",
                    "quantitative_tables": [],
                    "assumptions": [],
                    "sources": []
                },
                "generated_at": "2024-01-01T12:00:00",
                "processing_time_seconds": 1.5
            }
        }


@app.on_event("startup")
async def startup_event():
    """Initialize FINMODAI engine and data providers on startup"""
    global finmodai_engine, provider_manager
    
    logger.info("🚀 Starting FINMODAI API...")
    
    # Initialize data provider if available
    if PROVIDERS_AVAILABLE:
        try:
            provider_manager = ProviderManager()
            logger.info("✅ Data providers initialized")
        except Exception as e:
            logger.warning(f"⚠️ Failed to initialize providers: {e}")
            provider_manager = None
    
    # Initialize FINMODAI engine
    finmodai_engine = FINMODAIEngine(data_provider=provider_manager)
    logger.info("✅ FINMODAI Engine initialized")
    
    # Create reports directory
    Path("finmodai_reports").mkdir(exist_ok=True)


@app.get("/", response_class=HTMLResponse)
async def root():
    """Root endpoint with API documentation"""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>FINMODAI API</title>
        <style>
            body { font-family: 'Segoe UI', sans-serif; max-width: 1000px; margin: 40px auto; padding: 20px; line-height: 1.6; }
            h1 { color: #0066cc; border-bottom: 3px solid #0066cc; padding-bottom: 10px; }
            h2 { color: #333; margin-top: 30px; }
            .endpoint { background: #f5f5f5; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #0066cc; }
            .method { display: inline-block; padding: 4px 8px; border-radius: 3px; font-weight: bold; margin-right: 10px; }
            .get { background: #61affe; color: white; }
            .post { background: #49cc90; color: white; }
            code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
            .example { background: #fff3cd; padding: 10px; border-radius: 5px; margin: 10px 0; }
        </style>
    </head>
    <body>
        <h1>🚀 FINMODAI API</h1>
        <p><strong>Elite Private-Equity-Grade Financial Analysis</strong></p>
        <p>This API ALWAYS generates structured 4-phase financial analysis:</p>
        <ol>
            <li><strong>NARRATIVE ANALYSIS</strong> - Clear, polished, sell-side equity research style</li>
            <li><strong>QUANTITATIVE OUTPUT</strong> - Tables with real numbers (DCF, multiples, forecasts)</li>
            <li><strong>ASSUMPTIONS</strong> - All core assumptions listed clearly</li>
            <li><strong>SOURCES</strong> - Citations and data sources</li>
        </ol>
        
        <h2>📚 API Endpoints</h2>
        
        <div class="endpoint">
            <span class="method post">POST</span>
            <code>/analyze</code>
            <p>Generate comprehensive financial analysis report</p>
            <div class="example">
                <strong>Example Request:</strong>
                <pre>{
  "query": "What is the DCF valuation of Apple?",
  "ticker": "AAPL"
}</pre>
            </div>
        </div>
        
        <div class="endpoint">
            <span class="method get">GET</span>
            <code>/quick-analyze</code>
            <p>Quick analysis with query parameters</p>
            <div class="example">
                <strong>Example:</strong> <code>/quick-analyze?query=DCF+valuation+of+Tesla&ticker=TSLA</code>
            </div>
        </div>
        
        <div class="endpoint">
            <span class="method get">GET</span>
            <code>/report/{report_id}/markdown</code>
            <p>Download report in Markdown format</p>
        </div>
        
        <div class="endpoint">
            <span class="method get">GET</span>
            <code>/report/{report_id}/html</code>
            <p>Download report in HTML format</p>
        </div>
        
        <div class="endpoint">
            <span class="method get">GET</span>
            <code>/health</code>
            <p>Health check endpoint</p>
        </div>
        
        <h2>📖 Interactive Documentation</h2>
        <p>
            <a href="/docs" style="color: #0066cc; text-decoration: none; font-weight: bold;">→ Swagger UI Documentation</a><br>
            <a href="/redoc" style="color: #0066cc; text-decoration: none; font-weight: bold;">→ ReDoc Documentation</a>
        </p>
        
        <h2>💡 Example Queries</h2>
        <ul>
            <li>"What is the DCF valuation of Microsoft?"</li>
            <li>"Provide a 5-year forecast for Tesla with bull and bear cases"</li>
            <li>"Compare Apple vs Microsoft valuation multiples"</li>
            <li>"What are the risks of investing in Netflix?"</li>
            <li>"Analyze the M&A potential of Salesforce"</li>
            <li>"What is the market outlook for semiconductor companies?"</li>
        </ul>
        
        <hr style="margin: 40px 0;">
        <p style="color: #666; font-size: 0.9em;">
            FINMODAI API v1.0.0 | Powered by FINMODAI Engine
        </p>
    </body>
    </html>
    """
    return HTMLResponse(content=html)


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "FINMODAI API",
        "version": "1.0.0",
        "engine_initialized": finmodai_engine is not None,
        "providers_available": PROVIDERS_AVAILABLE,
        "timestamp": datetime.now().isoformat()
    }


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze(request: AnalysisRequest):
    """
    Generate comprehensive financial analysis report
    
    This endpoint ALWAYS returns a complete 4-phase FINMODAI report:
    1. Narrative Analysis
    2. Quantitative Output (tables with numbers)
    3. Assumptions
    4. Sources
    """
    if not finmodai_engine:
        raise HTTPException(status_code=503, detail="FINMODAI engine not initialized")
    
    start_time = datetime.now()
    
    try:
        logger.info(f"📊 Processing analysis request: {request.query}")
        
        # Build context
        context = request.context or {}
        if request.ticker:
            context['ticker'] = request.ticker
        if request.company_name:
            context['company_name'] = request.company_name
        
        # Generate report
        report = finmodai_engine.analyze(request.query, context)
        
        # Save report
        saved_files = finmodai_engine.save_report(report, output_dir="finmodai_reports")
        
        processing_time = (datetime.now() - start_time).total_seconds()
        
        logger.info(f"✅ Analysis completed in {processing_time:.2f}s")
        
        return AnalysisResponse(
            success=True,
            query=request.query,
            query_type=report.query_type.value,
            report=report.to_dict(),
            generated_at=report.generated_at.isoformat(),
            processing_time_seconds=processing_time
        )
    
    except Exception as e:
        logger.error(f"❌ Analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get("/quick-analyze")
async def quick_analyze_get(
    query: str = Query(..., description="Financial question", min_length=10),
    ticker: Optional[str] = Query(None, description="Company ticker"),
    format: str = Query("json", description="Response format: json, markdown, html")
):
    """
    Quick analysis endpoint using query parameters
    
    Example: /quick-analyze?query=DCF+valuation+of+Apple&ticker=AAPL&format=markdown
    """
    if not finmodai_engine:
        raise HTTPException(status_code=503, detail="FINMODAI engine not initialized")
    
    try:
        context = {"ticker": ticker} if ticker else None
        report = finmodai_engine.analyze(query, context)
        
        if format == "markdown":
            return HTMLResponse(content=f"<pre>{report.to_markdown()}</pre>")
        elif format == "html":
            return HTMLResponse(content=report.to_html())
        else:
            return JSONResponse(content=report.to_dict())
    
    except Exception as e:
        logger.error(f"❌ Quick analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get("/reports")
async def list_reports():
    """List all generated reports"""
    reports_dir = Path("finmodai_reports")
    
    if not reports_dir.exists():
        return {"reports": []}
    
    reports = []
    for file_path in reports_dir.glob("*.json"):
        try:
            import json
            with open(file_path) as f:
                data = json.load(f)
                reports.append({
                    "filename": file_path.name,
                    "query": data.get("query", "Unknown"),
                    "generated_at": data.get("generated_at", "Unknown"),
                    "query_type": data.get("query_type", "Unknown")
                })
        except Exception as e:
            logger.warning(f"Failed to read report {file_path}: {e}")
    
    # Sort by generated_at descending
    reports.sort(key=lambda x: x.get("generated_at", ""), reverse=True)
    
    return {"reports": reports, "count": len(reports)}


@app.get("/report/{filename}/markdown")
async def get_report_markdown(filename: str):
    """Download report in Markdown format"""
    file_path = Path("finmodai_reports") / filename.replace(".json", ".md")
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    
    return FileResponse(
        path=str(file_path),
        media_type="text/markdown",
        filename=file_path.name
    )


@app.get("/report/{filename}/html")
async def get_report_html(filename: str):
    """Download report in HTML format"""
    file_path = Path("finmodai_reports") / filename.replace(".json", ".html")
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    
    return FileResponse(
        path=str(file_path),
        media_type="text/html",
        filename=file_path.name
    )


@app.get("/report/{filename}/json")
async def get_report_json(filename: str):
    """Download report in JSON format"""
    if not filename.endswith(".json"):
        filename = filename + ".json"
    
    file_path = Path("finmodai_reports") / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    
    return FileResponse(
        path=str(file_path),
        media_type="application/json",
        filename=file_path.name
    )


@app.get("/examples")
async def get_examples():
    """Get example queries for different analysis types"""
    return {
        "examples": [
            {
                "category": "Valuation",
                "queries": [
                    "What is the DCF valuation of Apple Inc?",
                    "Provide a sum-of-the-parts valuation for Alphabet",
                    "What is the intrinsic value of Tesla using multiple valuation methods?"
                ]
            },
            {
                "category": "Forecasting",
                "queries": [
                    "Provide a 5-year revenue forecast for Microsoft with base, bull, and bear cases",
                    "What is the projected EBITDA margin evolution for Amazon over the next 3 years?",
                    "Forecast Netflix subscriber growth and revenue through 2028"
                ]
            },
            {
                "category": "Comparison",
                "queries": [
                    "Compare Apple vs Microsoft valuation multiples and operating metrics",
                    "How does Tesla's growth rate compare to traditional automakers?",
                    "Benchmark Meta's profitability against social media peers"
                ]
            },
            {
                "category": "Risk Assessment",
                "queries": [
                    "What are the key risks of investing in Nvidia?",
                    "Analyze downside scenarios for Boeing stock",
                    "Evaluate the financial risk profile of a leveraged software company"
                ]
            },
            {
                "category": "M&A",
                "queries": [
                    "Analyze the M&A potential of Salesforce as an acquisition target",
                    "What would be a fair acquisition price for Twitter?",
                    "Quantify potential synergies from a Microsoft-Activision merger"
                ]
            },
            {
                "category": "Market Analysis",
                "queries": [
                    "What is the outlook for semiconductor industry valuations?",
                    "Analyze competitive dynamics in cloud computing market",
                    "Evaluate growth drivers for electric vehicle sector"
                ]
            },
            {
                "category": "Strategy",
                "queries": [
                    "What strategic initiatives should Intel pursue to improve margins?",
                    "Recommend capital allocation strategy for a mature tech company",
                    "Evaluate growth vs profitability tradeoffs for a SaaS company"
                ]
            }
        ]
    }


@app.post("/batch-analyze")
async def batch_analyze(requests: List[AnalysisRequest]):
    """
    Batch analysis endpoint - process multiple queries at once
    
    Useful for generating multiple reports in parallel
    """
    if not finmodai_engine:
        raise HTTPException(status_code=503, detail="FINMODAI engine not initialized")
    
    if len(requests) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 requests per batch")
    
    results = []
    
    for i, request in enumerate(requests, 1):
        logger.info(f"📊 Processing batch request {i}/{len(requests)}: {request.query}")
        
        try:
            context = request.context or {}
            if request.ticker:
                context['ticker'] = request.ticker
            if request.company_name:
                context['company_name'] = request.company_name
            
            report = finmodai_engine.analyze(request.query, context)
            finmodai_engine.save_report(report, output_dir="finmodai_reports")
            
            results.append({
                "success": True,
                "query": request.query,
                "report": report.to_dict()
            })
        
        except Exception as e:
            logger.error(f"❌ Batch request {i} failed: {e}")
            results.append({
                "success": False,
                "query": request.query,
                "error": str(e)
            })
    
    successful = sum(1 for r in results if r.get("success"))
    
    return {
        "total": len(requests),
        "successful": successful,
        "failed": len(requests) - successful,
        "results": results
    }


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", 8001))
    
    print("🚀 Starting FINMODAI API Server...")
    print(f"📍 Server will be available at: http://localhost:{port}")
    print(f"📖 API Documentation: http://localhost:{port}/docs")
    print(f"🏠 Home Page: http://localhost:{port}")
    
    uvicorn.run(
        "finmodai_api:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )

