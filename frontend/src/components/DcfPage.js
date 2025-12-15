import React, { useState } from 'react';
import ResultsDisplay from './ResultsDisplay';

export default function DcfPage({ ticker, setTicker, onBack }) {
    const [assumptions, setAssumptions] = useState({ wacc: '8.5', terminalGrowth: '2.5' });
    const [dcfResult, setDcfResult] = useState(null);
    const [sensitivityResult, setSensitivityResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [explanation, setExplanation] = useState({ text: null, loading: false });

    const handleGenerate = async () => {
        if (!ticker) return alert("Please enter a ticker symbol.");
        setLoading(true);
        try {
            const response = await fetch('/api/v1/generate-full-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model_type: 'dcf', ticker, assumptions })
            });
            const data = await response.json();
            setDcfResult(data.base_model);
            setSensitivityResult(data.sensitivity_analysis);
        } catch (error) {
            console.error('Error generating DCF:', error);
            alert('Failed to generate DCF model');
        } finally {
            setLoading(false);
        }
    };

    const handleExplainModel = async (modelName, modelData) => {
        setExplanation({ text: null, loading: true });
        try {
            const response = await fetch('/api/v1/explain-model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model_name: modelName, model_data: modelData })
            });
            const data = await response.json();
            setExplanation({ text: data.explanation, loading: false });
        } catch (error) {
            console.error("Error explaining model:", error);
            setExplanation({ text: "Could not generate explanation.", loading: false });
        }
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <button
                onClick={onBack}
                style={{
                    background: '#374151',
                    color: '#FFFFFF',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    cursor: 'pointer',
                    marginBottom: '2rem',
                    fontSize: '0.9rem'
                }}
            >
                ← Back to Main
            </button>

            <div className="card mb-8" style={{ background: '#FFFFFF', color: '#0B1F3A', padding: '2rem', borderRadius: '0.5rem' }}>
                <h1 className="text-4xl font-bold mb-6" style={{ color: '#0B1F3A' }}>Discounted Cash Flow (DCF) Model</h1>
                
                <div className="mb-6">
                    <label style={{ display: 'block', color: '#0B1F3A', fontWeight: '500', marginBottom: '0.5rem' }}>
                        Ticker Symbol
                    </label>
                    <input
                        type="text"
                        value={ticker}
                        onChange={(e) => setTicker(e.target.value.toUpperCase())}
                        placeholder="Enter Ticker (e.g., AAPL, SOFI)"
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: '0.5rem',
                            border: '1px solid #D1D5DB',
                            background: '#FFFFFF',
                            color: '#0B1F3A',
                            fontSize: '1rem'
                        }}
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                    <div>
                        <label style={{ display: 'block', color: '#0B1F3A', fontWeight: '500', marginBottom: '0.5rem' }}>
                            WACC (%)
                        </label>
                        <input
                            type="number"
                            step="0.1"
                            value={assumptions.wacc}
                            onChange={(e) => setAssumptions({...assumptions, wacc: e.target.value})}
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                borderRadius: '0.5rem',
                                border: '1px solid #D1D5DB',
                                background: '#FFFFFF',
                                color: '#0B1F3A'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: '#0B1F3A', fontWeight: '500', marginBottom: '0.5rem' }}>
                            Terminal Growth Rate (%)
                        </label>
                        <input
                            type="number"
                            step="0.1"
                            value={assumptions.terminalGrowth}
                            onChange={(e) => setAssumptions({...assumptions, terminalGrowth: e.target.value})}
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                borderRadius: '0.5rem',
                                border: '1px solid #D1D5DB',
                                background: '#FFFFFF',
                                color: '#0B1F3A'
                            }}
                        />
                    </div>
                </div>

                <button
                    onClick={handleGenerate}
                    disabled={loading || !ticker}
                    style={{
                        background: ticker ? '#0B1F3A' : '#9CA3AF',
                        color: '#FFFFFF',
                        padding: '0.75rem 2rem',
                        borderRadius: '0.5rem',
                        border: 'none',
                        fontWeight: '600',
                        cursor: ticker ? 'pointer' : 'not-allowed',
                        fontSize: '1rem',
                        width: '100%'
                    }}
                >
                    {loading ? 'Building DCF Model...' : 'Build DCF Model'}
                </button>
            </div>

            {loading && (
                <div className="card p-6 text-center" style={{ background: '#FFFFFF', color: '#0B1F3A' }}>
                    Generating DCF model...
                </div>
            )}

            {dcfResult && (
                <ResultsDisplay
                    dcfResult={dcfResult}
                    lboResult={null}
                    compsResult={null}
                    sensitivityResult={sensitivityResult}
                    ticker={ticker}
                    onExplainModel={handleExplainModel}
                />
            )}

            {explanation.text && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000
                    }}
                    onClick={() => setExplanation({text: null, loading: false})}
                >
                    <div
                        className="card"
                        style={{
                            background: '#FFFFFF',
                            color: '#0B1F3A',
                            padding: '2rem',
                            maxWidth: '600px',
                            borderRadius: '0.5rem'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-2xl font-bold mb-4">AI Model Explanation</h3>
                        <p style={{ marginBottom: '1rem', lineHeight: '1.6' }}>
                            {explanation.loading ? 'Analyzing...' : explanation.text}
                        </p>
                        <button
                            onClick={() => setExplanation({text: null, loading: false})}
                            style={{
                                background: '#0B1F3A',
                                color: '#FFFFFF',
                                padding: '0.5rem 1rem',
                                borderRadius: '0.5rem',
                                border: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

