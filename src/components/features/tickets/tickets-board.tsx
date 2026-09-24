"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Download,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  bulkImportTicketsFromExcel,
  createTicket,
  deleteTicket,
  downloadTicketImportTemplate,
  syncTicketToJira,
  updateTicket,
  type TicketAssigneeOption,
  type TicketItem,
  type TicketListData,
  type TicketPermissions,
  type TicketProjectOption,
} from "@/lib/actions/tickets";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  ticketWorkCategories,
  ticketStatuses,
  type TicketStatus,
  type TicketWorkCategory,
} from "@/lib/validations/tickets";

export interface TicketsBoardProps {
  initialData: TicketListData;
  projects: TicketProjectOption[];
  assignees: TicketAssigneeOption[];
  summary: {
    total: number;
    byCategory: { category: string; label: string; count: number }[];
    byStatus: { status: string; label: string; count: number }[];
    byProject: { project: string; code: string; count: number }[];
    from: string;
    to: string;
  } | null;
  currentDeveloperId?: string | null;
}

interface FormState {
  id?: string;
  projectId: string;
  workDate: string;
  category: TicketWorkCategory;
  title: string;
  description: string;
  status: TicketStatus;
  assigneeId: string;
  reporterName: string;
  reporterEmail: string;
  syncToJira: boolean;
  notes: string;
}

function emptyForm(
  projects: TicketProjectOption[],
  currentDeveloperId?: string | null
): FormState {
  return {
    projectId: projects[0]?.id ?? "",
    workDate: new Date().toISOString().slice(0, 10),
    category: "DEVELOPMENT",
    title: "",
    description: "",
    status: "OPEN",
    assigneeId: currentDeveloperId ?? "",
    reporterName: "",
    reporterEmail: "",
    syncToJira: false,
    notes: "",
  };
}

