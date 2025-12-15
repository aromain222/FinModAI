import React, { useState } from 'react';

export default function DcfCard({ ticker, onGenerate, loading }) {
    const [assumptions, setAssumptions] = useState({ wacc: '8.5', terminalGrowth: '2.5' });

    const handleGenerateClick = () => {
        onGenerate(assumptions);
    };

    return (
        <div className="card p-6 h-full">
            <h2 className="text-2xl font-bold mb-4">Discounted Cash Flow (DCF)</h2>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium">WACC (%)</label>
                    <input 
                        type="number" 
                        step="0.1" 
                        value={assumptions.wacc} 
                        onChange={(e) => setAssumptions({...assumptions, wacc: e.target.value})} 
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-gray-800"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium">Terminal Growth Rate (%)</label>
                    <input 
                        type="number" 
                        step="0.1" 
                        value={assumptions.terminalGrowth} 
                        onChange={(e) => setAssumptions({...assumptions, terminalGrowth: e.target.value})} 
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-gray-800"
                    />
                </div>
            </div>
            <button 
                onClick={handleGenerateClick} 
                disabled={loading || !ticker} 
                className="w-full mt-6 py-2 px-4 font-semibold rounded-lg shadow-md text-white bg-blue-800 hover:bg-blue-900 disabled:bg-gray-500"
            >
                {loading ? 'Building DCF...' : 'Build DCF Model'}
            </button>
        </div>
    );
}
