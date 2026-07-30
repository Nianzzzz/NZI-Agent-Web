import type { Metadata } from "next";

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
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
