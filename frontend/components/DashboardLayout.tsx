import React from 'react';

interface DashboardLayoutProps {
    children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
    return (
        <div className="flex h-screen w-screen overflow-hidden bg-gray-100">
            {/* Fixed Sidebar */}
            <aside className="w-16 flex-shrink-0 bg-gray-900 flex flex-col items-center py-4">
                <div className="h-8 w-8 bg-blue-500 rounded mb-4" /> {/* Placeholder Logo */}
                {/* Placeholder Nav Items */}
                <div className="h-6 w-6 bg-gray-700 rounded mb-2" />
                <div className="h-6 w-6 bg-gray-700 rounded mb-2" />
                <div className="h-6 w-6 bg-gray-700 rounded mb-2" />
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                {children}
            </main>
        </div>
    );
}
