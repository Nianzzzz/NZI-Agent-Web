"use client";

import Link from "next/link";
import { useSessionStore } from "@/lib/store";

export default function DashboardPage() {
  const { sessions, isLoading, createSession } = useSessionStore();

  const handleNewSession = async () => {
    await createSession({ title: "New Session" });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <button
            onClick={handleNewSession}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            + New Session
          </button>
        </div>

        {isLoading && <p className="text-gray-500">Loading sessions...</p>}

        {!isLoading && sessions.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg mb-2">No sessions yet</p>
            <p className="text-sm">Create your first session to get started.</p>
          </div>
        )}

        <div className="grid gap-4">
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/dashboard/session/${session.id}`}
              className="block p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
            >
              <h3 className="font-medium">{session.title || "Untitled Session"}</h3>
              <p className="text-sm text-gray-500 mt-1">
                {session.engine} · {session.metadata?.messageCount ?? 0} messages
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(session.createdAt).toLocaleString()}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
