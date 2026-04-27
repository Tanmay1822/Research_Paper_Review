"use client";

import { LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { login } from "@/utils/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      router.push("/dashboard/library");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] p-8 shadow-lg shadow-[rgba(60,53,47,0.08)]">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-[var(--primary)] flex items-center justify-center">
              <LogIn className="w-6 h-6 text-[var(--foreground)]" />
            </div>
            <h1 className="text-xl font-semibold text-[var(--foreground)]">Sign in</h1>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Email</label>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/35 focus:border-transparent transition-shadow"
                placeholder="you@example.com"
                suppressHydrationWarning
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Password</label>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/35 focus:border-transparent transition-shadow"
                suppressHydrationWarning
              />
            </div>
            {error && (
              <p className="rounded-lg bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[var(--primary)] py-3 font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              suppressHydrationWarning
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-[var(--muted)]">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium text-[var(--cta)] hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
