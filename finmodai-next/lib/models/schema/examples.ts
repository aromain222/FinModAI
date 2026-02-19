/**
 * ModelDocument Examples
 * 
 * Minimal examples showing schema structure for each model type
 */

import type { ModelDocument } from './ModelDocument';
import { DEFAULT_STYLE_TOKENS } from './StyleTokens';

/**
 * Example 1: Trading Comps
 * 
 * Includes:
 * - One table with comps data
 * - Summary statistics
 * - Derived value with provenance (shares)
 * - Missing value (P/E for negative NI)
 * - Total row with thick border
 */
export const EXAMPLE_TRADING_COMPS: ModelDocument = {
  meta: {
    modelType: 'comps',
    companyName: 'Apple Inc.',
    ticker: 'AAPL',
    asOfDate: '2024-01-15',
    currency: 'USD',
    units: 'millions',
    generatedAt: '2024-01-15T10:30:00Z',
  },
  sections: [
    {
      id: 'header',
      title: 'AAPL - Trading Comps Analysis',
      layout: 'fullWidth',
      blocks: [
        {
          type: 'text',
          content: 'As of: January 15, 2024 | Currency: USD | Units: Millions',
          style: 'cell.muted',
        },
        {
          type: 'spacer',
          height: 1,
        },
      ],
    },
    {
      id: 'comps-table',
      title: 'Trading Comps',
      layout: 'fullWidth',
      blocks: [
        {
          type: 'table',
          tableId: 'comps-main',
          columns: [
            { key: 'company', label: 'Company', type: 'text', align: 'left', width: 28 },
            { key: 'ticker', label: 'Ticker', type: 'text', align: 'center', width: 8 },
            { key: 'price', label: 'Price / Share', type: 'currency', format: '$0.00', align: 'right', width: 10 },
            { key: 'shares', label: 'Shares Outstanding (mm)', type: 'number', format: '#,##0.0', align: 'right', width: 15 },
            { key: 'marketCap', label: 'Market Cap (USD mm)', type: 'currency', format: '$#,##0', align: 'right', width: 15, group: 'Company & Market' },
            { key: 'ev', label: 'Enterprise Value (USD mm)', type: 'currency', format: '$#,##0', align: 'right', width: 18, group: 'Company & Market' },
            { key: 'evRevenue', label: 'EV/Revenue', type: 'multiple', format: '#,##0.0"x"', align: 'right', width: 12, group: 'Multiples' },
            { key: 'evEbitda', label: 'EV/EBITDA', type: 'multiple', format: '#,##0.0"x"', align: 'right', width: 12, group: 'Multiples' },
            { key: 'pe', label: 'P/E', type: 'multiple', format: '#,##0.0"x"', align: 'right', width: 10, group: 'Multiples' },
            { key: 'revenue', label: 'Revenue (USD mm)', type: 'currency', format: '$#,##0', align: 'right', width: 15, group: 'Financials' },
            { key: 'ebitda', label: 'EBITDA (USD mm)', type: 'currency', format: '$#,##0', align: 'right', width: 15, group: 'Financials' },
            { key: 'notes', label: 'Notes', type: 'text', align: 'left', width: 22 },
          ],
          rows: [
            // Header row
            {
              rowKey: 'header',
              rowType: 'header',
              cells: {
                company: { value: 'Company', meta: { status: 'reported' } },
                ticker: { value: 'Ticker', meta: { status: 'reported' } },
                price: { value: 'Price / Share', meta: { status: 'reported' } },
                shares: { value: 'Shares Outstanding (mm)', meta: { status: 'reported' } },
                marketCap: { value: 'Market Cap (USD mm)', meta: { status: 'reported' } },
                ev: { value: 'Enterprise Value (USD mm)', meta: { status: 'reported' } },
                evRevenue: { value: 'EV/Revenue', meta: { status: 'reported' } },
                evEbitda: { value: 'EV/EBITDA', meta: { status: 'reported' } },
                pe: { value: 'P/E', meta: { status: 'reported' } },
                revenue: { value: 'Revenue (USD mm)', meta: { status: 'reported' } },
                ebitda: { value: 'EBITDA (USD mm)', meta: { status: 'reported' } },
                notes: { value: 'Notes', meta: { status: 'reported' } },
              },
              style: 'row.header',
            },
            // Target company (AAPL)
            {
              rowKey: 'aapl',
              labelCell: 'Apple Inc.',
              rowType: 'data',
              cells: {
                company: { value: 'Apple Inc.', style: 'cell.target' },
                ticker: { value: 'AAPL', style: 'cell.target' },
                price: { value: 150.50, meta: { status: 'reported', source: 'FMP' } },
                shares: {
                  value: 15543.0, // Derived value
                  meta: {
                    status: 'derived',
                    method: 'shares_out_basic = market_cap / price',
                    inputs_used: ['market_cap', 'price'],
                    confidence: 'medium',
                  },
                },
                marketCap: { value: 2340000, meta: { status: 'reported', source: 'FMP' } },
                ev: { value: 2400000, meta: { status: 'derived', method: 'enterprise_value = market_cap + net_debt', confidence: 'high' } },
                evRevenue: { value: 7.2, meta: { status: 'derived' } },
                evEbitda: { value: 18.5, meta: { status: 'derived' } },
                pe: { value: 28.5, meta: { status: 'derived' } },
                revenue: { value: 333000, meta: { status: 'reported', source: 'SEC EDGAR' } },
                ebitda: { value: 130000, meta: { status: 'reported', source: 'SEC EDGAR' } },
                notes: { value: 'Shares derived from market cap and price.', meta: { status: 'reported' } },
              },
              style: 'row.target',
            },
            // Peer 1
            {
              rowKey: 'msft',
              labelCell: 'Microsoft Corporation',
              rowType: 'data',
              cells: {
                company: { value: 'Microsoft Corporation' },
                ticker: { value: 'MSFT' },
                price: { value: 380.25, meta: { status: 'reported' } },
                shares: { value: 7430.0, meta: { status: 'reported' } },
                marketCap: { value: 2825000, meta: { status: 'reported' } },
                ev: { value: 2850000, meta: { status: 'derived' } },
                evRevenue: { value: 8.1, meta: { status: 'derived' } },
                evEbitda: { value: 19.2, meta: { status: 'derived' } },
                pe: { value: 32.1, meta: { status: 'derived' } },
                revenue: { value: 352000, meta: { status: 'reported' } },
                ebitda: { value: 148000, meta: { status: 'reported' } },
                notes: { value: '', meta: { status: 'reported' } },
              },
            },
            // Peer 2 (with missing P/E due to negative NI)
            {
              rowKey: 'tsla',
              labelCell: 'Tesla, Inc.',
              rowType: 'data',
              cells: {
                company: { value: 'Tesla, Inc.' },
                ticker: { value: 'TSLA' },
                price: { value: 245.00, meta: { status: 'reported' } },
                shares: { value: 3170.0, meta: { status: 'reported' } },
                marketCap: { value: 777000, meta: { status: 'reported' } },
                ev: { value: 800000, meta: { status: 'derived' } },
                evRevenue: { value: 5.8, meta: { status: 'derived' } },
                evEbitda: { value: 22.3, meta: { status: 'derived' } },
                pe: {
                  value: null, // Missing - negative NI
                  meta: {
                    status: 'missing',
                    method: 'pe = market_cap / net_income',
                    warnings: ['Net Income negative - P/E not calculated'],
                  },
                },
                revenue: { value: 138000, meta: { status: 'reported' } },
                ebitda: { value: 36000, meta: { status: 'reported' } },
                notes: { value: 'Missing Net Income - P/E not calculated', meta: { status: 'reported' } },
              },
            },
            // Summary Statistics (Total row with thick border)
            {
              rowKey: 'summary',
              labelCell: 'Summary Statistics',
              rowType: 'total',
              indentLevel: 0,
              cells: {
                company: { value: 'Summary Statistics', style: 'cell.total' },
                ticker: { value: '' },
                price: { value: '' },
                shares: { value: '' },
                marketCap: { value: '' },
                ev: { value: '' },
                evRevenue: { value: 7.0, meta: { status: 'derived', method: 'median(evRevenue)' } },
                evEbitda: { value: 19.3, meta: { status: 'derived', method: 'median(evEbitda)' } },
                pe: { value: 30.3, meta: { status: 'derived', method: 'median(pe)' } },
                revenue: { value: '' },
                ebitda: { value: '' },
                notes: { value: 'N=3 comps', meta: { status: 'reported' } },
              },
              style: 'row.total',
            },
          ],
          grid: {
            freezePanes: { row: 1, column: 2 },
            columnWidths: {
              company: 28,
              ticker: 8,
              price: 10,
              shares: 15,
              marketCap: 15,
              ev: 18,
              evRevenue: 12,
              evEbitda: 12,
              pe: 10,
              revenue: 15,
              ebitda: 15,
              notes: 22,
            },
            hideGridlines: true,
          },
          footnotes: [
            'All financials shown in USD millions unless otherwise noted.',
            'Some share counts are derived where not publicly reported.',
          ],
        },
      ],
    },
  ],
  globalStyles: DEFAULT_STYLE_TOKENS,
};

