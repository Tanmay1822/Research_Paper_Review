"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { fetchCurrentUser } from "@/utils/api";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser()
      .then(() => {
        if (!cancelled) router.replace("/dashboard/library");
      })
      .catch(() => {
        if (!cancelled) router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
    </div>
  );
}
