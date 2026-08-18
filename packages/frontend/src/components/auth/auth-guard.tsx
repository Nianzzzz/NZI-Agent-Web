"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";

const PUBLIC_PATHS = new Set(["/login", "/register"]);

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  // 等待 zustand persist 从 localStorage 恢复后再做路由判断，
  // 避免刷新时因 isAuth 短暂为 false 而被错误重定向到 /login → /dashboard，
  // 导致当前页面（如 /dashboard/session/[id]）丢失。
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const store = useAuthStore as unknown as {
      persist?: { hasHydrated?: () => boolean; onFinish?: (cb: () => void) => () => void };
    };
    if (store.persist?.hasHydrated?.()) {
      setIsReady(true);
    } else {
      const unsub = store.persist?.onFinish?.(() => {
        setIsReady(true);
        unsub?.();
      });
      return unsub;
    }
  }, []);

  useEffect(() => {
    if (!isReady) return;
    if (!isAuthenticated && !PUBLIC_PATHS.has(pathname)) {
      router.replace("/login");
    } else if (isAuthenticated && PUBLIC_PATHS.has(pathname)) {
      router.replace("/dashboard");
    }
  }, [isReady, isAuthenticated, pathname, router]);

  // 恢复完成前渲染 loading，避免闪烁
  if (!isReady) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-sm">Loading…</p>
        </div>
      </div>
    );
  }

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
