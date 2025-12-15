import React from 'react';

export default function AiInsights({ data }) {
    if (!data || !data.risks || !data.catalysts) {
        return null;
    }

    return (
        <div className="card mt-8 p-6">
            <h2 className="text-3xl font-bold mb-4 text-center">AI-Generated Insights</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <h3 className="text-xl font-semibold text-red-500 mb-2">Key Risks</h3>
                    <ul className="list-disc pl-5 space-y-2 text-gray-300">
                        {data.risks.map((risk, i) => (
                            <li key={`risk-${i}`}>{risk}</li>
                        ))}
                    </ul>
                </div>
                <div>
                    <h3 className="text-xl font-semibold text-green-500 mb-2">Potential Catalysts</h3>
                    <ul className="list-disc pl-5 space-y-2 text-gray-300">
                        {data.catalysts.map((catalyst, i) => (
                            <li key={`catalyst-${i}`}>{catalyst}</li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}
