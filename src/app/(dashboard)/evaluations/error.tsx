"use client";

export default function EvaluationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6">
      <h2 className="text-lg font-semibold text-red-800">Evaluation error</h2>
      <p className="mt-2 text-sm text-red-700">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-md bg-red-700 px-4 py-2 text-sm text-white"
      >
        Try again
      </button>
    </div>
  );
}
