"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, UserRoundX, X } from "lucide-react";
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
  cancelCoverage,
  createCoverage,
  updateCoverage,
  type CoverageItem,
  type CoverageOption,
  type CoveragePermissions,
} from "@/lib/actions/coverage";

export interface CoverageCrudProps {
  items: CoverageItem[];
  permissions: CoveragePermissions;
  projects: CoverageOption[];
  developers: CoverageOption[];
  leaveOptions: CoverageOption[];
}

interface FormState {
  id?: string;
  projectId: string;
  absentDeveloperId: string;
  coverDeveloperId: string;
  leaveRequestId: string;
  startDate: string;
  endDate: string;
  reason: string;
  notes: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
}

function emptyForm(
  projectId: string,
  absentId: string,
  coverId: string
): FormState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    projectId,
    absentDeveloperId: absentId,
    coverDeveloperId: coverId,
    leaveRequestId: "",
    startDate: today,
    endDate: today,
    reason: "",
    notes: "",
    status: "PLANNED",
  };
}

function statusVariant(
  status: CoverageItem["status"]
): "secondary" | "success" | "warning" | "destructive" {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "COMPLETED":
      return "secondary";
    case "CANCELLED":
      return "destructive";
    default:
      return "warning";
  }
}

export function CoverageCrud({
  items,
  permissions,
  projects,
  developers,
  leaveOptions,
}: CoverageCrudProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const defaultAbsent = developers[0]?.id ?? "";
  const defaultCover = developers[1]?.id ?? developers[0]?.id ?? "";
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(projects[0]?.id ?? "", defaultAbsent, defaultCover)
  );

  const leaveForAbsent = useMemo(
    () =>
      leaveOptions.filter(
        (l) => !form.absentDeveloperId || l.name === form.absentDeveloperId
      ),
    [leaveOptions, form.absentDeveloperId]
  );

  function refresh() {
    router.refresh();
  }

  function openCreate() {
    setForm(
      emptyForm(projects[0]?.id ?? "", defaultAbsent, defaultCover)
    );
    setOpen(true);
  }

  function openEdit(item: CoverageItem) {
    setForm({
      id: item.id,
      projectId: item.projectId,
      absentDeveloperId: item.absentDeveloperId,
      coverDeveloperId: item.coverDeveloperId,
      leaveRequestId: item.leaveRequestId ?? "",
      startDate: item.startDate,
      endDate: item.endDate,
      reason: item.reason,
      notes: item.notes ?? "",
      status: item.status,
    });
    setOpen(true);
  }

  function applyLeaveDefaults(leaveId: string) {
    setForm((p) => {
      const leave = leaveOptions.find((l) => l.id === leaveId);
      if (!leave) return { ...p, leaveRequestId: leaveId };
      const parts = leave.label?.split(" · ") ?? [];
      const range = parts[2]?.split("→") ?? [];
      return {
        ...p,
        leaveRequestId: leaveId,
        absentDeveloperId: leave.name,
        startDate: range[0] ?? p.startDate,
        endDate: range[1]?.split(" ")[0] ?? p.endDate,
        reason:
          p.reason ||
          `Coverage for ${parts[0] ?? "leave"} (${parts[1] ?? "leave"})`,
      };
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.endDate < form.startDate) {
      toast.error("End date must be on or after start date");
      return;
    }
    startTransition(async () => {
      if (form.id) {
        const result = await updateCoverage({
          id: form.id,
          projectId: form.projectId,
          absentDeveloperId: form.absentDeveloperId,
          coverDeveloperId: form.coverDeveloperId,
          leaveRequestId: form.leaveRequestId || null,
          startDate: new Date(form.startDate),
          endDate: new Date(form.endDate),
          reason: form.reason,
          notes: form.notes || null,
          status: form.status,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Coverage updated");
      } else {
        const result = await createCoverage({
          projectId: form.projectId,
          absentDeveloperId: form.absentDeveloperId,
          coverDeveloperId: form.coverDeveloperId,
          leaveRequestId: form.leaveRequestId || null,
          startDate: new Date(form.startDate),
          endDate: new Date(form.endDate),
          reason: form.reason,
          notes: form.notes || null,
          status: form.status,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Coverage assigned");
      }
      setOpen(false);
      refresh();
    });
  }

  function handleCancel(item: CoverageItem) {
    if (!window.confirm(`Cancel coverage for ${item.absentDeveloperName}?`)) {
      return;
    }
    startTransition(async () => {
      const result = await cancelCoverage({ id: item.id });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Coverage cancelled");
      refresh();
    });
  }

  const canShowForm =
    open &&
    ((form.id && permissions.canEdit) || (!form.id && permissions.canCreate));

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-slate-500">
          Sick / leave coverage with start & end dates (not scope swap)
        </p>
        {permissions.canCreate && (
          <Button
            size="sm"
            onClick={openCreate}
            disabled={isPending || projects.length === 0 || developers.length < 2}
          >
            <Plus className="h-3.5 w-3.5" />
            Assign coverage
          </Button>
        )}
      </div>

      {canShowForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>
                {form.id ? "Edit coverage" : "Assign coverage"}
              </CardTitle>
              <CardDescription>
                Pengganti sementara saat engineer sakit / cuti
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
                <div className="space-y-1 sm:col-span-2">
                  <Label>Link leave (optional)</Label>
                  <Select
                    value={form.leaveRequestId || "__none__"}
                    onValueChange={(v) => {
                      if (v === "__none__") {
                        setForm((p) => ({ ...p, leaveRequestId: "" }));
                        return;
                      }
                      applyLeaveDefaults(v);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select leave request" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No linked leave</SelectItem>
                      {leaveForAbsent.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.label ?? l.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Project</Label>
                  <Select
                    value={form.projectId}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, projectId: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        status: v as FormState["status"],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"].map(
                        (s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Absent (on leave / sick)</Label>
                  <Select
                    value={form.absentDeveloperId}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, absentDeveloperId: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
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
                <div className="space-y-1">
                  <Label>Cover (pengganti)</Label>
                  <Select
                    value={form.coverDeveloperId}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, coverDeveloperId: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
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
                <div className="space-y-1">
                  <Label htmlFor="cov-start">Start date</Label>
                  <Input
                    id="cov-start"
                    type="date"
                    value={form.startDate}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, startDate: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cov-end">End date</Label>
                  <Input
                    id="cov-end"
                    type="date"
                    value={form.endDate}
                    min={form.startDate}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, endDate: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="cov-reason">Reason</Label>
                  <Textarea
                    id="cov-reason"
                    value={form.reason}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, reason: e.target.value }))
                    }
                    placeholder="e.g. Sick leave coverage for sprint delivery"
                    required
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="cov-notes">Notes</Label>
                  <Textarea
                    id="cov-notes"
                    value={form.notes}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, notes: e.target.value }))
                    }
                  />
                </div>
              </div>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {form.id ? "Save coverage" : "Create coverage"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Coverage assignments</CardTitle>
          <CardDescription>
            {items.length} record(s) · linked leave optional
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Absent → Cover</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Leave</TableHead>
                {(permissions.canEdit || permissions.canCancel) && (
                  <TableHead className="w-[88px]">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={
                      permissions.canEdit || permissions.canCancel ? 6 : 5
                    }
                    className="text-[12px] text-slate-500"
                  >
                    No coverage assignments yet.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium text-slate-900">
                        {item.absentDeveloperName}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        covered by {item.coverDeveloperName}
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.projectName}
                      <span className="ml-1 text-[11px] text-slate-400">
                        ({item.projectCode})
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums text-[12px]">
                      {item.startDate}
                      {item.endDate !== item.startDate
                        ? ` → ${item.endDate}`
                        : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(item.status)}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden max-w-[220px] lg:table-cell">
                      <span className="line-clamp-1 text-[11px] text-slate-500">
                        {item.leaveLabel ?? "—"}
                      </span>
                    </TableCell>
                    {(permissions.canEdit || permissions.canCancel) && (
                      <TableCell>
                        <div className="flex gap-1">
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
                              size="icon"
                              className="h-7 w-7 text-red-600"
                              disabled={isPending}
                              onClick={() => handleCancel(item)}
                              aria-label="Cancel"
                            >
                              <UserRoundX className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
