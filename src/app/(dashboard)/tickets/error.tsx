"use client";

export default function TicketsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-800">
      <h2 className="text-sm font-semibold">Unable to load tickets</h2>
      <p className="mt-1 text-[12px]">{error.message}</p>
      <button
        type="button"
        className="mt-3 text-[12px] underline"
        onClick={reset}
      >
        Try again
      </button>
    </div>
  );
}
