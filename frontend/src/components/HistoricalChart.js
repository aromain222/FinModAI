import React, { useRef, useEffect } from 'react';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend } from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend);

export default function HistoricalChart({ data }) {
    const chartRef = useRef(null);

    useEffect(() => {
        if (!data || !chartRef.current) return;

        const ctx = chartRef.current.getContext('2d');
        const chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.years,
                datasets: [
                    {
                        label: 'Revenue ($M)',
                        data: data.revenue.map(val => val / 1e6), // Assuming data is in millions
                        backgroundColor: 'rgba(54, 162, 235, 0.6)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'EBITDA ($M)',
                        data: data.ebitda.map(val => val / 1e6), // Assuming data is in millions
                        backgroundColor: 'rgba(75, 192, 192, 0.6)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    title: {
                        display: true,
                        text: 'Historical Financial Performance'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString() + 'M';
                            }
                        }
                    }
                }
            }
        });

        // Cleanup function to destroy chart instance on component unmount
        return () => {
            chartInstance.destroy();
        };
    }, [data]);

    return (
        <div className="card p-6">
            <canvas ref={chartRef}></canvas>
        </div>
    );
}
