import React, { useState } from 'react';

export default function LboCard({ ticker, onGenerate, loading }) {
    const [assumptions, setAssumptions] = useState({
        entry_multiple: '10.0',
        exit_multiple: '10.0',
        equity_financing_percent: '40',
        revenue_growth_rate: '5.0'
    });

    const handleGenerateClick = () => {
        const processedAssumptions = {
            ...assumptions,
            revenue_growth_rate: parseFloat(assumptions.revenue_growth_rate) / 100, // Convert to decimal
            debt_financing_percent: 100 - parseFloat(assumptions.equity_financing_percent)
        };
        onGenerate(processedAssumptions);
    };

    return (
        <div className="card p-6 h-full">
            <h2 className="text-2xl font-bold mb-4">Leveraged Buyout (LBO)</h2>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium">Entry Multiple (EV/EBITDA)</label>
                    <input type="number" step="0.1" value={assumptions.entry_multiple} onChange={(e) => setAssumptions({...assumptions, entry_multiple: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-gray-800"/>
                </div>
                <div>
                    <label className="block text-sm font-medium">Equity Financing (%)</label>
                    <input type="number" step="1" min="0" max="100" value={assumptions.equity_financing_percent} onChange={(e) => setAssumptions({...assumptions, equity_financing_percent: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-gray-800"/>
                </div>
                <div>
                    <label className="block text-sm font-medium">Exit Multiple (EV/EBITDA)</label>
                    <input type="number" step="0.1" value={assumptions.exit_multiple} onChange={(e) => setAssumptions({...assumptions, exit_multiple: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-gray-800"/>
                </div>
                <div>
                    <label className="block text-sm font-medium">Annual Revenue Growth (%)</label>
                    <input type="number" step="0.1" value={assumptions.revenue_growth_rate} onChange={(e) => setAssumptions({...assumptions, revenue_growth_rate: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-gray-800"/>
                </div>
            </div>
            <button 
                onClick={handleGenerateClick} 
                disabled={loading || !ticker}
                className="w-full mt-6 py-2 px-4 font-semibold rounded-lg shadow-md text-white bg-blue-800 hover:bg-blue-900 disabled:bg-gray-500"
            >
                {loading ? 'Structuring LBO...' : 'Structure LBO'}
            </button>
        </div>
    );
}
