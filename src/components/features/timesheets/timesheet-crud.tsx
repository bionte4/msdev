"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  createTimesheet,
  deleteTimesheet,
  updateTimesheet,
  type TimesheetEntry,
  type TimesheetListResult,
  type TimesheetPermissions,
} from "@/lib/actions/timesheets";
import { MAX_DAILY_HOURS } from "@/lib/constants";
import { formatHours } from "@/lib/utils";

export interface TimesheetOption {
  id: string;
  name: string;
  code?: string;
}

export interface TimesheetCrudProps {
  initialData: TimesheetListResult;
  projects: TimesheetOption[];
  developers: TimesheetOption[];
  currentDeveloperId?: string | null;
  permissions: TimesheetPermissions;
}

interface FormState {
  id?: string;
  developerId: string;
  projectId: string;
  workDate: string;
  hours: string;
  taskSummary: string;
  isOvertime: boolean;
}

function emptyForm(
  currentDeveloperId?: string | null,
  defaultProjectId = ""
): FormState {
  return {
    developerId: currentDeveloperId ?? "",
    projectId: defaultProjectId,
    workDate: new Date().toISOString().slice(0, 10),
    hours: "8",
    taskSummary: "",
    isOvertime: false,
  };
}

export function TimesheetCrud({
  initialData,
  projects,
  developers,
  currentDeveloperId,
  permissions,
}: TimesheetCrudProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filterDeveloperId, setFilterDeveloperId] = useState(
    currentDeveloperId ?? "all"
  );
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(currentDeveloperId, projects[0]?.id ?? "")
  );

  const entries = useMemo(() => {
    if (filterDeveloperId === "all") return initialData.entries;
    return initialData.entries.filter(
      (e) => e.developerId === filterDeveloperId
    );
  }, [filterDeveloperId, initialData.entries]);

  const progressValue = Math.min(
    100,
    (initialData.totalHours / initialData.hardCap) * 100
  );
  const indicatorClass = initialData.isOverCap
    ? "bg-red-600"
    : initialData.isNearCap
      ? "bg-amber-500"
      : "bg-emerald-600";

  function refresh() {
    router.refresh();
  }

  function openCreate() {
    setForm(emptyForm(currentDeveloperId, projects[0]?.id ?? ""));
    setFormOpen(true);
  }

  function openEdit(entry: TimesheetEntry) {
    setForm({
      id: entry.id,
      developerId: entry.developerId,
      projectId: entry.projectId,
      workDate: entry.workDate,
      hours: String(entry.hours),
      taskSummary: entry.taskSummary,
      isOvertime: entry.isOvertime,
    });
    setFormOpen(true);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const payload = {
        projectId: form.projectId,
        workDate: new Date(form.workDate),
        hours: Number(form.hours),
        taskSummary: form.taskSummary,
        isOvertime: form.isOvertime,
        developerId: form.developerId || undefined,
      };

      const result = form.id
        ? await updateTimesheet({ id: form.id, ...payload })
        : await createTimesheet(payload);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(form.id ? "Timesheet updated" : "Timesheet created");
      setFormOpen(false);
      setForm(emptyForm(currentDeveloperId, projects[0]?.id ?? ""));
      refresh();
    });
  }

  function handleDelete(entry: TimesheetEntry) {
    if (!window.confirm(`Delete timesheet on ${entry.workDate}?`)) return;

    startTransition(async () => {
      const result = await deleteTimesheet({ id: entry.id });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Timesheet deleted");
      refresh();
    });
  }

  return (
    <div className="page-stack">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle>This week</CardTitle>
            <CardDescription>
              {new Date(initialData.weekStart).toLocaleDateString()} –{" "}
              {new Date(initialData.weekEnd).toLocaleDateString()}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {initialData.isNearCap && !initialData.isOverCap && (
              <Badge variant="warning">
                Near {initialData.warningThreshold}h
              </Badge>
            )}
            {initialData.isOverCap && (
              <Badge variant="destructive">Hard cap</Badge>
            )}
            {!initialData.isNearCap && (
              <Badge variant="success">Within cap</Badge>
            )}
            <Badge variant="secondary">
              OT {formatHours(initialData.overtimeHours)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-end justify-between gap-2">
            <p className="text-xl font-semibold tabular-nums tracking-tight">
              {formatHours(initialData.totalHours)}
              <span className="ml-1 text-[12px] font-normal text-slate-500">
                / {formatHours(initialData.hardCap)}
              </span>
            </p>
            <p className="text-[12px] text-slate-500">
              {formatHours(initialData.remainingToHardCap)} remaining
            </p>
          </div>
          <Progress value={progressValue} indicatorClassName={indicatorClass} />
        </CardContent>
      </Card>

      {permissions.canCreate && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-slate-500">
            RBAC: create / edit / delete enforced per role
          </p>
          <Button size="sm" onClick={openCreate} disabled={isPending}>
            <Plus className="h-3.5 w-3.5" />
            New entry
          </Button>
        </div>
      )}

      {formOpen && permissions.canCreate && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>{form.id ? "Edit timesheet" : "Create timesheet"}</CardTitle>
              <CardDescription>
                Max {MAX_DAILY_HOURS}h/day · weekly hard cap 50h
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setFormOpen(false)}
              aria-label="Close form"
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
                        setForm((prev) => ({ ...prev, developerId: v }))
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

                <div className="space-y-1 sm:col-span-2">
                  <Label>Project</Label>
                  <Select
                    value={form.projectId}
                    onValueChange={(v) =>
                      setForm((prev) => ({ ...prev, projectId: v }))
                    }
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {p.code ? ` (${p.code})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="workDate">Work date</Label>
                  <Input
                    id="workDate"
                    type="date"
                    value={form.workDate}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, workDate: e.target.value }))
                    }
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="hours">Hours</Label>
                  <Input
                    id="hours"
                    type="number"
                    min={0.5}
                    max={MAX_DAILY_HOURS}
                    step={0.5}
                    value={form.hours}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, hours: e.target.value }))
                    }
                    required
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="taskSummary">Task summary</Label>
                  <Textarea
                    id="taskSummary"
                    value={form.taskSummary}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        taskSummary: e.target.value,
                      }))
                    }
                    required
                    minLength={5}
                  />
                </div>

                <div className="flex items-center gap-2 sm:col-span-2">
                  <input
                    id="isOvertime"
                    type="checkbox"
                    checked={form.isOvertime}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        isOvertime: e.target.checked,
                      }))
                    }
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                  <Label htmlFor="isOvertime" className="normal-case tracking-normal">
                    Mark as overtime
                  </Label>
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={isPending || !form.projectId}>
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {form.id ? "Save changes" : "Create"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setFormOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Entries</CardTitle>
            <CardDescription>
              {entries.length} row{entries.length === 1 ? "" : "s"} this week
            </CardDescription>
          </div>
          {permissions.canSelectDeveloper && developers.length > 0 && (
            <Select
              value={filterDeveloperId}
              onValueChange={setFilterDeveloperId}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter developer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All developers</SelectItem>
                {developers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-[12px] text-slate-500">No timesheets this week.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  {(permissions.canSelectDeveloper ||
                    !currentDeveloperId) && <TableHead>Developer</TableHead>}
                  <TableHead>Project</TableHead>
                  <TableHead className="hidden md:table-cell">Task</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="w-[88px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="tabular-nums">{entry.workDate}</TableCell>
                    {(permissions.canSelectDeveloper || !currentDeveloperId) && (
                      <TableCell>{entry.developerName}</TableCell>
                    )}
                    <TableCell>{entry.projectName}</TableCell>
                    <TableCell className="hidden max-w-[220px] md:table-cell">
                      <span className="line-clamp-1">{entry.taskSummary}</span>
                      {entry.isOvertime && (
                        <Badge variant="warning" className="ml-1">
                          OT
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatHours(entry.hours)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {entry.canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={isPending}
                            onClick={() => openEdit(entry)}
                            aria-label="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {entry.canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-600 hover:text-red-700"
                            disabled={isPending}
                            onClick={() => handleDelete(entry)}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {!entry.canEdit && !entry.canDelete && (
                          <span className="text-[11px] text-slate-400">View</span>
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
