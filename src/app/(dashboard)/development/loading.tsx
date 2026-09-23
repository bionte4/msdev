import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="page-stack">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
