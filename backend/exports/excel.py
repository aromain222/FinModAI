"""
Excel Export Module
Generate banker-grade Excel files using XlsxWriter
"""

import xlsxwriter
from typing import Dict, Any
from datetime import datetime
import os


def export_dcf_to_excel(
    model_data: Dict[str, Any],
    ticker: str,
    output_path: str
) -> str:
    """
    Export DCF model to Excel with banker formatting
    
    Args:
        model_data: DCF model results
        ticker: Company ticker
        output_path: Output file path
    
    Returns:
        Path to generated Excel file
    """
    # Create workbook
    workbook = xlsxwriter.Workbook(output_path)
    
    # Define formats
    header_format = workbook.add_format({
        'bold': True,
        'font_color': 'white',
        'bg_color': '#1e3a8a',
        'align': 'center',
        'valign': 'vcenter',
        'border': 1
    })
    
    subheader_format = workbook.add_format({
        'bold': True,
        'bg_color': '#e0e7ff',
        'border': 1
    })
    
    currency_format = workbook.add_format({
        'num_format': '$#,##0.00',
        'border': 1
    })
    
    percent_format = workbook.add_format({
        'num_format': '0.0%',
        'border': 1
    })
    
    number_format = workbook.add_format({
        'num_format': '#,##0',
        'border': 1
    })
    
    # Sheet 1: Summary
    summary_sheet = workbook.add_worksheet('Summary')
    
    # Title
    summary_sheet.merge_range('A1:E1', f'{ticker} DCF Model', header_format)
    summary_sheet.write('A2', 'Generated:', subheader_format)
    summary_sheet.write('B2', datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    
    # Key Outputs
    row = 4
    summary_sheet.write(row, 0, 'Key Outputs', header_format)
    summary_sheet.write(row, 1, '', header_format)
    row += 1
    
    outputs = [
        ('Enterprise Value', model_data.get('enterprise_value', 0), currency_format),
        ('Equity Value', model_data.get('equity_value', 0), currency_format),
        ('Implied Price', model_data.get('implied_price', 0), currency_format),
        ('Current Price', model_data.get('current_price', 0), currency_format),
        ('Upside %', model_data.get('upside_pct', 0) / 100, percent_format),
    ]
    
    for label, value, fmt in outputs:
        summary_sheet.write(row, 0, label, subheader_format)
        summary_sheet.write(row, 1, value, fmt)
        row += 1
    
    # Assumptions
    row += 1
    summary_sheet.write(row, 0, 'Key Assumptions', header_format)
    summary_sheet.write(row, 1, '', header_format)
    row += 1
    
    assumptions = [
        ('WACC', model_data.get('wacc', 0), percent_format),
        ('Terminal Growth', model_data.get('terminal_growth', 0), percent_format),
        ('Revenue CAGR', model_data.get('revenue_cagr', 0), percent_format),
        ('EBITDA CAGR', model_data.get('ebitda_cagr', 0), percent_format),
    ]
    
    for label, value, fmt in assumptions:
        summary_sheet.write(row, 0, label, subheader_format)
        summary_sheet.write(row, 1, value, fmt)
        row += 1
    
    # Set column widths
    summary_sheet.set_column('A:A', 20)
    summary_sheet.set_column('B:B', 15)
    
    # Sheet 2: Projections
    projections_sheet = workbook.add_worksheet('Projections')
    
    # Headers
    headers = ['Year', 'Revenue', 'EBITDA', 'CapEx', 'ΔNWC', 'FCF', 'PV Factor', 'PV FCF']
    for col, header in enumerate(headers):
        projections_sheet.write(0, col, header, header_format)
    
    # Data
    projections = model_data.get('projections', [])
    for row, proj in enumerate(projections, start=1):
        projections_sheet.write(row, 0, proj.get('year', 0), number_format)
        projections_sheet.write(row, 1, proj.get('revenue', 0), currency_format)
        projections_sheet.write(row, 2, proj.get('ebitda', 0), currency_format)
        projections_sheet.write(row, 3, proj.get('capex', 0), currency_format)
        projections_sheet.write(row, 4, proj.get('delta_nwc', 0), currency_format)
        projections_sheet.write(row, 5, proj.get('fcf', 0), currency_format)
        projections_sheet.write(row, 6, proj.get('pv_factor', 0), number_format)
        projections_sheet.write(row, 7, proj.get('pv_fcf', 0), currency_format)
    
    # Totals
    row = len(projections) + 1
    projections_sheet.write(row, 5, 'PV of FCF:', subheader_format)
    projections_sheet.write(row, 7, model_data.get('pv_of_fcf', 0), currency_format)
    row += 1
    projections_sheet.write(row, 5, 'PV of Terminal Value:', subheader_format)
    projections_sheet.write(row, 7, model_data.get('pv_terminal_value', 0), currency_format)
    row += 1
    projections_sheet.write(row, 5, 'Enterprise Value:', subheader_format)
    projections_sheet.write(row, 7, model_data.get('enterprise_value', 0), currency_format)
    
    # Set column widths
    for col in range(len(headers)):
        projections_sheet.set_column(col, col, 12)
    
    # Freeze panes
    projections_sheet.freeze_panes(1, 0)
    
    # Sheet 3: Sensitivity
    sensitivity_sheet = workbook.add_worksheet('Sensitivity')
    
    # Create sensitivity matrix
    wacc_values = [0.08, 0.09, 0.10, 0.11, 0.12]
    growth_values = [0.015, 0.020, 0.025, 0.030, 0.035]
    
    # Headers
    sensitivity_sheet.write(0, 0, 'WACC \\ Terminal Growth', header_format)
    for col, g in enumerate(growth_values, start=1):
        sensitivity_sheet.write(0, col, f'{g:.1%}', header_format)
    
    # Data
    base_ev = model_data.get('enterprise_value', 0)
    for row, wacc in enumerate(wacc_values, start=1):
        sensitivity_sheet.write(row, 0, f'{wacc:.1%}', subheader_format)
        for col, growth in enumerate(growth_values, start=1):
            # Simplified sensitivity calculation
            sensitivity_ev = base_ev * (1 + (wacc - 0.10) * 0.5) * (1 + (growth - 0.025) * 0.5)
            sensitivity_sheet.write(row, col, sensitivity_ev, currency_format)
    
    # Set column widths
    sensitivity_sheet.set_column(0, 0, 20)
    for col in range(1, len(growth_values) + 1):
        sensitivity_sheet.set_column(col, col, 15)
    
    # Sheet 4: Provenance
    provenance_sheet = workbook.add_worksheet('Provenance')
    
    # Headers
    provenance_sheet.write(0, 0, 'Field', header_format)
    provenance_sheet.write(0, 1, 'Provider', header_format)
    provenance_sheet.write(0, 2, 'As Of', header_format)
    
    # Data
    provenance = model_data.get('provenance', {})
    for row, (field, provider) in enumerate(provenance.items(), start=1):
        provenance_sheet.write(row, 0, field, subheader_format)
        provenance_sheet.write(row, 1, provider, number_format)
        provenance_sheet.write(row, 2, datetime.now().strftime('%Y-%m-%d'), number_format)
    
    # Set column widths
    provenance_sheet.set_column(0, 0, 20)
    provenance_sheet.set_column(1, 1, 15)
    provenance_sheet.set_column(2, 2, 15)
    
    # Close workbook
    workbook.close()
    
    return output_path


def export_lbo_to_excel(
    model_data: Dict[str, Any],
    ticker: str,
    output_path: str
) -> str:
    """
    Export LBO model to Excel
    
    Args:
        model_data: LBO model results
        ticker: Company ticker
        output_path: Output file path
    
    Returns:
        Path to generated Excel file
    """
    # TODO: Implement LBO Excel export
    raise NotImplementedError("LBO Excel export not yet implemented")


def export_comps_to_excel(
    model_data: Dict[str, Any],
    ticker: str,
    output_path: str
) -> str:
    """
    Export Comps model to Excel
    
    Args:
        model_data: Comps model results
        ticker: Company ticker
        output_path: Output file path
    
    Returns:
        Path to generated Excel file
    """
    # TODO: Implement Comps Excel export
    raise NotImplementedError("Comps Excel export not yet implemented")


def export_merger_to_excel(
    model_data: Dict[str, Any],
    ticker: str,
    output_path: str
) -> str:
    """
    Export Merger model to Excel
    
    Args:
        model_data: Merger model results
        ticker: Company ticker
        output_path: Output file path
    
    Returns:
        Path to generated Excel file
    """
    # TODO: Implement Merger Excel export
    raise NotImplementedError("Merger Excel export not yet implemented")

