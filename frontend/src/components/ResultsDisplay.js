import React from 'react';

// --- Helper Functions ---
const formatNumber = (num, decimals = 1) => {
    if (num === null || num === undefined) return 'N/A';
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    if (absNum >= 1e12) return `${sign}$${(absNum / 1e12).toFixed(decimals)}T`;
    if (absNum >= 1e9) return `${sign}$${(absNum / 1e9).toFixed(decimals)}B`;
    if (absNum >= 1e6) return `${sign}$${(absNum / 1e6).toFixed(decimals)}M`;
    return `${sign}$${num.toFixed(decimals)}`;
};

const getColorForValue = (value, min, max) => {
    const range = max - min;
    if (range === 0 || isNaN(value) || value === null) return '#F3F4F6'; // gray-100
    const normalized = (value - min) / range;
    const hue = (normalized * 120).toString(10); // 0 (red) to 120 (green)
    return `hsl(${hue}, 70%, 85%)`;
};

// --- Sub-Components ---

function LboResults({ data, ticker, onExplain }) {
    if(!data.returns) return null;
    return (
        <div id="lbo-results" className="card p-6">
            <h2 className="text-3xl font-bold mb-4 text-center">{ticker} LBO Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                <div className="p-4 bg-gray-100 rounded-lg"><h3 className="text-lg font-semibold text-gray-600">IRR</h3><p className="text-4xl font-bold text-green-600">{data.returns.irr.toFixed(1)}%</p></div>
                <div className="p-4 bg-gray-100 rounded-lg"><h3 className="text-lg font-semibold text-gray-600">Multiple of Money</h3><p className="text-4xl font-bold text-green-600">{data.returns.mom.toFixed(1)}x</p></div>
                <div className="p-4 bg-gray-100 rounded-lg"><h3 className="text-lg font-semibold text-gray-600">Entry Equity</h3><p className="text-2xl font-bold text-gray-800">{formatNumber(data.returns.entry_equity, 0)}</p></div>
            </div>
            {/* Additional details like Sources & Uses can be added here */}
            <div className="text-center mt-4">
                 <button onClick={() => onExplain('LBO', data)} className="text-sm text-blue-600 hover:underline">Explain this Model</button>
            </div>
        </div>
    );
}

function CompsResults({ data, ticker }) {
    // ... Implementation for Comps results table ...
}

function SensitivityResults({ data }) {
    // ... Implementation for Sensitivity results heatmap ...
}

// --- Main Component ---

export default function ResultsDisplay({ dcfResult, lboResult, compsResult, sensitivityResult, ticker, onExplainModel }) {
    const hasResults = dcfResult || lboResult || compsResult || sensitivityResult;
    if (!hasResults) return null;

    return (
        <div className="mt-8 space-y-8">
            {dcfResult && (
                 <div className="card p-6">
                    {/* Simplified DCF result display */}
                    <h2 className="text-3xl font-bold mb-4 text-center">{ticker} DCF Summary</h2>
                    <p className="text-center text-4xl font-bold">{formatNumber(dcfResult.implied_share_price, 2)}</p>
                    <p className="text-center text-gray-500">Implied Share Price</p>
                    <div className="text-center mt-4">
                        <button onClick={() => onExplainModel('DCF', dcfResult)} className="text-sm text-blue-600 hover:underline">Explain this Model</button>
                    </div>
                </div>
            )}
            {lboResult && <LboResults data={lboResult} ticker={ticker} onExplain={onExplainModel} />}
            {compsResult && <CompsResults data={compsResult} ticker={ticker} />}
            {sensitivityResult && <SensitivityResults data={sensitivityResult} />}
        </div>
    );
}
