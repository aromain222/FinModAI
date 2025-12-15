import React, { useState } from 'react';
import ResultsDisplay from './ResultsDisplay';

export default function CompsPage({ ticker, setTicker, onBack }) {
    const [compsResult, setCompsResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [explanation, setExplanation] = useState({ text: null, loading: false });

    const handleGenerate = async () => {
        if (!ticker) return alert("Please enter a ticker symbol.");
        setLoading(true);
        try {
            const response = await fetch('/api/v1/generate-comps-model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker })
            });
            const data = await response.json();
            setCompsResult(data);
        } catch (error) {
            console.error('Error generating Comps:', error);
            alert('Failed to generate Comps model');
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
                <h1 className="text-4xl font-bold mb-6" style={{ color: '#0B1F3A' }}>Comparable Company Analysis (Comps)</h1>
                
                <p style={{ color: '#6B7280', marginBottom: '2rem', lineHeight: '1.6' }}>
                    This model uses AI to identify a relevant peer group and calculates valuation based on market multiples (EV/Revenue, EV/EBITDA, P/E).
                </p>
                
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
                    {loading ? 'Building Comps Model...' : 'Build Comps Model'}
                </button>
            </div>

            {loading && (
                <div className="card p-6 text-center" style={{ background: '#FFFFFF', color: '#0B1F3A' }}>
                    Generating Comps model...
                </div>
            )}

            {compsResult && (
                <ResultsDisplay
                    dcfResult={null}
                    lboResult={null}
                    compsResult={compsResult}
                    sensitivityResult={null}
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

