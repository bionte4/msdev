"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  cancelLeaveRequest,
  createLeaveRequest,
  reviewLeaveRequest,
  updateLeaveRequest,
  type LeavePermissions,
  type LeaveRequestItem,
} from "@/lib/actions/leave";

export interface LeaveCrudProps {
  items: LeaveRequestItem[];
  permissions: LeavePermissions;
  developers: { id: string; name: string }[];
  currentDeveloperId?: string | null;
}

const LEAVE_LABELS: Record<LeaveRequestItem["leaveType"], string> = {
  ANNUAL_LEAVE: "Cuti",
  SICK: "Sakit",
  UNPAID: "Unpaid",
  OTHER: "Other",
};

function statusBadge(status: LeaveRequestItem["status"]) {
  switch (status) {
    case "APPROVED":
      return <Badge variant="success">Approved</Badge>;
    case "REJECTED":
      return <Badge variant="destructive">Rejected</Badge>;
    case "CANCELLED":
      return <Badge variant="secondary">Cancelled</Badge>;
    default:
      return <Badge variant="warning">Pending</Badge>;
  }
}

interface FormState {
  id?: string;
  developerId: string;
  leaveType: LeaveRequestItem["leaveType"];
  startDate: string;
  endDate: string;
  reason: string;
}

function emptyForm(developerId?: string | null): FormState {
  return {
    developerId: developerId ?? "",
    leaveType: "ANNUAL_LEAVE",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    reason: "",
  };
}

export function LeaveCrud({
  items,
  permissions,
  developers,
  currentDeveloperId,
}: LeaveCrudProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(currentDeveloperId)
  );
  const [notes, setNotes] = useState<Record<string, string>>({});

  function refresh() {
    router.refresh();
  }

  function openCreate() {
    setForm(emptyForm(currentDeveloperId));
    setOpen(true);
  }

  function openEdit(item: LeaveRequestItem) {
    setForm({
      id: item.id,
      developerId: item.developerId,
      leaveType: item.leaveType,
      startDate: item.startDate,
      endDate: item.endDate,
      reason: item.reason,
    });
    setOpen(true);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      if (form.id) {
        const result = await updateLeaveRequest({
          id: form.id,
          leaveType: form.leaveType,
          startDate: new Date(form.startDate),
          endDate: new Date(form.endDate),
          reason: form.reason,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Leave request updated");
      } else {
        const result = await createLeaveRequest({
          developerId: form.developerId || undefined,
          leaveType: form.leaveType,
          startDate: new Date(form.startDate),
          endDate: new Date(form.endDate),
          reason: form.reason,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Leave request submitted");
      }
      setOpen(false);
      refresh();
    });
  }

  function handleReview(
    id: string,
    decision: "APPROVED" | "REJECTED"
  ) {
    startTransition(async () => {
      const result = await reviewLeaveRequest({
        id,
        decision,
        reviewNote: notes[id],
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        decision === "APPROVED" ? "Leave approved" : "Leave rejected"
      );
      refresh();
    });
  }

  function handleCancel(id: string) {
    if (!window.confirm("Cancel this leave request?")) return;
    startTransition(async () => {
      const result = await cancelLeaveRequest({ id });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Leave cancelled");
      refresh();
    });
  }

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-slate-500">
          Cuti / sakit / unpaid · approval workflow
        </p>
        {permissions.canCreate && (
          <Button size="sm" onClick={openCreate} disabled={isPending}>
            <Plus className="h-3.5 w-3.5" />
            Request leave
          </Button>
        )}
      </div>

      {open && permissions.canCreate && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>
                {form.id ? "Edit leave request" : "New leave request"}
              </CardTitle>
              <CardDescription>
                Pending requests can still be edited or cancelled
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-2.5">
              <div className="grid gap-2.5 sm:grid-cols-2">
                {permissions.canSelectDeveloper && (
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Developer</Label>
                    <Select
                      value={form.developerId}
                      onValueChange={(v) =>
                        setForm((p) => ({ ...p, developerId: v }))
                      }
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select developer" />
                      </SelectTrigger>
                      <SelectContent>
                        {developers.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select
                    value={form.leaveType}
                    onValueChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        leaveType: v as LeaveRequestItem["leaveType"],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(LEAVE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="startDate">Start</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={form.startDate}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, startDate: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="endDate">End</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={form.endDate}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, endDate: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="reason">Reason</Label>
                  <Textarea
                    id="reason"
                    value={form.reason}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, reason: e.target.value }))
                    }
                    required
                    minLength={5}
                  />
                </div>
              </div>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {form.id ? "Save changes" : "Submit request"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Leave requests</CardTitle>
          <CardDescription>
            {items.length} request{items.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-[12px] text-slate-500">No leave requests yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Developer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="hidden md:table-cell">Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.developerName}</div>
                      <div className="line-clamp-1 text-[11px] text-slate-500">
                        {item.reason}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {LEAVE_LABELS[item.leaveType]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden tabular-nums md:table-cell">
                      {item.startDate} → {item.endDate}
                      <span className="ml-1 text-slate-400">
                        ({item.totalDays}d)
                      </span>
                    </TableCell>
                    <TableCell>{statusBadge(item.status)}</TableCell>
                    <TableCell>
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap gap-1">
                          {item.canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={isPending}
                              onClick={() => openEdit(item)}
                              aria-label="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {item.canCancel && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7"
                              disabled={isPending}
                              onClick={() => handleCancel(item.id)}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                        {item.canReview && (
                          <div className="min-w-[160px] space-y-1">
                            <Textarea
                              className="min-h-[48px] text-[11px]"
                              placeholder="Review note (required to reject)"
                              value={notes[item.id] ?? ""}
                              onChange={(e) =>
                                setNotes((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                            />
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                className="h-7"
                                disabled={isPending}
                                onClick={() =>
                                  handleReview(item.id, "APPROVED")
                                }
                              >
                                <Check className="h-3 w-3" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7"
                                disabled={isPending}
                                onClick={() =>
                                  handleReview(item.id, "REJECTED")
                                }
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        )}
                        {!item.canEdit &&
                          !item.canCancel &&
                          !item.canReview && (
                            <span className="text-[11px] text-slate-400">
                              View
                            </span>
                          )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
