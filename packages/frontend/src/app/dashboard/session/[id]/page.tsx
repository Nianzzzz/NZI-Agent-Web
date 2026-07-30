"use client";

import { use, useEffect, useState } from "react";
import SessionChat from "@/components/chat/SessionChat";

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolved = use(params);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="h-screen flex flex-col">
      <SessionChat sessionId={resolved.id} />
    </div>
  );
}
