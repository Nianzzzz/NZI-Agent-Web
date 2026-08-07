"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";

const PUBLIC_PATHS = new Set(["/login", "/register"]);

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated && !PUBLIC_PATHS.has(pathname)) {
      router.replace("/login");
    } else if (isAuthenticated && PUBLIC_PATHS.has(pathname)) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, pathname, router]);

  // While hydrating, render nothing to avoid flicker
  if (!isAuthenticated && !PUBLIC_PATHS.has(pathname)) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-sm">Redirecting to login…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
