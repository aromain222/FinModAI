import React, { useState, useEffect } from 'react';
import MainScreen from './components/MainScreen';
import DcfPage from './components/DcfPage';
import LboPage from './components/LboPage';
import CompsPage from './components/CompsPage';

export default function App() {
    const [currentPage, setCurrentPage] = useState('main'); // 'main', 'dcf', 'lbo', 'comps'
    const [ticker, setTicker] = useState('');

    // Persist ticker to localStorage
    useEffect(() => {
        const savedTicker = localStorage.getItem('lastTicker');
        if (savedTicker) setTicker(savedTicker);
    }, []);

    useEffect(() => {
        if (ticker) localStorage.setItem('lastTicker', ticker);
    }, [ticker]);

    const handleSelectModel = (modelId) => {
        setCurrentPage(modelId);
    };

    const handleBackToMain = () => {
        setCurrentPage('main');
    };

    // Render based on current page
    return (
        <div className="min-h-screen" style={{ background: '#0B1F3A', color: '#FFFFFF', minHeight: '100vh' }}>
            {currentPage === 'main' && (
                <MainScreen onSelectModel={handleSelectModel} />
            )}
            {currentPage === 'dcf' && (
                <DcfPage ticker={ticker} setTicker={setTicker} onBack={handleBackToMain} />
            )}
            {currentPage === 'lbo' && (
                <LboPage ticker={ticker} setTicker={setTicker} onBack={handleBackToMain} />
            )}
            {currentPage === 'comps' && (
                <CompsPage ticker={ticker} setTicker={setTicker} onBack={handleBackToMain} />
            )}
        </div>
    );
}
