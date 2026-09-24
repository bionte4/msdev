"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Download,
  FileUp,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
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
  bulkImportTimesheetsFromExcel,
  createTimesheet,
  deleteTimesheet,
  downloadTimesheetImportTemplate,
  listTimesheets,
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
  email?: string;
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

function isoDay(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toISOString().slice(0, 10);
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

function downloadBase64Excel(filename: string, base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
  const [data, setData] = useState<TimesheetListResult>(initialData);
  const [periodFrom, setPeriodFrom] = useState(isoDay(initialData.periodFrom));
  const [periodTo, setPeriodTo] = useState(isoDay(initialData.periodTo));
  const [filterDeveloperId, setFilterDeveloperId] = useState(
    currentDeveloperId ?? "all"
  );
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importErrors, setImportErrors] = useState<
    { row: number; message: string }[]
  >([]);
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(currentDeveloperId, projects[0]?.id ?? "")
  );

  const entries = useMemo(() => {
    if (filterDeveloperId === "all") return data.entries;
    return data.entries.filter((e) => e.developerId === filterDeveloperId);
  }, [filterDeveloperId, data.entries]);

  const progressValue = data.showWeeklyCap
    ? Math.min(100, (data.totalHours / data.hardCap) * 100)
    : Math.min(100, data.totalHours > 0 ? 100 : 0);
  const indicatorClass = data.isOverCap
    ? "bg-red-600"
    : data.isNearCap
      ? "bg-amber-500"
      : "bg-emerald-600";

  function applyPeriod(nextFrom = periodFrom, nextTo = periodTo) {
    startTransition(async () => {
      const result = await listTimesheets({
        from: new Date(nextFrom),
        to: new Date(nextTo),
        developerId:
          filterDeveloperId !== "all" ? filterDeveloperId : undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setData(result.data);
      setPeriodFrom(isoDay(result.data.periodFrom));
      setPeriodTo(isoDay(result.data.periodTo));
      toast.success(`${result.data.entries.length} entries loaded`);
    });
  }

  function setThisWeek() {
    const from = isoDay(initialData.weekStart);
    const to = isoDay(initialData.weekEnd);
    setPeriodFrom(from);
    setPeriodTo(to);
    applyPeriod(from, to);
  }

  function refresh() {
    applyPeriod();
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

  function handleDownloadTemplate() {
    startTransition(async () => {
      const result = await downloadTimesheetImportTemplate();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      downloadBase64Excel(result.data.filename, result.data.base64);
      toast.success("Template downloaded");
    });
  }

  function handleImportFile(file: File | null) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Please upload an .xlsx file");
      return;
    }

    startTransition(async () => {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      const result = await bulkImportTimesheetsFromExcel({ base64 });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setImportErrors(result.data.errors);
      if (result.data.created > 0) {
        toast.success(
          `Imported ${result.data.created} row(s)` +
            (result.data.failed ? ` · ${result.data.failed} failed` : "")
        );
        refresh();
      } else {
        toast.error(
          result.data.failed
            ? `Import failed for ${result.data.failed} row(s)`
            : "No rows imported"
        );
      }
    });
  }

  return (
    <div className="page-stack">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Period summary</CardTitle>
              <CardDescription>
                {new Date(data.periodFrom).toLocaleDateString()} –{" "}
                {new Date(data.periodTo).toLocaleDateString()}
                {data.showWeeklyCap ? " · weekly cap view" : " · custom range"}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.showWeeklyCap && data.isNearCap && !data.isOverCap && (
                <Badge variant="warning">Near {data.warningThreshold}h</Badge>
              )}
              {data.showWeeklyCap && data.isOverCap && (
                <Badge variant="destructive">Hard cap</Badge>
              )}
              {data.showWeeklyCap && !data.isNearCap && (
                <Badge variant="success">Within cap</Badge>
              )}
              <Badge variant="secondary">
                OT {formatHours(data.overtimeHours)}
              </Badge>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor="ts-from">Start date</Label>
              <Input
                id="ts-from"
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ts-to">End date</Label>
              <Input
                id="ts-to"
                type="date"
                value={periodTo}
                min={periodFrom}
                onChange={(e) => setPeriodTo(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-end gap-2 lg:col-span-3">
              <Button
                type="button"
                size="sm"
                onClick={() => applyPeriod()}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                Apply period
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={setThisWeek}
                disabled={isPending}
              >
                This week
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-end justify-between gap-2">
            <p className="text-xl font-semibold tabular-nums tracking-tight">
              {formatHours(data.totalHours)}
              {data.showWeeklyCap && (
                <span className="ml-1 text-[12px] font-normal text-slate-500">
                  / {formatHours(data.hardCap)}
                </span>
              )}
            </p>
            <p className="text-[12px] text-slate-500">
              {data.showWeeklyCap
                ? `${formatHours(data.remainingToHardCap)} remaining`
                : `${entries.length} entr${entries.length === 1 ? "y" : "ies"}`}
            </p>
          </div>
          {data.showWeeklyCap && (
            <Progress
              value={progressValue}
              indicatorClassName={indicatorClass}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-slate-500">
          RBAC: create / edit / delete / import enforced per role
        </p>
        <div className="flex flex-wrap gap-2">
          {permissions.canImport && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadTemplate}
                disabled={isPending}
              >
                <Download className="h-3.5 w-3.5" />
                Import template
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setImportOpen((v) => !v)}
                disabled={isPending}
              >
                <FileUp className="h-3.5 w-3.5" />
                Bulk import
              </Button>
            </>
          )}
          {permissions.canCreate && (
            <Button size="sm" onClick={openCreate} disabled={isPending}>
              <Plus className="h-3.5 w-3.5" />
              New entry
            </Button>
          )}
        </div>
      </div>

      {importOpen && permissions.canImport && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Bulk import</CardTitle>
              <CardDescription>
                Upload .xlsx using the import template (max 200 rows)
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setImportOpen(false)}
              aria-label="Close import"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={isPending}
              onChange={(e) => handleImportFile(e.target.files?.[0] ?? null)}
            />
            {importErrors.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                <p className="font-medium">
                  {importErrors.length} row error(s)
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {importErrors.slice(0, 10).map((err) => (
                    <li key={`${err.row}-${err.message}`}>
                      Row {err.row}: {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {formOpen && permissions.canCreate && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>
                {form.id ? "Edit timesheet" : "Create timesheet"}
              </CardTitle>
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
                  <Label
                    htmlFor="isOvertime"
                    className="normal-case tracking-normal"
                  >
                    Mark as overtime
                  </Label>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending || !form.projectId}
                >
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
              {entries.length} row{entries.length === 1 ? "" : "s"} in selected
              period
            </CardDescription>
          </div>
          {permissions.canSelectDeveloper && developers.length > 0 && (
            <Select
              value={filterDeveloperId}
              onValueChange={(v) => {
                setFilterDeveloperId(v);
                startTransition(async () => {
                  const result = await listTimesheets({
                    from: new Date(periodFrom),
                    to: new Date(periodTo),
                    developerId: v !== "all" ? v : undefined,
                  });
                  if (!result.success) {
                    toast.error(result.error);
                    return;
                  }
                  setData(result.data);
                });
              }}
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
            <p className="text-[12px] text-slate-500">
              No timesheets in this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  {(permissions.canSelectDeveloper || !currentDeveloperId) && (
                    <TableHead>Developer</TableHead>
                  )}
                  <TableHead>Project</TableHead>
                  <TableHead className="hidden md:table-cell">Task</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="w-[88px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="tabular-nums">
                      {entry.workDate}
                    </TableCell>
                    {(permissions.canSelectDeveloper ||
                      !currentDeveloperId) && (
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
                    <TableCell className="text-right font-medium tabular-nums">
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
