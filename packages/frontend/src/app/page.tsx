"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2 } from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";

export default function Home() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    // Small delay to allow zustand persist to rehydrate
    const timer = setTimeout(() => {
      router.replace(isAuthenticated ? "/dashboard" : "/login");
    }, 300);
    return () => clearTimeout(timer);
  }, [isAuthenticated, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30">
          <Bot className="h-7 w-7 text-white" />
        </div>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    </main>
  );
}
