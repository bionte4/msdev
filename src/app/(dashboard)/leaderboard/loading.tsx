import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="page-stack">
      <div className="space-y-1.5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3 w-64" />
      </div>
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-2.5 sm:grid-cols-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
