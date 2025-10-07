# Routes
@app.route('/')
def index():
    return render_template('index.html')

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
            
            # Redirect to results page
            return redirect(url_for('model_results', model_id=model_id))
            
        except Exception as e:
            flash(f'Error generating model: {str(e)}', 'error')
            return redirect(url_for('index'))
    
    return render_template('generate_model.html')

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
        
        <a href="/download-excel" class="block">
            <button class="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors">
                Download Excel Model
            </button>
        </a>
    </div>
    """
    
    return render_template(
        'model_results.html',
        model_id=model_id,
        ticker=ticker,
        model_type=model_type,
        climate=climate,
        valuation_html=valuation_html,
        download_section_html=download_section_html
    )

@app.route('/download-excel')
def download_excel():
    # Create Excel file
    output = io.BytesIO()
    workbook = openpyxl.Workbook()
    worksheet = workbook.active
    worksheet.title = "Model"
    
    # Add headers
    headers = ["Metric", "Value"]
    for col, header in enumerate(headers, 1):
        cell = worksheet.cell(row=1, column=col)
        cell.value = header
        cell.font = Font(bold=True)
        cell.fill = PatternFill(start_color="E2EFDA", end_color="E2EFDA", fill_type="solid")
        cell.alignment = Alignment(horizontal="center")
        cell.border = Border(
            left=Side(style="thin"),
            right=Side(style="thin"),
            top=Side(style="thin"),
            bottom=Side(style="thin")
        )
    
    # Add data
    data = [
        ["Enterprise Value", "$2.5B"],
        ["Equity Value", "$2.0B"],
        ["Implied Price", "$25.00"],
        ["Current Price", "$20.00"],
        ["Upside/Downside", "25.0%"]
    ]
    
    for row_idx, (metric, value) in enumerate(data, 2):
        # Metric
        cell = worksheet.cell(row=row_idx, column=1)
        cell.value = metric
        cell.alignment = Alignment(horizontal="left")
        cell.border = Border(
            left=Side(style="thin"),
            right=Side(style="thin"),
            top=Side(style="thin"),
            bottom=Side(style="thin")
        )
        
        # Value
        cell = worksheet.cell(row=row_idx, column=2)
        cell.value = value
        cell.alignment = Alignment(horizontal="right")
        cell.border = Border(
            left=Side(style="thin"),
            right=Side(style="thin"),
            top=Side(style="thin"),
            bottom=Side(style="thin")
        )
    
    # Auto-adjust column widths
    for column in worksheet.columns:
        max_length = 0
        column = [cell for cell in column]
        for cell in column:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(cell.value)
            except:
                pass
        adjusted_width = (max_length + 2)
        worksheet.column_dimensions[column[0].column_letter].width = adjusted_width
    
    # Save to buffer
    workbook.save(output)
    output.seek(0)
    
    return send_file(
        output,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name="model.xlsx"
    )

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=10000)