function downloadBase64Excel(filename: string, base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function statusBadge(status: TicketStatus) {
  if (status === "DONE") return <Badge variant="success">{TICKET_STATUS_LABELS[status]}</Badge>;
  if (status === "CANCELLED")
    return <Badge variant="destructive">{TICKET_STATUS_LABELS[status]}</Badge>;
  if (status === "IN_PROGRESS")
    return <Badge variant="warning">{TICKET_STATUS_LABELS[status]}</Badge>;
  return <Badge variant="secondary">{TICKET_STATUS_LABELS[status]}</Badge>;
}

export function TicketsBoard({
  initialData,
  projects,
  assignees,
  summary,
  currentDeveloperId,
}: TicketsBoardProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(projects, currentDeveloperId)
  );
  const permissions: TicketPermissions = initialData.permissions;

  const items = initialData.items;

  const openCount = useMemo(
    () => items.filter((i) => i.status === "OPEN" || i.status === "IN_PROGRESS").length,
    [items]
  );

  function refresh() {
    router.refresh();
  }

  function openCreate() {
    setForm(emptyForm(projects, currentDeveloperId));
    setOpen(true);
  }

  function openEdit(item: TicketItem) {
    setForm({
      id: item.id,
      projectId: item.projectId,
      workDate: item.workDate,
      category: item.category,
      title: item.title,
      description: item.description ?? "",
      status: item.status,
      assigneeId: item.assigneeId ?? "",
      reporterName: item.reporterName ?? "",
      reporterEmail: item.reporterEmail ?? "",
      syncToJira: item.syncToJira,
      notes: item.notes ?? "",
    });
    setOpen(true);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const payload = {
        projectId: form.projectId,
        workDate: new Date(form.workDate),
        category: form.category,
        title: form.title,
        description: form.description || null,
        status: form.status,
        assigneeId: form.assigneeId || null,
        reporterName: form.reporterName || null,
        reporterEmail: form.reporterEmail || null,
        syncToJira: form.syncToJira,
        notes: form.notes || null,
      };

      const result = form.id
        ? await updateTicket({ id: form.id, ...payload })
        : await createTicket(payload);

      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(form.id ? "Ticket updated" : "Ticket created");
      if (result.data.jiraIssueKey) {
        toast.message(`Jira: ${result.data.jiraIssueKey}`);
      }
      setOpen(false);
      refresh();
    });
  }

  function handleDelete(item: TicketItem) {
    if (!window.confirm(`Delete ticket “${item.title}”?`)) return;
    startTransition(async () => {
      const result = await deleteTicket({ id: item.id });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Ticket deleted");
      refresh();
    });
  }

  function handleSync(item: TicketItem) {
    startTransition(async () => {
      const result = await syncTicketToJira({ id: item.id });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Synced as ${result.data.jiraIssueKey}`);
      refresh();
    });
  }

  function handleDownloadTemplate() {
    startTransition(async () => {
      const result = await downloadTicketImportTemplate();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      downloadBase64Excel(result.data.filename, result.data.base64);
      toast.success("Template downloaded");
    });
  }

  function handleFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const base64 = dataUrl.includes(",")
        ? dataUrl.split(",")[1]
        : dataUrl;
      startTransition(async () => {
        const result = await bulkImportTicketsFromExcel({ base64 });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success(
          `Imported ${result.data.created} · failed ${result.data.failed} · Jira synced ${result.data.synced}`
        );
        if (result.data.errors[0]) {
          toast.message(
            `Row ${result.data.errors[0].row}: ${result.data.errors[0].message}`
          );
        }
        refresh();
      });
    };
    reader.readAsDataURL(file);
  }

  const canShowForm =
    open &&
    ((form.id && permissions.canEdit) || (!form.id && permissions.canCreate));

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-slate-500">
          Daily or bulk ticket logging · dev & non-dev work · optional Jira sync
          · period {initialData.from} → {initialData.to}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {permissions.canImport && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={handleDownloadTemplate}
              >
                <Download className="h-3.5 w-3.5" />
                Template
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                Bulk Excel
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  handleFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </>
          )}
          {permissions.canCreate && (
            <Button size="sm" disabled={isPending} onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" />
              Add ticket
            </Button>
          )}
        </div>
      </div>

      {summary && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-1.5">
              <CardDescription>This month</CardDescription>
              <CardTitle className="text-[22px] tabular-nums">
                {summary.total}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-[11px] text-slate-500">
              Open / in progress in list: {openCount}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1.5">
              <CardDescription>By category</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 pt-0 text-[12px]">
              {summary.byCategory.length === 0 ? (
                <p className="text-slate-500">No tickets</p>
              ) : (
                summary.byCategory.map((c) => (
                  <div key={c.category} className="flex justify-between gap-2">
                    <span>{c.label}</span>
                    <span className="tabular-nums text-slate-600">{c.count}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1.5">
              <CardDescription>By status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 pt-0 text-[12px]">
              {summary.byStatus.length === 0 ? (
                <p className="text-slate-500">No tickets</p>
              ) : (
                summary.byStatus.map((s) => (
                  <div key={s.status} className="flex justify-between gap-2">
                    <span>{s.label}</span>
                    <span className="tabular-nums text-slate-600">{s.count}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1.5">
              <CardDescription>By project</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 pt-0 text-[12px]">
              {summary.byProject.length === 0 ? (
                <p className="text-slate-500">No tickets</p>
              ) : (
                summary.byProject.slice(0, 6).map((p) => (
                  <div key={p.code} className="flex justify-between gap-2">
                    <span className="truncate">
                      {p.project}{" "}
                      <span className="text-slate-400">({p.code})</span>
                    </span>
                    <span className="tabular-nums text-slate-600">{p.count}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {canShowForm && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>{form.id ? "Edit ticket" : "New ticket"}</CardTitle>
              <CardDescription>
                Dev: pick assignee · Non-dev: enter reporter name
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
                          {p.name} ({p.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ticket-date">Work date</Label>
                  <Input
                    id="ticket-date"
                    type="date"
                    value={form.workDate}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, workDate: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        category: v as TicketWorkCategory,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ticketWorkCategories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {TICKET_CATEGORY_LABELS[c]}
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
                      setForm((p) => ({ ...p, status: v as TicketStatus }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ticketStatuses.map((s) => (
                        <SelectItem key={s} value={s}>
                          {TICKET_STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="ticket-title">Title</Label>
                  <Input
                    id="ticket-title"
                    value={form.title}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, title: e.target.value }))
                    }
                    required
                    minLength={3}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="ticket-desc">Description</Label>
                  <Textarea
                    id="ticket-desc"
                    value={form.description}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, description: e.target.value }))
                    }
                    rows={3}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Assignee (developer)</Label>
                  <Select
                    value={form.assigneeId || "__none__"}
                    onValueChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        assigneeId: v === "__none__" ? "" : v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None (non-dev) —</SelectItem>
                      {assignees.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} · {a.jobTitle}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reporter-name">Reporter (non-dev)</Label>
                  <Input
                    id="reporter-name"
                    value={form.reporterName}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, reporterName: e.target.value }))
                    }
                    placeholder="e.g. Device Admin"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reporter-email">Reporter email</Label>
                  <Input
                    id="reporter-email"
                    type="email"
                    value={form.reporterEmail}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, reporterEmail: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ticket-notes">Notes</Label>
                  <Input
                    id="ticket-notes"
                    value={form.notes}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, notes: e.target.value }))
                    }
                  />
                </div>
                {!form.id && permissions.canSyncJira && (
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <Switch
                      checked={form.syncToJira}
                      onCheckedChange={(v) =>
                        setForm((p) => ({ ...p, syncToJira: v }))
                      }
                    />
                    <Label className="normal-case tracking-normal">
                      Sync to Jira on create
                    </Label>
                  </div>
                )}
              </div>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {form.id ? "Save ticket" : "Create ticket"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tickets</CardTitle>
          <CardDescription>
            {items.length} ticket{items.length === 1 ? "" : "s"} in range
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Ticket</TableHead>
                <TableHead className="hidden md:table-cell">Project</TableHead>
                <TableHead className="hidden lg:table-cell">Who</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Jira</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-[12px] text-slate-500">
                    No tickets this period. Add daily or import Excel.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap text-[12px]">
                      {item.workDate}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {item.categoryLabel}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-[12px]">
                      {item.projectCode}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-[12px]">
                      {item.assigneeName ??
                        item.reporterName ??
                        "—"}
                    </TableCell>
                    <TableCell>{statusBadge(item.status)}</TableCell>
                    <TableCell className="hidden sm:table-cell text-[11px]">
                      {item.jiraIssueKey ? (
                        <Badge variant="success">{item.jiraIssueKey}</Badge>
                      ) : item.syncStatus === "FAILED" ? (
                        <Badge variant="destructive">Failed</Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-0.5">
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
                        {permissions.canSyncJira && !item.jiraIssueKey && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={isPending}
                            onClick={() => handleSync(item)}
                            aria-label="Sync Jira"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {item.canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-700"
                            disabled={isPending}
                            onClick={() => handleDelete(item)}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
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
