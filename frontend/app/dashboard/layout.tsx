"use client";

import {
  Bell,
  BookOpen,
  LogOut,
  MessageSquare,
  Scale,
  Search,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchCurrentUser, logout } from "@/utils/api";

const nav = [
  { href: "/dashboard/library", label: "Library", icon: BookOpen },
  { href: "/dashboard/chat", label: "Chat Workspace", icon: MessageSquare },
  { href: "/dashboard/compare", label: "Compare Papers", icon: Scale },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [userInitial, setUserInitial] = useState("U");

  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser()
      .then((user) => {
        if (!cancelled && user?.email) {
          setUserInitial(user.email[0].toUpperCase());
        }
      })
      .catch(() => {
        if (!cancelled) router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleLogout = async () => {
    await logout().catch(() => undefined);
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="flex h-screen flex-col bg-[#131b20]">
      {/* ── Top Navigation Bar ── */}
      <header className="flex flex-shrink-0 items-center gap-4 border-b border-white/5 bg-[#1a2329] px-6 py-3">
        {/* Brand */}
        <div className="flex w-44 flex-shrink-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-400/20">
            <BookOpen className="h-4 w-4 text-yellow-400" />
          </div>
          <span className="text-sm font-semibold text-white">Research Assistant</span>
        </div>

        {/* Nav Links */}
        <nav className="flex items-center gap-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150 ${
                  active
                    ? "bg-yellow-400/10 text-yellow-400"
                    : "text-gray-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Search Bar */}
        <div className="mx-auto w-full max-w-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
            <input
              type="text"
              placeholder="Search here..."
              className="w-full rounded-xl border border-white/5 bg-[#131b20] py-2 pl-9 pr-4 text-sm text-gray-300 placeholder-gray-600 focus:border-yellow-400/30 focus:outline-none focus:ring-1 focus:ring-yellow-400/20"
              suppressHydrationWarning
            />
          </div>
        </div>

        {/* Right: Notifications + Logout + Avatar */}
        <div className="ml-auto flex items-center gap-2">
          <button suppressHydrationWarning className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white">
            <Bell className="h-4 w-4" />
          </button>
          <button
            onClick={handleLogout}
            title="Logout"
            suppressHydrationWarning
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-gray-400 transition-colors hover:bg-red-400/10 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow-400/20">
            <span className="text-sm font-semibold text-yellow-400">{userInitial}</span>
          </div>
        </div>
      </header>

      {/* Page Content */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
