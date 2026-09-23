"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  reviewOvertimeRequest,
  type OvertimeRequestItem,
} from "@/lib/actions/overtime";
import { formatHours } from "@/lib/utils";

export interface OvertimeRequestListProps {
  items: OvertimeRequestItem[];
  canReview: boolean;
  onUpdated?: () => void;
}

function statusBadge(status: OvertimeRequestItem["status"]) {
  switch (status) {
    case "APPROVED_CLIENT":
      return <Badge variant="success">Approved</Badge>;
    case "REJECTED_CLIENT":
      return <Badge variant="destructive">Rejected</Badge>;
    default:
      return <Badge variant="warning">Pending</Badge>;
  }
}

export function OvertimeRequestList({
  items,
  canReview,
  onUpdated,
}: OvertimeRequestListProps) {
  const [isPending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  function handleReview(
    requestId: string,
    decision: "APPROVED_CLIENT" | "REJECTED_CLIENT"
  ) {
    setActiveId(requestId);
    startTransition(async () => {
      const result = await reviewOvertimeRequest({
        requestId,
        decision,
        reviewNote: notes[requestId],
      });

      setActiveId(null);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(
        decision === "APPROVED_CLIENT"
          ? "Overtime approved"
          : "Overtime rejected"
      );
      onUpdated?.();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Overtime requests</CardTitle>
        <CardDescription>
          Workflow: PENDING → APPROVED_CLIENT / REJECTED_CLIENT
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">No overtime requests yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Developer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead className="hidden md:table-cell">Reason</TableHead>
                <TableHead>Status</TableHead>
                {canReview && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.developerName}
                  </TableCell>
                  <TableCell>{item.workDate}</TableCell>
                  <TableCell>{formatHours(item.requestedHours)}</TableCell>
                  <TableCell className="hidden max-w-xs md:table-cell">
                    <p className="line-clamp-2 text-sm">{item.reason}</p>
                    {item.reviewNote && (
                      <p className="mt-1 text-xs text-slate-500">
                        Note: {item.reviewNote}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>{statusBadge(item.status)}</TableCell>
                  {canReview && (
                    <TableCell>
                      {item.status === "PENDING" ? (
                        <div className="space-y-2 min-w-[180px]">
                          <Textarea
                            placeholder="Review note (required to reject)"
                            value={notes[item.id] ?? ""}
                            onChange={(e) =>
                              setNotes((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            className="min-h-[60px] text-xs"
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              disabled={isPending && activeId === item.id}
                              onClick={() =>
                                handleReview(item.id, "APPROVED_CLIENT")
                              }
                            >
                              {isPending && activeId === item.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Check className="h-3 w-3" />
                              )}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={isPending && activeId === item.id}
                              onClick={() =>
                                handleReview(item.id, "REJECTED_CLIENT")
                              }
                            >
                              <X className="h-3 w-3" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
