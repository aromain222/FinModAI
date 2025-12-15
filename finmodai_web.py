#!/usr/bin/env python3
"""
FINMODAI Web Interface

Beautiful, modern web UI for FINMODAI financial analysis.
Provides interactive query interface and report visualization.
"""

import os
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from flask import Flask, render_template, request, jsonify, send_file, redirect, url_for
from werkzeug.utils import secure_filename

# Import FINMODAI engine
from finmodai_engine import FINMODAIEngine, quick_analysis

# Import existing data providers if available
try:
    from api.providers import ProviderManager
    PROVIDERS_AVAILABLE = True
except ImportError:
    PROVIDERS_AVAILABLE = False

# Create Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.urandom(24)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max

# Initialize FINMODAI
finmodai_engine: Optional[FINMODAIEngine] = None
provider_manager: Optional[any] = None


def init_finmodai():
    """Initialize FINMODAI engine"""
    global finmodai_engine, provider_manager
    
    if PROVIDERS_AVAILABLE:
        try:
            provider_manager = ProviderManager()
            print("✅ Data providers initialized")
        except Exception as e:
            print(f"⚠️ Failed to initialize providers: {e}")
            provider_manager = None
    
    finmodai_engine = FINMODAIEngine(data_provider=provider_manager)
    print("✅ FINMODAI Engine initialized")
    
    # Create reports directory
    Path("finmodai_reports").mkdir(exist_ok=True)
    Path("templates").mkdir(exist_ok=True)


