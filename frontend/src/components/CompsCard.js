import React from 'react';

export default function CompsCard({ onGenerate, loading, ticker }) {
    return (
        <div className="card p-6">
            <h2 className="text-2xl font-bold mb-4">Comparable Company Analysis</h2>
            <p className="mb-4 text-gray-400">
                Uses AI to find a relevant peer group and calculates valuation based on market multiples.
            </p>
            <button 
                onClick={onGenerate} 
                disabled={loading || !ticker} 
                className="w-full md:w-auto py-2 px-6 font-semibold rounded-lg shadow-md text-white bg-blue-800 hover:bg-blue-900 disabled:bg-gray-500"
            >
                {loading ? 'Building Comps...' : 'Build Comps Model'}
            </button>
        </div>
    );
}
