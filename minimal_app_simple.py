#!/usr/bin/env python3
"""
Ultra-minimal Flask app for deployment testing - NO external dependencies
"""
import json
import uuid
from datetime import datetime, timedelta
from flask import Flask, request, redirect, url_for, flash, jsonify

# Create Flask app
app = Flask(__name__)
app.secret_key = 'finmodai_secret_key_2024'

# Simple storage for models
MODEL_STORAGE = {}

# Routes
@app.route('/')
def index():
    return '''
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>FinModAI - Financial Models</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-100 min-h-screen">
        <div class="container mx-auto px-4 py-8">
            <div class="max-w-4xl mx-auto">
                <div class="bg-white rounded-xl shadow-sm p-8 text-center">
                    <h1 class="text-3xl font-bold text-gray-900 mb-6">Investment Banking Financial Models</h1>
                    <p class="text-lg text-gray-600 mb-8">Generate professional financial models with AI-powered insights.</p>
                    
                    <div class="space-y-4">
                        <a href="/generate-model">
                            <button class="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors">
                                Generate New Model
                            </button>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
    '''

@app.route('/generate-model', methods=['GET', 'POST'])
def generate_model():
    if request.method == 'POST':
        ticker = request.form.get('ticker', '').strip().upper()
        model_type = request.form.get('model_type', 'dcf').lower()
        climate = request.form.get('climate', 'base').lower()
        
        if not ticker:
            flash('Please enter a ticker symbol', 'error')
            return redirect(url_for('index'))
        
        try:
            # Generate model
            model_id = str(uuid.uuid4())
            MODEL_STORAGE[model_id] = {
                'ticker': ticker,
                'model_type': model_type,
                'climate': climate,
                'status': 'pending'
            }
            
            # Generate simple DCF model with default values
            result = {
                'ticker': ticker,
                'company_name': f"{ticker} Corporation",
                'enterprise_value': 2500000000,
                'equity_value': 2000000000,
                'implied_price': 25.00,
                'current_price': 20.00,
                'upside_downside': 25.0,
                'assumptions': {
                    'revenue_growth': [0.08, 0.07, 0.06, 0.05, 0.04],
                    'operating_margin': [0.25, 0.25, 0.25, 0.25, 0.25],
                    'wacc': 0.105,
                    'terminal_growth': 0.025,
                    'tax_rate': 0.21
                },
                'data_source': 'DEFAULT'
            }
            
            MODEL_STORAGE[model_id]['result'] = result
            
            # Redirect to results page
            return redirect(url_for('model_results', model_id=model_id))
            
        except Exception as e:
            flash(f'Error generating model: {str(e)}', 'error')
            return redirect(url_for('index'))
    
    return '''
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Generate Model - FinModAI</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-100 min-h-screen">
        <div class="container mx-auto px-4 py-8">
            <div class="max-w-2xl mx-auto">
                <div class="bg-white rounded-xl shadow-sm p-8">
                    <h1 class="text-2xl font-bold text-gray-900 mb-6">Generate Financial Model</h1>
                    
                    <form method="POST" class="space-y-6">
                        <div>
                            <label for="ticker" class="block text-sm font-medium text-gray-700 mb-2">Ticker Symbol</label>
                            <input type="text" id="ticker" name="ticker" required 
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                   placeholder="e.g., AAPL, MSFT, GOOGL">
                        </div>
                        
                        <div>
                            <label for="model_type" class="block text-sm font-medium text-gray-700 mb-2">Model Type</label>
                            <select id="model_type" name="model_type" 
                                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="dcf">DCF Valuation</option>
                                <option value="lbo">LBO Analysis</option>
                                <option value="ma">M&A Analysis</option>
                            </select>
                        </div>
                        
                        <div>
                            <label for="climate" class="block text-sm font-medium text-gray-700 mb-2">Market Climate</label>
                            <select id="climate" name="climate" 
                                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="base">Base Case</option>
                                <option value="bull">Bull Case</option>
                                <option value="bear">Bear Case</option>
                            </select>
                        </div>
                        
                        <button type="submit" 
                                class="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors">
                            Generate Model
                        </button>
                    </form>
                    
                    <div class="mt-6">
                        <a href="/" class="text-blue-600 hover:underline">← Back to Home</a>
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
    '''

