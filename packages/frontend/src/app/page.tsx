export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">NZi Agent Web</h1>
        <p className="text-gray-500">Agent Runtime Orchestration Platform</p>
        <p className="text-gray-400 text-sm mt-2">
          <a href="/dashboard" className="text-blue-500 hover:underline">
            Go to Dashboard →
          </a>
        </p>
      </div>
    </main>
  );
}
