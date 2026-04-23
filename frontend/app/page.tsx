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
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
