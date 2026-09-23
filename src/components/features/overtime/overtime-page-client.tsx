"use client";

import { useRouter } from "next/navigation";
import { OvertimeRequestForm } from "@/components/features/overtime/overtime-request-form";
import { OvertimeRequestList } from "@/components/features/overtime/overtime-request-list";
import type { OvertimeRequestItem } from "@/lib/actions/overtime";

export interface OvertimePageClientProps {
  items: OvertimeRequestItem[];
  showForm: boolean;
  canReview: boolean;
}

export function OvertimePageClient({
  items,
  showForm,
  canReview,
}: OvertimePageClientProps) {
  const router = useRouter();

  function refresh() {
    router.refresh();
  }

  return (
    <div className="page-stack">
      {showForm && <OvertimeRequestForm onSuccess={refresh} />}
      <OvertimeRequestList
        items={items}
        canReview={canReview}
        onUpdated={refresh}
      />
    </div>
  );
}
