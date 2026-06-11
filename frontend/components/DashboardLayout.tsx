import React from 'react';

interface DashboardLayoutProps {
    children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
    return (
        <div className="flex h-screen w-screen overflow-hidden bg-[var(--background)]">
            {/* Fixed Sidebar */}
            <aside className="flex w-16 flex-shrink-0 flex-col items-center bg-[var(--surface-elevated)] py-4">
                <div className="mb-4 h-8 w-8 rounded bg-[var(--primary)]" /> {/* Placeholder Logo */}
                {/* Placeholder Nav Items */}
                <div className="mb-2 h-6 w-6 rounded bg-[var(--accent)]" />
                <div className="mb-2 h-6 w-6 rounded bg-[var(--accent)]" />
                <div className="mb-2 h-6 w-6 rounded bg-[var(--accent)]" />
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                {children}
            </main>
        </div>
    );
}
