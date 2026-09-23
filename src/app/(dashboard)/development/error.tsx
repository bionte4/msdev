"use client";

export default function DevelopmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-4">
      <h2 className="text-[13px] font-semibold text-red-800">
        Development error
      </h2>
      <p className="mt-1 text-[12px] text-red-700">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-3 rounded-md bg-red-700 px-3 py-1.5 text-[12px] text-white"
      >
        Try again
      </button>
    </div>
  );
}
