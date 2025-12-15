import React from 'react';

export default function SkeletonLoader() {
    return (
        <div className="card p-6 animate-pulse">
            <div className="h-8 bg-gray-700 rounded w-1/2 mb-6 mx-auto"></div>
            <div className="h-6 bg-gray-700 rounded w-3/4 mb-8 mx-auto"></div>
            
            <div className="space-y-6">
                <div className="grid grid-cols-5 gap-4">
                    <div className="h-10 bg-gray-700 rounded col-span-1"></div>
                    <div className="h-10 bg-gray-600 rounded col-span-4"></div>
                </div>
                <div className="grid grid-cols-5 gap-4">
                    <div className="h-10 bg-gray-700 rounded col-span-1"></div>
                    <div className="h-10 bg-gray-600 rounded col-span-4"></div>
                </div>
                <div className="grid grid-cols-5 gap-4">
                    <div className="h-10 bg-gray-700 rounded col-span-1"></div>
                    <div className="h-10 bg-gray-600 rounded col-span-4"></div>
                </div>
            </div>
        </div>
    );
}
