import React, { useState } from 'react';
import axios from 'axios';

function App() {
  const [ticker, setTicker] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const analyzeCompany = async () => {
    if (!ticker) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`/api/v1/analyze/${ticker}`);
      setAnalysis(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to analyze company');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900">FinModAI</h1>
          <p className="mt-2 text-lg text-gray-600">Professional Financial Analysis</p>
        </div>

        {/* Search Bar */}
        <div className="mt-8 flex justify-center">
          <div className="max-w-xl w-full">
            <div className="mt-1 flex rounded-md shadow-sm">
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="Enter ticker (e.g., AAPL)"
                className="flex-1 min-w-0 block w-full px-3 py-2 rounded-l-md border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              <button
                onClick={analyzeCompany}
                disabled={loading || !ticker}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-r-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {loading ? 'Analyzing...' : 'Analyze'}
              </button>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-4 text-center text-red-600">
            {error}
          </div>
        )}

        {/* Analysis Results */}
        {analysis && (
          <div className="mt-8 bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6">
              <h2 className="text-2xl font-bold text-gray-900">
                {analysis.name} ({analysis.ticker})
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {analysis.industry} | {analysis.sector}
              </p>
            </div>

            {/* Current Metrics */}
            <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium text-gray-900">Current Metrics</h3>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Price</dt>
                  <dd className="mt-1 text-lg text-gray-900">${analysis.current_price}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Market Cap</dt>
                  <dd className="mt-1 text-lg text-gray-900">${(analysis.market_cap / 1e9).toFixed(1)}B</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Revenue (TTM)</dt>
                  <dd className="mt-1 text-lg text-gray-900">${(analysis.revenue_ttm / 1e9).toFixed(1)}B</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">EBITDA Margin</dt>
                  <dd className="mt-1 text-lg text-gray-900">{(analysis.ebitda_margin * 100).toFixed(1)}%</dd>
                </div>
              </div>
            </div>

            {/* Investment Scores */}
            <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium text-gray-900">Investment Scores</h3>
              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Total Score</dt>
                  <dd className="mt-1 text-lg text-gray-900">{analysis.total_score.toFixed(1)}/100</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Financial Health</dt>
                  <dd className="mt-1 text-lg text-gray-900">{analysis.financial_health.toFixed(1)}/100</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Market Position</dt>
                  <dd className="mt-1 text-lg text-gray-900">{analysis.market_position.toFixed(1)}/100</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Growth Potential</dt>
                  <dd className="mt-1 text-lg text-gray-900">{analysis.growth_potential.toFixed(1)}/100</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Risk Profile</dt>
                  <dd className="mt-1 text-lg text-gray-900">{analysis.risk_profile.toFixed(1)}/100</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Management</dt>
                  <dd className="mt-1 text-lg text-gray-900">{analysis.management_quality.toFixed(1)}/100</dd>
                </div>
              </div>
            </div>

            {/* SWOT Analysis */}
            <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium text-gray-900">SWOT Analysis</h3>
              <div className="mt-3 grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <h4 className="text-base font-medium text-green-600">Strengths</h4>
                  <ul className="mt-2 text-sm text-gray-600 list-disc list-inside">
                    {analysis.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-base font-medium text-red-600">Weaknesses</h4>
                  <ul className="mt-2 text-sm text-gray-600 list-disc list-inside">
                    {analysis.weaknesses.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-base font-medium text-blue-600">Opportunities</h4>
                  <ul className="mt-2 text-sm text-gray-600 list-disc list-inside">
                    {analysis.opportunities.map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-base font-medium text-yellow-600">Threats</h4>
                  <ul className="mt-2 text-sm text-gray-600 list-disc list-inside">
                    {analysis.threats.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Recommendation */}
            <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium text-gray-900">Recommendation</h3>
              <div className="mt-3">
                <div className="flex items-center">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    analysis.recommendation === 'Buy' ? 'bg-green-100 text-green-800' :
                    analysis.recommendation === 'Hold' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {analysis.recommendation}
                  </span>
                  <span className="ml-3 text-sm text-gray-500">
                    Target Price: ${analysis.target_price} ({(analysis.upside_potential * 100).toFixed(1)}% upside)
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