# Create HTML template
def create_html_template():
    """Create the main HTML template"""
    template_path = Path("templates/finmodai_index.html")
    
    html_content = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FINMODAI - Elite Financial Analysis</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        
        .header {
            text-align: center;
            color: white;
            margin-bottom: 40px;
            padding: 40px 20px;
        }
        
        .header h1 {
            font-size: 3em;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        
        .header p {
            font-size: 1.3em;
            opacity: 0.95;
        }
        
        .main-card {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            padding: 40px;
            margin-bottom: 30px;
        }
        
        .query-section {
            margin-bottom: 30px;
        }
        
        .query-section label {
            display: block;
            font-weight: 600;
            margin-bottom: 10px;
            color: #333;
            font-size: 1.1em;
        }
        
        .query-input {
            width: 100%;
            padding: 15px;
            font-size: 1.05em;
            border: 2px solid #e0e0e0;
            border-radius: 10px;
            transition: border-color 0.3s;
            font-family: inherit;
        }
        
        .query-input:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .input-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
        }
        
        .btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 15px 40px;
            font-size: 1.1em;
            font-weight: 600;
            border-radius: 10px;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            width: 100%;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(102, 126, 234, 0.4);
        }
        
        .btn:active {
            transform: translateY(0);
        }
        
        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        
        .loading {
            display: none;
            text-align: center;
            padding: 40px;
        }
        
        .loading.active {
            display: block;
        }
        
        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .results {
            display: none;
        }
        
        .results.active {
            display: block;
        }
        
        .phase {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 25px;
            margin-bottom: 25px;
            border-left: 5px solid #667eea;
        }
        
        .phase h2 {
            color: #667eea;
            margin-bottom: 15px;
            font-size: 1.5em;
        }
        
        .phase-content {
            color: #333;
            line-height: 1.8;
            white-space: pre-wrap;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        th {
            background: #667eea;
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: 600;
        }
        
        td {
            padding: 12px;
            border-bottom: 1px solid #e0e0e0;
        }
        
        tr:hover {
            background: #f5f5f5;
        }
        
        .assumption {
            background: white;
            padding: 15px;
            margin: 10px 0;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        
        .assumption-name {
            font-weight: 600;
            color: #667eea;
            margin-bottom: 5px;
        }
        
        .assumption-value {
            font-size: 1.1em;
            color: #333;
            margin-bottom: 5px;
        }
        
        .assumption-justification {
            color: #666;
            font-size: 0.95em;
        }
        
        .sources {
            list-style: none;
            counter-reset: source-counter;
        }
        
        .sources li {
            counter-increment: source-counter;
            padding: 10px 0;
            padding-left: 30px;
            position: relative;
        }
        
        .sources li:before {
            content: counter(source-counter);
            position: absolute;
            left: 0;
            background: #667eea;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.85em;
            font-weight: 600;
        }
        
        .download-section {
            display: flex;
            gap: 15px;
            margin-top: 25px;
            flex-wrap: wrap;
        }
        
        .download-btn {
            flex: 1;
            min-width: 150px;
            background: white;
            color: #667eea;
            border: 2px solid #667eea;
            padding: 12px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s;
            text-align: center;
            text-decoration: none;
            display: inline-block;
        }
        
        .download-btn:hover {
            background: #667eea;
            color: white;
        }
        
        .examples {
            margin-top: 20px;
        }
        
        .example-category {
            margin-bottom: 20px;
        }
        
        .example-category h3 {
            color: #667eea;
            margin-bottom: 10px;
        }
        
        .example-query {
            background: #f8f9fa;
            padding: 10px 15px;
            margin: 5px 0;
            border-radius: 8px;
            cursor: pointer;
            transition: background 0.2s;
        }
        
        .example-query:hover {
            background: #e9ecef;
        }
        
        .metadata {
            background: #f0f8ff;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }
        
        .metadata-item {
            display: flex;
            flex-direction: column;
        }
        
        .metadata-label {
            font-size: 0.85em;
            color: #666;
            margin-bottom: 5px;
        }
        
        .metadata-value {
            font-weight: 600;
            color: #333;
        }
        
        @media (max-width: 768px) {
            .header h1 { font-size: 2em; }
            .input-row { grid-template-columns: 1fr; }
            .download-section { flex-direction: column; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 FINMODAI</h1>
            <p>Elite Private-Equity-Grade Financial Analysis</p>
        </div>
        
        <div class="main-card">
            <div class="query-section">
                <label for="query">Financial Question</label>
                <textarea 
                    id="query" 
                    class="query-input" 
                    rows="3" 
                    placeholder="Ask any financial question... (e.g., 'What is the DCF valuation of Apple?')"
                ></textarea>
            </div>
            
            <div class="input-row">
                <div>
                    <label for="ticker">Ticker Symbol (Optional)</label>
                    <input 
                        type="text" 
                        id="ticker" 
                        class="query-input" 
                        placeholder="e.g., AAPL"
                    >
                </div>
                <div>
                    <label for="company">Company Name (Optional)</label>
                    <input 
                        type="text" 
                        id="company" 
                        class="query-input" 
                        placeholder="e.g., Apple Inc"
                    >
                </div>
            </div>
            
            <button class="btn" onclick="analyzeQuery()">Generate Analysis</button>
        </div>
        
        <div class="loading" id="loading">
            <div class="spinner"></div>
            <h3>Generating Elite Financial Analysis...</h3>
            <p>This may take a few moments</p>
        </div>
        
        <div class="results" id="results">
            <!-- Results will be inserted here -->
        </div>
        
        <div class="main-card examples">
            <h2 style="color: #667eea; margin-bottom: 20px;">💡 Example Queries</h2>
            
            <div class="example-category">
                <h3>📊 Valuation</h3>
                <div class="example-query" onclick="useExample('What is the DCF valuation of Apple Inc?', 'AAPL', 'Apple Inc')">
                    What is the DCF valuation of Apple Inc?
                </div>
                <div class="example-query" onclick="useExample('Provide a sum-of-the-parts valuation for Alphabet', 'GOOGL', 'Alphabet Inc')">
                    Provide a sum-of-the-parts valuation for Alphabet
                </div>
            </div>
            
            <div class="example-category">
                <h3>📈 Forecasting</h3>
                <div class="example-query" onclick="useExample('Provide a 5-year revenue forecast for Microsoft with base, bull, and bear cases', 'MSFT', 'Microsoft')">
                    Provide a 5-year revenue forecast for Microsoft with base, bull, and bear cases
                </div>
                <div class="example-query" onclick="useExample('Forecast Tesla revenue growth through 2028', 'TSLA', 'Tesla Inc')">
                    Forecast Tesla revenue growth through 2028
                </div>
            </div>
            
            <div class="example-category">
                <h3>🔍 Comparison</h3>
                <div class="example-query" onclick="useExample('Compare Apple vs Microsoft valuation multiples and operating metrics', 'AAPL', 'Apple Inc')">
                    Compare Apple vs Microsoft valuation multiples
                </div>
            </div>
            
            <div class="example-category">
                <h3>⚠️ Risk Assessment</h3>
                <div class="example-query" onclick="useExample('What are the key risks of investing in Nvidia?', 'NVDA', 'Nvidia')">
                    What are the key risks of investing in Nvidia?
                </div>
            </div>
            
            <div class="example-category">
                <h3>🤝 M&A Analysis</h3>
                <div class="example-query" onclick="useExample('Analyze the M&A potential of Salesforce as an acquisition target', 'CRM', 'Salesforce')">
                    Analyze the M&A potential of Salesforce
                </div>
            </div>
        </div>
    </div>
    
    <script>
        let currentReportData = null;
        
        function useExample(query, ticker, company) {
            document.getElementById('query').value = query;
            document.getElementById('ticker').value = ticker || '';
            document.getElementById('company').value = company || '';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        
        async function analyzeQuery() {
            const query = document.getElementById('query').value.trim();
            const ticker = document.getElementById('ticker').value.trim();
            const company = document.getElementById('company').value.trim();
            
            if (!query || query.length < 10) {
                alert('Please enter a financial question (at least 10 characters)');
                return;
            }
            
            // Show loading
            document.getElementById('loading').classList.add('active');
            document.getElementById('results').classList.remove('active');
            document.querySelector('.btn').disabled = true;
            
            try {
                const response = await fetch('/api/analyze', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ query, ticker, company })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    currentReportData = data;
                    displayResults(data);
                } else {
                    alert('Analysis failed: ' + (data.error || 'Unknown error'));
                }
            } catch (error) {
                alert('Error: ' + error.message);
            } finally {
                document.getElementById('loading').classList.remove('active');
                document.querySelector('.btn').disabled = false;
            }
        }
        
        function displayResults(data) {
            const report = data.report;
            const resultsDiv = document.getElementById('results');
            
            let html = '<div class="main-card">';
            
            // Metadata
            html += '<div class="metadata">';
            html += '<div class="metadata-item"><div class="metadata-label">Query Type</div><div class="metadata-value">' + report.query_type.toUpperCase() + '</div></div>';
            html += '<div class="metadata-item"><div class="metadata-label">Confidence Level</div><div class="metadata-value">' + report.confidence_level + '</div></div>';
            html += '<div class="metadata-item"><div class="metadata-label">Processing Time</div><div class="metadata-value">' + data.processing_time_seconds.toFixed(2) + 's</div></div>';
            html += '<div class="metadata-item"><div class="metadata-label">Generated</div><div class="metadata-value">' + new Date(report.generated_at).toLocaleString() + '</div></div>';
            html += '</div>';
            
            // PHASE 1: Narrative
            html += '<div class="phase">';
            html += '<h2>PHASE 1 — NARRATIVE ANALYSIS</h2>';
            html += '<div class="phase-content">' + escapeHtml(report.narrative) + '</div>';
            html += '</div>';
            
            // PHASE 2: Quantitative
            html += '<div class="phase">';
            html += '<h2>PHASE 2 — QUANTITATIVE OUTPUT</h2>';
            
            for (const table of report.quantitative_tables) {
                html += '<h3>' + table.title + '</h3>';
                html += '<table>';
                
                // Headers
                html += '<tr>';
                for (const col of table.columns) {
                    html += '<th>' + col + '</th>';
                }
                html += '</tr>';
                
                // Data
                for (const row of table.data) {
                    html += '<tr>';
                    for (const col of table.columns) {
                        html += '<td>' + (row[col] || '') + '</td>';
                    }
                    html += '</tr>';
                }
                
                html += '</table>';
                
                if (table.notes) {
                    html += '<p style="color: #666; font-style: italic; margin-top: 10px;">' + table.notes + '</p>';
                }
            }
            
            html += '</div>';
            
            // PHASE 3: Assumptions
            html += '<div class="phase">';
            html += '<h2>PHASE 3 — ASSUMPTIONS</h2>';
            
            for (const assumption of report.assumptions) {
                html += '<div class="assumption">';
                html += '<div class="assumption-name">' + assumption.name + '</div>';
                html += '<div class="assumption-value">' + assumption.value + ' ' + assumption.unit + '</div>';
                html += '<div class="assumption-justification">Justification: ' + assumption.justification + '</div>';
                if (assumption.source) {
                    html += '<div class="assumption-justification">Source: ' + assumption.source + '</div>';
                }
                html += '</div>';
            }
            
            html += '</div>';
            
            // PHASE 4: Sources
            html += '<div class="phase">';
            html += '<h2>PHASE 4 — SOURCES & NOTES</h2>';
            html += '<ul class="sources">';
            
            for (const source of report.sources) {
                html += '<li>' + source + '</li>';
            }
            
            html += '</ul>';
            html += '</div>';
            
            // Download buttons
            html += '<div class="download-section">';
            html += '<a href="/api/download/' + data.report_id + '/markdown" class="download-btn">📄 Download Markdown</a>';
            html += '<a href="/api/download/' + data.report_id + '/html" class="download-btn">🌐 Download HTML</a>';
            html += '<a href="/api/download/' + data.report_id + '/json" class="download-btn">📊 Download JSON</a>';
            html += '</div>';
            
            html += '</div>';
            
            resultsDiv.innerHTML = html;
            resultsDiv.classList.add('active');
            
            // Scroll to results
            resultsDiv.scrollIntoView({ behavior: 'smooth' });
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // Allow Enter key to submit (with Shift+Enter for new line)
        document.getElementById('query').addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                analyzeQuery();
            }
        });
    </script>
</body>
</html>"""
    
    template_path.write_text(html_content)
    print(f"✅ Created HTML template: {template_path}")


@app.route('/')
def index():
    """Main page"""
    return render_template('finmodai_index.html')


@app.route('/api/analyze', methods=['POST'])
def api_analyze():
    """API endpoint for analysis"""
    if not finmodai_engine:
        return jsonify({"success": False, "error": "Engine not initialized"}), 503
    
    try:
        data = request.get_json()
        query = data.get('query', '').strip()
        ticker = data.get('ticker', '').strip() or None
        company = data.get('company', '').strip() or None
        
        if not query or len(query) < 10:
            return jsonify({"success": False, "error": "Query must be at least 10 characters"}), 400
        
        # Build context
        context = {}
        if ticker:
            context['ticker'] = ticker
        if company:
            context['company_name'] = company
        
        # Generate report
        start_time = datetime.now()
        report = finmodai_engine.analyze(query, context if context else None)
        processing_time = (datetime.now() - start_time).total_seconds()
        
        # Save report
        saved_files = finmodai_engine.save_report(report, output_dir="finmodai_reports")
        
        # Extract report ID from saved files
        report_id = None
        if saved_files.get('json'):
            report_id = Path(saved_files['json']).stem
        
        return jsonify({
            "success": True,
            "report": report.to_dict(),
            "report_id": report_id,
            "processing_time_seconds": processing_time
        })
    
    except Exception as e:
        print(f"❌ Analysis error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/download/<report_id>/<format>')
def api_download(report_id, format):
    """Download report in specified format"""
    try:
        if format == 'markdown':
            file_path = Path("finmodai_reports") / f"{report_id}.md"
            mimetype = 'text/markdown'
        elif format == 'html':
            file_path = Path("finmodai_reports") / f"{report_id}.html"
            mimetype = 'text/html'
        elif format == 'json':
            file_path = Path("finmodai_reports") / f"{report_id}.json"
            mimetype = 'application/json'
        else:
            return jsonify({"error": "Invalid format"}), 400
        
        if not file_path.exists():
            return jsonify({"error": "Report not found"}), 404
        
        return send_file(
            str(file_path),
            mimetype=mimetype,
            as_attachment=True,
            download_name=file_path.name
        )
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/health')
def health():
    """Health check"""
    return jsonify({
        "status": "healthy",
        "engine_initialized": finmodai_engine is not None,
        "providers_available": PROVIDERS_AVAILABLE,
        "timestamp": datetime.now().isoformat()
    })


if __name__ == "__main__":
    print("🚀 Starting FINMODAI Web Interface...")
    
    # Initialize
    init_finmodai()
    create_html_template()
    
    port = int(os.getenv("PORT", 5001))
    
    print(f"📍 Server starting at: http://localhost:{port}")
    print(f"🏠 Open your browser to: http://localhost:{port}")
    
    app.run(
        host="0.0.0.0",
        port=port,
        debug=True
    )

