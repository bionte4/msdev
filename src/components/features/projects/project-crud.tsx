"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FolderMinus, Loader2, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  createProject,
  deactivateProject,
  updateProject,
  type ProjectClientOption,
  type ProjectItem,
  type ProjectPermissions,
} from "@/lib/actions/projects";

export interface ProjectCrudProps {
  items: ProjectItem[];
  permissions: ProjectPermissions;
  clients: ProjectClientOption[];
  isSysAdmin: boolean;
}

interface FormState {
  id?: string;
  name: string;
  code: string;
  clientId: string;
  isActive: boolean;
}

function emptyForm(defaultClientId: string): FormState {
  return {
    name: "",
    code: "",
    clientId: defaultClientId,
    isActive: true,
  };
}

export function ProjectCrud({
  items,
  permissions,
  clients,
  isSysAdmin,
}: ProjectCrudProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(clients[0]?.id ?? "")
  );

  function refresh() {
    router.refresh();
  }

  function openCreate() {
    setForm(emptyForm(clients[0]?.id ?? ""));
    setOpen(true);
  }

  function openEdit(item: ProjectItem) {
    setForm({
      id: item.id,
      name: item.name,
      code: item.code,
      clientId: item.clientId,
      isActive: item.isActive,
    });
    setOpen(true);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      if (form.id) {
        const result = await updateProject({
          id: form.id,
          name: form.name,
          code: form.code.trim().toUpperCase(),
          isActive: form.isActive,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Project updated");
      } else {
        const result = await createProject({
          name: form.name,
          code: form.code.trim().toUpperCase(),
          clientId: form.clientId || undefined,
          isActive: form.isActive,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Project created");
      }
      setOpen(false);
      refresh();
    });
  }

  function handleDeactivate(item: ProjectItem) {
    if (!window.confirm(`Deactivate project “${item.name}” (${item.code})?`)) {
      return;
    }
    startTransition(async () => {
      const result = await deactivateProject({ id: item.id });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Project deactivated");
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
          {items.length} project{items.length === 1 ? "" : "s"} · active first
        </p>
        {permissions.canCreate && (
          <Button size="sm" onClick={openCreate} disabled={isPending}>
            <Plus className="h-3.5 w-3.5" />
            Add project
          </Button>
        )}
      </div>

      {canShowForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>
                {form.id ? "Edit project" : "Add project"}
              </CardTitle>
              <CardDescription>
                Code must be unique per client (e.g. PORTAL)
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
                  <Label htmlFor="project-name">Name</Label>
                  <Input
                    id="project-name"
                    value={form.name}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="Governance Portal"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="project-code">Code</Label>
                  <Input
                    id="project-code"
                    value={form.code}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        code: e.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="PORTAL"
                    className="uppercase"
                    required
                  />
                </div>
                {!form.id && (isSysAdmin || clients.length > 1) && (
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Client</Label>
                    <Select
                      value={form.clientId}
                      onValueChange={(v) =>
                        setForm((p) => ({ ...p, clientId: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} ({c.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {form.id && (
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <Switch
                      checked={form.isActive}
                      onCheckedChange={(checked) =>
                        setForm((p) => ({ ...p, isActive: checked }))
                      }
                      id="project-active"
                    />
                    <Label htmlFor="project-active">Active</Label>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="submit" size="sm" disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {form.id ? "Save changes" : "Create project"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
          <CardDescription>
            Used by timesheets and scope swaps · deactivate instead of delete
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="hidden md:table-cell">Client</TableHead>
                <TableHead className="hidden lg:table-cell">Usage</TableHead>
                <TableHead>Status</TableHead>
                {(permissions.canEdit || permissions.canDeactivate) && (
                  <TableHead className="w-[88px]">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={
                      permissions.canEdit || permissions.canDeactivate ? 6 : 5
                    }
                    className="text-[12px] text-slate-500"
                  >
                    No projects yet.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.code}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {item.clientName}
                      <span className="ml-1 text-[11px] text-slate-400">
                        ({item.clientCode})
                      </span>
                    </TableCell>
                    <TableCell className="hidden tabular-nums text-[12px] text-slate-500 lg:table-cell">
                      {item.timesheetCount} TS · {item.scopeSwapCount} swaps
                    </TableCell>
                    <TableCell>
                      {item.isActive ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    {(permissions.canEdit || permissions.canDeactivate) && (
                      <TableCell>
                        <div className="flex gap-1">
                          {item.canEdit && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={isPending}
                              onClick={() => openEdit(item)}
                              aria-label={`Edit ${item.name}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {item.canDeactivate && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-amber-700"
                              disabled={isPending}
                              onClick={() => handleDeactivate(item)}
                              aria-label={`Deactivate ${item.name}`}
                            >
                              <FolderMinus className="h-3.5 w-3.5" />
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