@app.route('/model-results/<model_id>')
def model_results(model_id):
    model = MODEL_STORAGE.get(model_id)
    if not model:
        flash('Model not found', 'error')
        return redirect(url_for('index'))
    
    # Get model data
    ticker = model.get('ticker')
    model_type = model.get('model_type')
    climate = model.get('climate')
    result = model.get('result', {})
    
    # Format values for display
    enterprise_value = result.get('enterprise_value', 0)
    equity_value = result.get('equity_value', 0)
    implied_price = result.get('implied_price', 0)
    current_price = result.get('current_price', 0)
    upside_downside = result.get('upside_downside', 0)
    
    # Get assumptions for display
    assumptions = result.get('assumptions', {})
    revenue_growth = assumptions.get('revenue_growth', [0.08, 0.07, 0.06, 0.05, 0.04])
    operating_margin = assumptions.get('operating_margin', [0.25, 0.25, 0.25, 0.25, 0.25])
    wacc = assumptions.get('wacc', 0.105)
    terminal_growth = assumptions.get('terminal_growth', 0.025)
    tax_rate = assumptions.get('tax_rate', 0.21)
    
    # Format assumptions HTML
    assumptions_html = f"""
    <div class="space-y-6">
        <div class="bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
            <div class="text-lg font-bold text-blue-900">DCF Assumptions</div>
            <div class="text-sm text-blue-700">{ticker}</div>
        </div>
        
        <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div class="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h3 class="text-lg font-semibold text-gray-900">5-Year Forecast Assumptions</h3>
            </div>
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Metric</th>
                            <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Year 1</th>
                            <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Year 2</th>
                            <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Year 3</th>
                            <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Year 4</th>
                            <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Year 5</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        <tr class="hover:bg-gray-50">
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Revenue Growth</td>
                            <td class="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900 font-medium">{revenue_growth[0]:.1%}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">{revenue_growth[1]:.1%}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">{revenue_growth[2]:.1%}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">{revenue_growth[3]:.1%}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">{revenue_growth[4]:.1%}</td>
                        </tr>
                        <tr class="hover:bg-gray-50">
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Operating Margin</td>
                            <td class="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900 font-medium">{operating_margin[0]:.1%}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">{operating_margin[1]:.1%}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">{operating_margin[2]:.1%}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">{operating_margin[3]:.1%}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">{operating_margin[4]:.1%}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <div class="text-blue-700 font-medium text-sm">WACC</div>
                <div class="text-2xl font-bold text-blue-800">{wacc:.1%}</div>
            </div>
            
            <div class="bg-green-50 border border-green-200 p-4 rounded-lg">
                <div class="text-green-700 font-medium text-sm">Terminal Growth</div>
                <div class="text-2xl font-bold text-green-800">{terminal_growth:.1%}</div>
            </div>
            
            <div class="bg-purple-50 border border-purple-200 p-4 rounded-lg">
                <div class="text-purple-700 font-medium text-sm">Tax Rate</div>
                <div class="text-2xl font-bold text-purple-800">{tax_rate:.1%}</div>
            </div>
        </div>
    </div>
    """
    
    # Format valuation results HTML
    valuation_html = f"""
    <div class="space-y-3">
        <div class="bg-green-50 p-4 rounded-lg">
            <div class="text-green-700 font-medium">Enterprise Value</div>
            <div class="text-2xl font-bold text-green-800">${enterprise_value/1e9:.1f}B</div>
        </div>
        
        <div class="bg-green-50 p-4 rounded-lg">
            <div class="text-green-700 font-medium">Equity Value</div>
            <div class="text-2xl font-bold text-green-800">${equity_value/1e9:.1f}B</div>
        </div>
        
        <div class="bg-blue-50 p-4 rounded-lg">
            <div class="text-blue-700 font-medium">Implied Price</div>
            <div class="text-2xl font-bold text-blue-800">${implied_price:.2f}</div>
        </div>
        
        <div class="bg-blue-50 p-4 rounded-lg">
            <div class="text-blue-700 font-medium">Current Price</div>
            <div class="text-2xl font-bold text-blue-800">${current_price:.2f}</div>
        </div>
        
        <div class="p-4 rounded-lg {upside_downside > 0 and 'bg-green-50' or 'bg-red-50'}">
            <div class="font-medium {upside_downside > 0 and 'text-green-700' or 'text-red-700'}">Upside/Downside</div>
            <div class="text-2xl font-bold {upside_downside > 0 and 'text-green-800' or 'text-red-800'}">{upside_downside:.1f}%</div>
        </div>
    </div>
    """
    
    # Format download section HTML
    download_section_html = """
    <div class="space-y-4">
        <button onclick="window.print()" class="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors">
            Print Results
        </button>
        
        <div class="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
            <div class="text-yellow-800 font-medium">Excel Download</div>
            <div class="text-sm text-yellow-700">Excel download not available in this simplified version</div>
        </div>
    </div>
    """
    
    return f'''
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Model Results - {ticker} - FinModAI</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-100 min-h-screen">
        <div class="container mx-auto px-4 py-8">
            <div class="max-w-6xl mx-auto">
                <div class="bg-white rounded-xl shadow-sm p-8">
                    <h1 class="text-3xl font-bold text-gray-900 mb-6">DCF Model Results - {ticker}</h1>
                    
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div>
                            <h2 class="text-xl font-semibold text-gray-900 mb-4">Valuation Results</h2>
                            {valuation_html}
                        </div>
                        
                        <div>
                            <h2 class="text-xl font-semibold text-gray-900 mb-4">Assumptions</h2>
                            {assumptions_html}
                        </div>
                    </div>
                    
                    <div class="mt-8">
                        <h2 class="text-xl font-semibold text-gray-900 mb-4">Actions</h2>
                        {download_section_html}
                    </div>
                    
                    <div class="mt-6">
                        <a href="/" class="text-blue-600 hover:underline">← Back to Home</a>
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
    '''

if __name__ == '__main__':
    import socket
    
    def find_free_port():
        """Find a free port starting from 10000"""
        for port in range(10000, 10100):
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.bind(('', port))
                    return port
            except OSError:
                continue
        return None
    
    port = find_free_port()
    if port is None:
        print("No free ports available in range 10000-10099")
        exit(1)
    
    print(f"Starting simple app on port {port}")
    app.run(host='0.0.0.0', port=port)
