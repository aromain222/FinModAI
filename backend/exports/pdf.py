"""
PDF Export Module
Generate professional PDF reports using WeasyPrint with ReportLab fallback
"""

from typing import Dict, Any
from datetime import datetime
from config import settings
import logging

logger = logging.getLogger(__name__)


def export_dcf_to_pdf(model_data: Dict[str, Any], ticker: str, output_path: str) -> str:
    """
    Export DCF model to PDF

    Args:
        model_data: DCF model results
        ticker: Company ticker
        output_path: Output file path

    Returns:
        Path to generated PDF file
    """
    try:
        # Try WeasyPrint first
        from weasyprint import HTML

        html_content = _generate_dcf_html(model_data, ticker)
        HTML(string=html_content).write_pdf(output_path)

        logger.info(f"PDF generated successfully using WeasyPrint: {output_path}")
        return output_path

    except ImportError:
        # Fallback to ReportLab
        logger.warning("WeasyPrint not available, using ReportLab fallback")
        return _export_dcf_to_pdf_reportlab(model_data, ticker, output_path)

    except Exception as e:
        logger.error(f"Error generating PDF with WeasyPrint: {e}")
        logger.info("Falling back to ReportLab")
        return _export_dcf_to_pdf_reportlab(model_data, ticker, output_path)


