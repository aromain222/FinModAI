import React from 'react';

export default function FootballFieldChart({ data }) {
    if (!data || !data.valuation_ranges) return null;

    const allValues = [data.current_price, ...data.valuation_ranges.flatMap(r => [r.low, r.high])];
    const minVal = Math.min(...allValues) * 0.95;
    const maxVal = Math.max(...allValues) * 1.05;
    const totalRange = maxVal - minVal;

    const valueToPercent = (value) => {
        if (totalRange === 0) return 0;
        return ((value - minVal) / totalRange) * 100;
    };

    return (
        <div className="p-6">
            <h2 className="text-3xl font-bold mb-8 text-center">{data.ticker} Valuation Summary</h2>
            <div className="space-y-6 relative">
                {data.valuation_ranges.map((range, index) => (
                    <div key={index} className="grid grid-cols-5 items-center gap-4">
                        <div className="col-span-1 text-sm font-semibold text-right">{range.name}</div>
                        <div className="col-span-4 relative h-10 bg-gray-100 rounded">
                            <div 
                                className="absolute h-full bg-blue-400 opacity-70 rounded flex items-center justify-between px-2 text-xs font-mono text-white"
                                style={{ 
                                    left: `${valueToPercent(range.low)}%`,
                                    width: `${valueToPercent(range.high) - valueToPercent(range.low)}%`
                                }}
                            >
                               <span>${range.low.toFixed(2)}</span>
                               <span>${range.high.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                ))}
                {/* Current Price Line */}
                <div 
                    className="absolute top-0 w-0.5 bg-red-500"
                    style={{ 
                        left: `calc(20% + ${valueToPercent(data.current_price) * 0.8}%)`, // Adjust for the 1/5 label column
                        height: '100%' 
                    }}
                >
                    <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 text-xs text-red-500 font-bold whitespace-nowrap">
                        Current: ${data.current_price.toFixed(2)}
                    </span>
                </div>
            </div>
        </div>
    );
}