/**
 * Example 2: DCF Summary
 * 
 * Includes:
 * - Valuation bridge table
 * - Assumptions table
 * - Derived value (Enterprise Value)
 * - Missing value (Per-share if shares unavailable)
 */
export const EXAMPLE_DCF_SUMMARY: ModelDocument = {
  meta: {
    modelType: 'dcf',
    companyName: 'Apple Inc.',
    ticker: 'AAPL',
    asOfDate: '2024-01-15',
    currency: 'USD',
    units: 'millions',
    generatedAt: '2024-01-15T10:30:00Z',
  },
  sections: [
    {
      id: 'header',
      title: 'AAPL - DCF Valuation Summary',
      layout: 'fullWidth',
      blocks: [
        {
          type: 'text',
          content: 'As of: January 15, 2024 | Currency: USD | Units: Millions',
        },
        {
          type: 'spacer',
          height: 1,
        },
      ],
    },
    {
      id: 'valuation-bridge',
      title: 'Valuation Outputs',
      layout: 'fullWidth',
      blocks: [
        {
          type: 'table',
          tableId: 'valuation-bridge',
          columns: [
            { key: 'label', label: '', type: 'text', align: 'left', width: 30 },
            { key: 'value', label: 'Value', type: 'currency', format: '$#,##0', align: 'right', width: 20 },
          ],
          rows: [
            {
              rowKey: 'ev',
              labelCell: 'Enterprise Value',
              rowType: 'data',
              cells: {
                label: { value: 'Enterprise Value' },
                value: {
                  value: 2400000,
                  meta: {
                    status: 'derived',
                    method: 'DCF: PV of FCF + Terminal Value',
                    confidence: 'medium',
                  },
                },
              },
            },
            {
              rowKey: 'netDebt',
              labelCell: 'Net Debt',
              rowType: 'data',
              cells: {
                label: { value: 'Net Debt' },
                value: { value: 60000, meta: { status: 'reported', source: 'Balance Sheet' } },
              },
            },
            {
              rowKey: 'equityValue',
              labelCell: 'Equity Value',
              rowType: 'total',
              cells: {
                label: { value: 'Equity Value', style: 'cell.total' },
                value: {
                  value: 2340000,
                  meta: {
                    status: 'derived',
                    method: 'equity_value = enterprise_value - net_debt',
                    confidence: 'high',
                  },
                  style: 'cell.total',
                },
              },
            },
            {
              rowKey: 'shares',
              labelCell: 'Shares Outstanding',
              rowType: 'data',
              cells: {
                label: { value: 'Shares Outstanding' },
                value: {
                  value: 15543.0,
                  meta: {
                    status: 'derived',
                    method: 'shares_out_basic = market_cap / price',
                    confidence: 'medium',
                  },
                },
              },
            },
            {
              rowKey: 'pricePerShare',
              labelCell: 'Implied Price/Share',
              rowType: 'total',
              cells: {
                label: { value: 'Implied Price/Share', style: 'cell.total' },
                value: {
                  value: 150.50,
                  meta: {
                    status: 'derived',
                    method: 'implied_price = equity_value / shares_out_basic',
                    confidence: 'medium',
                  },
                  style: 'cell.total',
                },
              },
            },
          ],
        },
      ],
    },
    {
      id: 'assumptions',
      title: 'Key Assumptions',
      layout: 'fullWidth',
      blocks: [
        {
          type: 'table',
          tableId: 'assumptions',
          columns: [
            { key: 'label', label: 'Assumption', type: 'text', align: 'left', width: 30 },
            { key: 'value', label: 'Value', type: 'text', align: 'right', width: 20 },
          ],
          rows: [
            {
              rowKey: 'wacc',
              labelCell: 'WACC',
              rowType: 'data',
              cells: {
                label: { value: 'WACC' },
                value: {
                  value: '9.5%',
                  meta: { status: 'user_provided' },
                  style: 'cell.input',
                },
              },
            },
            {
              rowKey: 'terminalGrowth',
              labelCell: 'Terminal Growth',
              rowType: 'data',
              cells: {
                label: { value: 'Terminal Growth' },
                value: {
                  value: '2.5%',
                  meta: { status: 'user_provided' },
                  style: 'cell.input',
                },
              },
            },
            {
              rowKey: 'taxRate',
              labelCell: 'Tax Rate',
              rowType: 'data',
              cells: {
                label: { value: 'Tax Rate' },
                value: {
                  value: '25.0%',
                  meta: { status: 'user_provided' },
                  style: 'cell.input',
                },
              },
            },
          ],
        },
      ],
    },
  ],
  globalStyles: DEFAULT_STYLE_TOKENS,
};

