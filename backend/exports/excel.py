"""
Optimized Excel export module using XlsxWriter
"""

import xlsxwriter
from typing import Dict, Any, Optional
from datetime import datetime
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

class ModelExcelWriter:
    """Fast Excel writer for financial models using XlsxWriter"""

    def __init__(self, filename: str):
        self.filename = filename
        self.workbook = xlsxwriter.Workbook(filename)
        
        # Pre-define common formats for performance
        self.formats = {
            'header': self.workbook.add_format({
                'bold': True,
                'bg_color': '#2C3E50',
                'font_color': 'white',
                'border': 1
            }),
            'money': self.workbook.add_format({
                'num_format': '$#,##0.00',
                'border': 1
            }),
            'percent': self.workbook.add_format({
                'num_format': '0.00%',
                'border': 1
            }),
            'date': self.workbook.add_format({
                'num_format': 'yyyy-mm-dd',
                'border': 1
            }),
            'text': self.workbook.add_format({
                'border': 1
            }),
            'bold': self.workbook.add_format({
                'bold': True,
                'border': 1
            }),
            'total': self.workbook.add_format({
                'bold': True,
                'bg_color': '#ECF0F1',
                'border': 1,
                'num_format': '$#,##0.00'
            })
        }

    def write_dcf_model(self, data: Dict[str, Any]) -> None:
        """Write DCF model with optimized formatting"""
        # Summary sheet
        summary = self.workbook.add_worksheet('Summary')
        summary.set_column('A:A', 30)
        summary.set_column('B:B', 20)

        # Write metadata
        summary.write('A1', 'DCF Model Summary', self.formats['header'])
        summary.write('A2', 'Generated Date', self.formats['text'])
        summary.write('B2', datetime.now(), self.formats['date'])
        summary.write('A3', 'Company', self.formats['text'])
        summary.write('B3', data.get('ticker', ''), self.formats['text'])

        # Write key metrics
        row = 5
        metrics = [
            ('Enterprise Value', data.get('enterprise_value', 0)),
            ('Equity Value', data.get('equity_value', 0)),
            ('Implied Share Price', data.get('implied_price', 0)),
            ('Current Price', data.get('current_price', 0)),
            ('Upside/Downside', data.get('upside_downside', 0))
        ]
        
        for label, value in metrics:
            summary.write(f'A{row}', label, self.formats['bold'])
            format_key = 'percent' if 'Upside' in label else 'money'
            summary.write(f'B{row}', value, self.formats[format_key])
            row += 1

        # Projections sheet
        proj = self.workbook.add_worksheet('Projections')
        proj.set_column('A:G', 15)

        # Write projections header
        headers = ['Year', 'Revenue', 'EBIT', 'EBITDA', 'FCF', 'Terminal Value']
        for col, header in enumerate(headers):
            proj.write(0, col, header, self.formats['header'])

        # Write projections data
        projections = data.get('projections', [])
        for row, year_data in enumerate(projections, start=1):
            proj.write(row, 0, year_data.get('year', ''), self.formats['text'])
            proj.write(row, 1, year_data.get('revenue', 0), self.formats['money'])
            proj.write(row, 2, year_data.get('ebit', 0), self.formats['money'])
            proj.write(row, 3, year_data.get('ebitda', 0), self.formats['money'])
            proj.write(row, 4, year_data.get('fcf', 0), self.formats['money'])
            if row == len(projections):  # Last row
                proj.write(row, 5, data.get('terminal_value', 0), self.formats['money'])

        # Assumptions sheet
        assump = self.workbook.add_worksheet('Assumptions')
        assump.set_column('A:B', 25)

        # Write assumptions
        assump.write('A1', 'Model Assumptions', self.formats['header'])
        assumptions = [
            ('WACC', data.get('wacc', 0), 'percent'),
            ('Terminal Growth', data.get('terminal_growth', 0), 'percent'),
            ('Revenue CAGR', data.get('revenue_cagr', 0), 'percent'),
            ('EBIT Margin', data.get('ebit_margin', 0), 'percent'),
            ('Tax Rate', data.get('tax_rate', 0), 'percent')
        ]

        for i, (label, value, format_key) in enumerate(assumptions, start=2):
            assump.write(f'A{i}', label, self.formats['text'])
            assump.write(f'B{i}', value, self.formats[format_key])

    def write_lbo_model(self, data: Dict[str, Any]) -> None:
        """Write LBO model with optimized formatting"""
        # Summary sheet
        summary = self.workbook.add_worksheet('Summary')
        summary.set_column('A:A', 30)
        summary.set_column('B:B', 20)

        # Write metadata
        summary.write('A1', 'LBO Model Summary', self.formats['header'])
        summary.write('A2', 'Generated Date', self.formats['text'])
        summary.write('B2', datetime.now(), self.formats['date'])
        summary.write('A3', 'Company', self.formats['text'])
        summary.write('B3', data.get('ticker', ''), self.formats['text'])

        # Write key metrics
        row = 5
        metrics = [
            ('Purchase Price', data.get('purchase_price', 0)),
            ('Exit Value', data.get('exit_value', 0)),
            ('IRR', data.get('irr', 0)),
            ('MOIC', data.get('moic', 0)),
            ('Exit Year', data.get('exit_year', 0))
        ]
        
        for label, value in metrics:
            summary.write(f'A{row}', label, self.formats['bold'])
            format_key = 'percent' if label in ['IRR'] else 'money'
            format_key = 'text' if label == 'Exit Year' else format_key
            summary.write(f'B{row}', value, self.formats[format_key])
            row += 1

        # Add other LBO-specific sheets...

    def save(self) -> None:
        """Save and close the workbook"""
        try:
            self.workbook.close()
            logger.info(f"Excel file saved successfully: {self.filename}")
        except Exception as e:
            logger.error(f"Error saving Excel file: {e}")
            raise

def export_model_to_excel(
    data: Dict[str, Any],
    output_path: str,
    model_type: str = "dcf"
) -> str:
    """
    Export financial model to Excel with optimized formatting
    
    Args:
        data: Model data dictionary
        output_path: Path to save Excel file
        model_type: Type of model ('dcf' or 'lbo')
    
    Returns:
        str: Path to saved Excel file
    """
    try:
        # Ensure output directory exists
        output_dir = Path(output_path).parent
        output_dir.mkdir(parents=True, exist_ok=True)

        # Create Excel writer
        writer = ModelExcelWriter(output_path)

        # Write model based on type
        if model_type.lower() == "dcf":
            writer.write_dcf_model(data)
        elif model_type.lower() == "lbo":
            writer.write_lbo_model(data)
        else:
            raise ValueError(f"Unsupported model type: {model_type}")

        # Save and close
        writer.save()
        return output_path

    except Exception as e:
        logger.error(f"Error exporting model to Excel: {e}")
        raise