def _generate_dcf_html(model_data: Dict[str, Any], ticker: str) -> str:
    """Generate HTML content for DCF model"""

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>{ticker} DCF Model</title>
        <style>
            body {{
                font-family: Arial, sans-serif;
                margin: 40px;
                color: #333;
            }}
            h1 {{
                color: #1e3a8a;
                border-bottom: 3px solid #1e3a8a;
                padding-bottom: 10px;
            }}
            h2 {{
                color: #3b82f6;
                margin-top: 30px;
            }}
            table {{
                width: 100%;
                border-collapse: collapse;
                margin: 20px 0;
            }}
            th {{
                background-color: #1e3a8a;
                color: white;
                padding: 10px;
                text-align: left;
                font-weight: bold;
            }}
            td {{
                padding: 8px;
                border-bottom: 1px solid #ddd;
            }}
            tr:nth-child(even) {{
                background-color: #f2f2f2;
            }}
            .highlight {{
                background-color: #e0e7ff;
                font-weight: bold;
            }}
            .footer {{
                margin-top: 50px;
                padding-top: 20px;
                border-top: 2px solid #ddd;
                font-size: 12px;
                color: #666;
                text-align: center;
            }}
        </style>
    </head>
    <body>
        <h1>{ticker} DCF Model</h1>
        <p><strong>Generated:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
        
        <h2>Key Outputs</h2>
        <table>
            <tr>
                <th>Metric</th>
                <th>Value</th>
            </tr>
            <tr>
                <td>Enterprise Value</td>
                <td>${model_data.get('enterprise_value', 0):,.0f}</td>
            </tr>
            <tr>
                <td>Equity Value</td>
                <td>${model_data.get('equity_value', 0):,.0f}</td>
            </tr>
            <tr>
                <td>Implied Price</td>
                <td>${model_data.get('implied_price', 0):.2f}</td>
            </tr>
            <tr>
                <td>Current Price</td>
                <td>${model_data.get('current_price', 0):.2f}</td>
            </tr>
            <tr class="highlight">
                <td>Upside %</td>
                <td>{model_data.get('upside_pct', 0):.1f}%</td>
            </tr>
        </table>
        
        <h2>Key Assumptions</h2>
        <table>
            <tr>
                <th>Assumption</th>
                <th>Value</th>
            </tr>
            <tr>
                <td>WACC</td>
                <td>{model_data.get('wacc', 0):.1%}</td>
            </tr>
            <tr>
                <td>Terminal Growth</td>
                <td>{model_data.get('terminal_growth', 0):.1%}</td>
            </tr>
            <tr>
                <td>Revenue CAGR</td>
                <td>{model_data.get('revenue_cagr', 0):.1%}</td>
            </tr>
            <tr>
                <td>EBITDA CAGR</td>
                <td>{model_data.get('ebitda_cagr', 0):.1%}</td>
            </tr>
        </table>
        
        <h2>5-Year Projections</h2>
        <table>
            <tr>
                <th>Year</th>
                <th>Revenue</th>
                <th>EBITDA</th>
                <th>CapEx</th>
                <th>ΔNWC</th>
                <th>FCF</th>
                <th>PV Factor</th>
                <th>PV FCF</th>
            </tr>
    """

    # Add projections
    projections = model_data.get("projections", [])
    for proj in projections:
        html += f"""
            <tr>
                <td>{proj.get('year', 0)}</td>
                <td>${proj.get('revenue', 0):,.0f}</td>
                <td>${proj.get('ebitda', 0):,.0f}</td>
                <td>${proj.get('capex', 0):,.0f}</td>
                <td>${proj.get('delta_nwc', 0):,.0f}</td>
                <td>${proj.get('fcf', 0):,.0f}</td>
                <td>{proj.get('pv_factor', 0):.3f}</td>
                <td>${proj.get('pv_fcf', 0):,.0f}</td>
            </tr>
        """

    # Add totals
    html += f"""
            <tr class="highlight">
                <td colspan="6">PV of FCF</td>
                <td colspan="2">${model_data.get('pv_of_fcf', 0):,.0f}</td>
            </tr>
            <tr class="highlight">
                <td colspan="6">PV of Terminal Value</td>
                <td colspan="2">${model_data.get('pv_terminal_value', 0):,.0f}</td>
            </tr>
            <tr class="highlight">
                <td colspan="6">Enterprise Value</td>
                <td colspan="2">${model_data.get('enterprise_value', 0):,.0f}</td>
            </tr>
        </table>
        
        <div class="footer">
            {settings.EXPORT_FOOTER_NOTE}
        </div>
    </body>
    </html>
    """

    return html


def _export_dcf_to_pdf_reportlab(model_data: Dict[str, Any], ticker: str, output_path: str) -> str:
    """Fallback PDF generation using ReportLab"""

    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (
        SimpleDocTemplate,
        Table,
        TableStyle,
        Paragraph,
        Spacer,
    )

    # Create PDF document
    doc = SimpleDocTemplate(output_path, pagesize=letter)
    story = []

    # Define styles
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "CustomTitle",
        parent=styles["Heading1"],
        fontSize=24,
        textColor=colors.HexColor("#1e3a8a"),
        spaceAfter=30,
    )

    # Title
    story.append(Paragraph(f"{ticker} DCF Model", title_style))
    story.append(
        Paragraph(
            f'Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}',
            styles["Normal"],
        )
    )
    story.append(Spacer(1, 20))

    # Key Outputs
    story.append(Paragraph("Key Outputs", styles["Heading2"]))
    outputs_data = [
        ["Metric", "Value"],
        ["Enterprise Value", f"${model_data.get('enterprise_value', 0):,.0f}"],
        ["Equity Value", f"${model_data.get('equity_value', 0):,.0f}"],
        ["Implied Price", f"${model_data.get('implied_price', 0):.2f}"],
        ["Current Price", f"${model_data.get('current_price', 0):.2f}"],
        ["Upside %", f"{model_data.get('upside_pct', 0):.1f}%"],
    ]

    outputs_table = Table(outputs_data)
    outputs_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a8a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 12),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
                ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
                ("GRID", (0, 0), (-1, -1), 1, colors.black),
            ]
        )
    )

    story.append(outputs_table)
    story.append(Spacer(1, 20))

    # Key Assumptions
    story.append(Paragraph("Key Assumptions", styles["Heading2"]))
    assumptions_data = [
        ["Assumption", "Value"],
        ["WACC", f"{model_data.get('wacc', 0):.1%}"],
        ["Terminal Growth", f"{model_data.get('terminal_growth', 0):.1%}"],
        ["Revenue CAGR", f"{model_data.get('revenue_cagr', 0):.1%}"],
        ["EBITDA CAGR", f"{model_data.get('ebitda_cagr', 0):.1%}"],
    ]

    assumptions_table = Table(assumptions_data)
    assumptions_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a8a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 12),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
                ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
                ("GRID", (0, 0), (-1, -1), 1, colors.black),
            ]
        )
    )

    story.append(assumptions_table)
    story.append(Spacer(1, 20))

    # Footer
    story.append(Spacer(1, 50))
    story.append(Paragraph(settings.EXPORT_FOOTER_NOTE, styles["Normal"]))

    # Build PDF
    doc.build(story)

    logger.info(f"PDF generated successfully using ReportLab: {output_path}")
    return output_path


def export_lbo_to_pdf(model_data: Dict[str, Any], ticker: str, output_path: str) -> str:
    """Export LBO model to PDF"""
    # TODO: Implement LBO PDF export
    raise NotImplementedError("LBO PDF export not yet implemented")


def export_comps_to_pdf(model_data: Dict[str, Any], ticker: str, output_path: str) -> str:
    """Export Comps model to PDF"""
    # TODO: Implement Comps PDF export
    raise NotImplementedError("Comps PDF export not yet implemented")


def export_merger_to_pdf(model_data: Dict[str, Any], ticker: str, output_path: str) -> str:
    """Export Merger model to PDF"""
    # TODO: Implement Merger PDF export
    raise NotImplementedError("Merger PDF export not yet implemented")