/**
 * Example 3: 3-Statement (Income Statement only)
 * 
 * Includes:
 * - Income statement table
 * - Multiple years
 * - Subtotal rows (EBITDA, EBIT)
 * - Total row (Net Income)
 */
export const EXAMPLE_THREE_STATEMENT: ModelDocument = {
  meta: {
    modelType: 'three-statement',
    companyName: 'Apple Inc.',
    ticker: 'AAPL',
    asOfDate: '2024-01-15',
    currency: 'USD',
    units: 'millions',
    generatedAt: '2024-01-15T10:30:00Z',
  },
  sections: [
    {
      id: 'header',
      title: 'AAPL - 3-Statement Model',
      layout: 'fullWidth',
      blocks: [
        {
          type: 'text',
          content: 'As of: January 15, 2024 | Currency: USD | Units: Millions',
        },
        {
          type: 'spacer',
          height: 1,
        },
      ],
    },
    {
      id: 'income-statement',
      title: 'Income Statement',
      layout: 'fullWidth',
      blocks: [
        {
          type: 'table',
          tableId: 'income-statement',
          columns: [
            { key: 'lineItem', label: 'Line Item', type: 'text', align: 'left', width: 30 },
            { key: 'y2023', label: '2023', type: 'currency', format: '$#,##0', align: 'right', width: 15 },
            { key: 'y2024', label: '2024', type: 'currency', format: '$#,##0', align: 'right', width: 15 },
            { key: 'y2025', label: '2025', type: 'currency', format: '$#,##0', align: 'right', width: 15 },
          ],
          rows: [
            {
              rowKey: 'header',
              rowType: 'header',
              cells: {
                lineItem: { value: 'Line Item' },
                y2023: { value: '2023' },
                y2024: { value: '2024' },
                y2025: { value: '2025' },
              },
              style: 'row.header',
            },
            {
              rowKey: 'revenue',
              labelCell: 'Revenue',
              rowType: 'data',
              cells: {
                lineItem: { value: 'Revenue' },
                y2023: { value: 333000, meta: { status: 'reported', source: 'SEC EDGAR' } },
                y2024: { value: 350000, meta: { status: 'derived', method: 'revenue * (1 + growth_rate)' } },
                y2025: { value: 367500, meta: { status: 'derived' } },
              },
            },
            {
              rowKey: 'cogs',
              labelCell: 'Cost of Goods Sold',
              rowType: 'data',
              indentLevel: 1,
              cells: {
                lineItem: { value: '  Cost of Goods Sold', meta: { status: 'reported' } },
                y2023: { value: 200000, meta: { status: 'reported' } },
                y2024: { value: 210000, meta: { status: 'derived' } },
                y2025: { value: 220500, meta: { status: 'derived' } },
              },
            },
            {
              rowKey: 'grossProfit',
              labelCell: 'Gross Profit',
              rowType: 'subtotal',
              cells: {
                lineItem: { value: 'Gross Profit', style: 'cell.subtotal' },
                y2023: { value: 133000, meta: { status: 'derived', method: 'revenue - cogs' } },
                y2024: { value: 140000, meta: { status: 'derived' } },
                y2025: { value: 147000, meta: { status: 'derived' } },
              },
              style: 'row.subtotal',
            },
            {
              rowKey: 'opex',
              labelCell: 'Operating Expenses',
              rowType: 'data',
              cells: {
                lineItem: { value: 'Operating Expenses' },
                y2023: { value: 50000, meta: { status: 'reported' } },
                y2024: { value: 52500, meta: { status: 'derived' } },
                y2025: { value: 55125, meta: { status: 'derived' } },
              },
            },
            {
              rowKey: 'ebitda',
              labelCell: 'EBITDA',
              rowType: 'subtotal',
              cells: {
                lineItem: { value: 'EBITDA', style: 'cell.subtotal' },
                y2023: { value: 130000, meta: { status: 'derived', method: 'gross_profit - opex' } },
                y2024: { value: 137500, meta: { status: 'derived' } },
                y2025: { value: 144375, meta: { status: 'derived' } },
              },
              style: 'row.subtotal',
            },
            {
              rowKey: 'da',
              labelCell: 'Depreciation & Amortization',
              rowType: 'data',
              indentLevel: 1,
              cells: {
                lineItem: { value: '  Depreciation & Amortization' },
                y2023: { value: 10000, meta: { status: 'reported' } },
                y2024: { value: 10500, meta: { status: 'derived' } },
                y2025: { value: 11025, meta: { status: 'derived' } },
              },
            },
            {
              rowKey: 'ebit',
              labelCell: 'EBIT',
              rowType: 'subtotal',
              cells: {
                lineItem: { value: 'EBIT', style: 'cell.subtotal' },
                y2023: { value: 120000, meta: { status: 'derived', method: 'ebitda - da' } },
                y2024: { value: 127000, meta: { status: 'derived' } },
                y2025: { value: 133350, meta: { status: 'derived' } },
              },
              style: 'row.subtotal',
            },
            {
              rowKey: 'interest',
              labelCell: 'Interest Expense',
              rowType: 'data',
              cells: {
                lineItem: { value: 'Interest Expense' },
                y2023: { value: 2000, meta: { status: 'reported' } },
                y2024: { value: 2100, meta: { status: 'derived' } },
                y2025: { value: 2205, meta: { status: 'derived' } },
              },
            },
            {
              rowKey: 'tax',
              labelCell: 'Tax Expense',
              rowType: 'data',
              cells: {
                lineItem: { value: 'Tax Expense' },
                y2023: { value: 29500, meta: { status: 'reported' } },
                y2024: { value: 31225, meta: { status: 'derived' } },
                y2025: { value: 32786, meta: { status: 'derived' } },
              },
            },
            {
              rowKey: 'netIncome',
              labelCell: 'Net Income',
              rowType: 'total',
              cells: {
                lineItem: { value: 'Net Income', style: 'cell.total' },
                y2023: { value: 88500, meta: { status: 'derived', method: 'ebit - interest - tax' } },
                y2024: { value: 93675, meta: { status: 'derived' } },
                y2025: { value: 98359, meta: { status: 'derived' } },
              },
              style: 'row.total',
            },
          ],
          grid: {
            freezePanes: { row: 1, column: 1 },
            columnWidths: {
              lineItem: 30,
              y2023: 15,
              y2024: 15,
              y2025: 15,
            },
          },
        },
      ],
    },
  ],
  globalStyles: DEFAULT_STYLE_TOKENS,
};
