import type { Metadata } from "next";
import { AuthGuard } from "@/components/auth/auth-guard";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "NZi Agent Web",
  description: "Agent Runtime Orchestration Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}
