import React from 'react';

export default function MainScreen({ onSelectModel }) {
    const models = [
        {
            id: 'dcf',
            name: 'DCF Model',
            description: 'Discounted Cash Flow Valuation',
            icon: '💰'
        },
        {
            id: 'lbo',
            name: 'LBO Model',
            description: 'Leveraged Buyout Analysis',
            icon: '📊'
        },
        {
            id: 'comps',
            name: 'Comps Model',
            description: 'Comparable Company Analysis',
            icon: '📈'
        }
    ];

    return (
        <div style={{ 
            minHeight: '80vh', 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'center', 
            alignItems: 'center',
            padding: '2rem'
        }}>
            <h1 className="text-5xl font-bold mb-4" style={{ color: '#FFFFFF', marginBottom: '2rem' }}>
                Financial Modeling AI
            </h1>
            <p className="text-xl mb-12" style={{ color: '#9CA3AF' }}>
                Select a model to begin analysis
            </p>
            
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '2rem',
                width: '100%',
                maxWidth: '900px'
            }}>
                {models.map((model) => (
                    <div
                        key={model.id}
                        onClick={() => onSelectModel(model.id)}
                        style={{
                            background: '#FFFFFF',
                            color: '#0B1F3A',
                            padding: '2rem',
                            borderRadius: '0.75rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                            border: '2px solid transparent'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-4px)';
                            e.currentTarget.style.boxShadow = '0 8px 12px rgba(0, 0, 0, 0.15)';
                            e.currentTarget.style.borderColor = '#0B1F3A';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
                            e.currentTarget.style.borderColor = 'transparent';
                        }}
                    >
                        <div style={{ fontSize: '3rem', marginBottom: '1rem', textAlign: 'center' }}>
                            {model.icon}
                        </div>
                        <h2 className="text-2xl font-bold mb-2" style={{ color: '#0B1F3A', textAlign: 'center' }}>
                            {model.name}
                        </h2>
                        <p style={{ color: '#6B7280', textAlign: 'center', fontSize: '0.95rem' }}>
                            {model.description}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}

