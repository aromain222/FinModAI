"""
Excel export module for Trading Comparables analysis
"""

import xlsxwriter
from typing import Dict, Any
from datetime import datetime
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

class CompsExcelWriter:
    """Excel writer for Trading Comparables analysis"""
    
    def __init__(self, filename: str):
        self.filename = filename
        self.workbook = xlsxwriter.Workbook(filename)
        
        # Define formats
        self._setup_formats()
        
    def _setup_formats(self) -> None:
        """Setup common Excel formats"""
        self.formats = {
            'header': self.workbook.add_format({
                'bold': True,
                'bg_color': '#2C3E50',
                'font_color': 'white',
                'border': 1,
                'align': 'center'
            }),
            'subheader': self.workbook.add_format({
                'bold': True,
                'bg_color': '#34495E',
                'font_color': 'white',
                'border': 1
            }),
            'money': self.workbook.add_format({
                'num_format': '$#,##0.0,,M',
                'border': 1
            }),
            'money_bold': self.workbook.add_format({
                'num_format': '$#,##0.0,,M',
                'border': 1,
                'bold': True,
                'bg_color': '#ECF0F1'
            }),
            'percent': self.workbook.add_format({
                'num_format': '0.0%',
                'border': 1
            }),
            'multiple': self.workbook.add_format({
                'num_format': '0.0x',
                'border': 1
            }),
            'multiple_bold': self.workbook.add_format({
                'num_format': '0.0x',
                'border': 1,
                'bold': True,
                'bg_color': '#ECF0F1'
            }),
            'text': self.workbook.add_format({
                'border': 1
            }),
            'text_bold': self.workbook.add_format({
                'border': 1,
                'bold': True
            }),
            'date': self.workbook.add_format({
                'num_format': 'yyyy-mm-dd',
                'border': 1
            })
        }
        
    def write_universe_summary(self, data: Dict[str, Any]) -> None:
        """Write Universe & Summary sheet"""
        sheet = self.workbook.add_worksheet('Universe & Summary')
        
        # Set column widths
        sheet.set_column('A:A', 15)  # Ticker
        sheet.set_column('B:B', 30)  # Name
        sheet.set_column('C:H', 15)  # Metrics
        
        # Write headers
        headers = [
            'Ticker', 'Company Name', 'Market Cap', 'Enterprise Value',
            'EV/EBITDA', 'EV/Revenue', 'P/E', 'EBITDA Margin'
        ]
        for col, header in enumerate(headers):
            sheet.write(0, col, header, self.formats['header'])
            
        # Write peer data
        row = 1
        for peer in data['peer_data']:
            sheet.write(row, 0, peer['ticker'], self.formats['text'])
            sheet.write(row, 1, peer['name'], self.formats['text'])
            sheet.write(row, 2, peer['market_cap'], self.formats['money'])
            sheet.write(row, 3, peer['enterprise_value'], self.formats['money'])
            sheet.write(row, 4, peer.get('ev_ebitda_ltm'), self.formats['multiple'])
            sheet.write(row, 5, peer.get('ev_revenue_ltm'), self.formats['multiple'])
            sheet.write(row, 6, peer.get('pe_ltm'), self.formats['multiple'])
            sheet.write(row, 7, peer.get('ebitda_margin'), self.formats['percent'])
            row += 1
            
        # Write summary statistics
        row += 1
        for stat in ['mean', 'median', 'p25', 'p75']:
            sheet.write(row, 0, stat.upper(), self.formats['text_bold'])
            for col in range(2, 8):
                value = data['summary_stats'][stat].get(headers[col].lower().replace('/', '_').replace(' ', '_'))
                fmt = self.formats['money_bold'] if col < 4 else self.formats['multiple_bold']
                fmt = self.formats['percent'] if col == 7 else fmt
                sheet.write(row, col, value, fmt)
            row += 1
            
    def write_market_data(self, data: Dict[str, Any]) -> None:
        """Write Market Data sheet"""
        sheet = self.workbook.add_worksheet('Market Data')
        
        # Set column widths
        sheet.set_column('A:B', 15)
        sheet.set_column('C:H', 12)
        
        # Headers
        headers = [
            'Ticker', 'Company', 'Share Price', 'Shares Out.', 'Market Cap',
            'Net Debt', 'Enterprise Value'
        ]
        for col, header in enumerate(headers):
            sheet.write(0, col, header, self.formats['header'])
            
        # Data
        row = 1
        for peer in data['peer_data']:
            sheet.write(row, 0, peer['ticker'], self.formats['text'])
            sheet.write(row, 1, peer['name'], self.formats['text'])
            sheet.write(row, 2, peer['share_price'], self.formats['money'])
            sheet.write(row, 3, peer.get('shares_outstanding', 0), self.formats['money'])
            sheet.write(row, 4, peer['market_cap'], self.formats['money'])
            sheet.write(row, 5, peer['net_debt'], self.formats['money'])
            sheet.write(row, 6, peer['enterprise_value'], self.formats['money'])
            row += 1
            
    def write_operating_data(self, data: Dict[str, Any]) -> None:
        """Write Operating Data sheet"""
        sheet = self.workbook.add_worksheet('Operating Data')
        
        # Headers
        metrics = [
            ('Revenue', 'revenue'),
            ('EBITDA', 'ebitda'),
            ('EBIT', 'ebit'),
            ('Net Income', 'net_income'),
            ('EPS', 'eps')
        ]
        
        current_col = 0
        for metric_name, metric_key in metrics:
            # LTM header
            sheet.write(0, current_col, f'{metric_name} (LTM)', self.formats['header'])
            # NTM header
            sheet.write(0, current_col + 1, f'{metric_name} (NTM)', self.formats['header'])
            
            # Write data
            row = 1
            for peer in data['peer_data']:
                ltm_key = f'{metric_key}_ltm'
                ntm_key = f'{metric_key}_ntm'
                sheet.write(row, current_col, peer.get(ltm_key), self.formats['money'])
                sheet.write(row, current_col + 1, peer.get(ntm_key), self.formats['money'])
                row += 1
                
            current_col += 2
            
    def write_valuation_output(self, data: Dict[str, Any]) -> None:
        """Write Valuation Output sheet"""
        sheet = self.workbook.add_worksheet('Valuation Output')
        
        # Headers
        multiples = [
            ('EV/EBITDA', 'ev_ebitda'),
            ('EV/Revenue', 'ev_revenue'),
            ('EV/EBIT', 'ev_ebit'),
            ('P/E', 'pe')
        ]
        
        current_col = 0
        for multiple_name, multiple_key in multiples:
            # LTM header
            sheet.write(0, current_col, f'{multiple_name} (LTM)', self.formats['header'])
            # NTM header
            sheet.write(0, current_col + 1, f'{multiple_name} (NTM)', self.formats['header'])
            
            # Write data
            row = 1
            for peer in data['peer_data']:
                ltm_key = f'{multiple_key}_ltm'
                ntm_key = f'{multiple_key}_ntm'
                sheet.write(row, current_col, peer.get(ltm_key), self.formats['multiple'])
                sheet.write(row, current_col + 1, peer.get(ntm_key), self.formats['multiple'])
                row += 1
                
            # Write statistics
            row += 1
            for stat in ['mean', 'median', 'p25', 'p75']:
                sheet.write(row, 0, stat.upper(), self.formats['text_bold'])
                ltm_value = data['summary_stats'][stat].get(f'{multiple_key}_ltm')
                ntm_value = data['summary_stats'][stat].get(f'{multiple_key}_ntm')
                sheet.write(row, current_col, ltm_value, self.formats['multiple_bold'])
                sheet.write(row, current_col + 1, ntm_value, self.formats['multiple_bold'])
                row += 1
                
            current_col += 2
            
    def write_implied_valuation(self, data: Dict[str, Any]) -> None:
        """Write Implied Valuation sheet"""
        sheet = self.workbook.add_worksheet('Implied Valuation')
        
        # Headers
        sheet.write(0, 0, 'Metric', self.formats['header'])
        sheet.write(0, 1, 'Multiple', self.formats['header'])
        sheet.write(0, 2, 'Target Value', self.formats['header'])
        sheet.write(0, 3, 'Implied EV', self.formats['header'])
        sheet.write(0, 4, 'Implied Equity', self.formats['header'])
        sheet.write(0, 5, 'Implied Share Price', self.formats['header'])
        
        # Write implied values
        row = 1
        for metric in ['ev_ebitda_ltm', 'ev_revenue_ltm', 'ev_ebit_ltm']:
            metric_name = metric.replace('ev_', '').replace('_ltm', '').upper()
            for stat in ['median', 'mean', 'p25', 'p75']:
                sheet.write(row, 0, metric_name, self.formats['text'])
                sheet.write(row, 1, data['summary_stats'][stat][metric], self.formats['multiple'])
                
                # Get target metric value
                target_value = data['target_metrics']['multiples'].get(metric)
                sheet.write(row, 2, target_value, self.formats['money'])
                
                # Write implied values
                sheet.write(row, 3, data['implied_valuation']['enterprise_value'].get(f'{metric}_{stat}'), self.formats['money'])
                sheet.write(row, 4, data['implied_valuation']['equity_value'].get(f'{metric}_{stat}'), self.formats['money'])
                sheet.write(row, 5, data['implied_valuation']['share_price'].get(f'{metric}_{stat}'), self.formats['money'])
                row += 1
            row += 1
            
    def write_sensitivity(self, data: Dict[str, Any]) -> None:
        """Write Sensitivity Analysis sheet"""
        sheet = self.workbook.add_worksheet('Sensitivity')
        
        # Write sensitivity table
        sensitivity_data = data['sensitivity']
        
        # Headers
        sheet.write(0, 0, 'EV/EBITDA Multiple', self.formats['header'])
        for col, metric_value in enumerate(sensitivity_data.keys(), start=1):
            sheet.write(0, col, metric_value, self.formats['header'])
            
        # Data
        for row, (multiple, values) in enumerate(sensitivity_data.items(), start=1):
            sheet.write(row, 0, multiple, self.formats['multiple'])
            for col, value in enumerate(values.values(), start=1):
                sheet.write(row, col, value, self.formats['money'])
                
    def save(self) -> None:
        """Save and close the workbook"""
        try:
            self.workbook.close()
            logger.info(f"Excel file saved successfully: {self.filename}")
        except Exception as e:
            logger.error(f"Error saving Excel file: {e}")
            raise

def export_comps_to_excel(data: Dict[str, Any], output_path: str) -> str:
    """
    Export Trading Comps analysis to Excel
    
    Args:
        data: Trading Comps analysis data
        output_path: Path to save Excel file
    
    Returns:
        str: Path to saved Excel file
    """
    try:
        # Ensure output directory exists
        output_dir = Path(output_path).parent
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Create Excel writer
        writer = CompsExcelWriter(output_path)
        
        # Write each sheet
        writer.write_universe_summary(data)
        writer.write_market_data(data)
        writer.write_operating_data(data)
        writer.write_valuation_output(data)
        writer.write_implied_valuation(data)
        writer.write_sensitivity(data)
        
        # Save and close
        writer.save()
        return output_path
        
    except Exception as e:
        logger.error(f"Error exporting Trading Comps to Excel: {e}")
        raise
