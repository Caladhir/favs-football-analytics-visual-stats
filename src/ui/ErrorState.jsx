export default function ErrorState({ error, onRetry }) {
  return (
    <div className="min-h-screen bg-muted rounded-3xl p-1">
      <div className="flex justify-center my-4">
        <div className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-medium">
          ❌ Error loading matches
        </div>
      </div>
      <p className="text-center text-foreground mt-6 text-lg">Error: {error}</p>
      <div className="flex justify-center mt-4">
        <button
          onClick={onRetry}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
