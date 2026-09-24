"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Loader2, Pencil, Plus, Power, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createClient,
  deactivateClient,
  updateClient,
  type ClientItem,
  type ClientPermissions,
} from "@/lib/actions/clients";

export interface ClientCrudProps {
  items: ClientItem[];
  permissions: ClientPermissions;
}

interface FormState {
  id?: string;
  name: string;
  code: string;
  notes: string;
  isActive: boolean;
}

function emptyForm(): FormState {
  return { name: "", code: "", notes: "", isActive: true };
}

export function ClientCrud({ items, permissions }: ClientCrudProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  function refresh() {
    router.refresh();
  }

  function openCreate() {
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(item: ClientItem) {
    setForm({
      id: item.id,
      name: item.name,
      code: item.code,
      notes: item.notes ?? "",
      isActive: item.isActive,
    });
    setOpen(true);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      if (form.id) {
        const result = await updateClient({
          id: form.id,
          name: form.name,
          code: form.code.trim().toUpperCase(),
          notes: form.notes || null,
          isActive: form.isActive,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Client updated");
      } else {
        const result = await createClient({
          name: form.name,
          code: form.code.trim().toUpperCase(),
          notes: form.notes || null,
          isActive: form.isActive,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Client created");
      }
      setOpen(false);
      refresh();
    });
  }

  function handleDeactivate(item: ClientItem) {
    if (!window.confirm(`Deactivate client “${item.name}” (${item.code})?`)) {
      return;
    }
    startTransition(async () => {
      const result = await deactivateClient({ id: item.id });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Client deactivated");
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
          {items.length} client{items.length === 1 ? "" : "s"} · SYS_ADMIN manages
        </p>
        {permissions.canCreate && (
          <Button size="sm" onClick={openCreate} disabled={isPending}>
            <Plus className="h-3.5 w-3.5" />
            Add client
          </Button>
        )}
      </div>

      {canShowForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>{form.id ? "Edit client" : "Add client"}</CardTitle>
              <CardDescription>
                Code is unique (e.g. ACME) · used by projects & personnel
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
                  <Label htmlFor="client-name">Name</Label>
                  <Input
                    id="client-name"
                    value={form.name}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, name: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="client-code">Code</Label>
                  <Input
                    id="client-code"
                    value={form.code}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        code: e.target.value.toUpperCase(),
                      }))
                    }
                    className="uppercase"
                    required
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="client-notes">Notes</Label>
                  <Textarea
                    id="client-notes"
                    value={form.notes}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, notes: e.target.value }))
                    }
                  />
                </div>
                {form.id && (
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <Switch
                      checked={form.isActive}
                      onCheckedChange={(v) =>
                        setForm((p) => ({ ...p, isActive: v }))
                      }
                    />
                    <Label className="normal-case tracking-normal">Active</Label>
                  </div>
                )}
              </div>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Building2 className="h-3.5 w-3.5" />
                )}
                {form.id ? "Save changes" : "Create client"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Clients</CardTitle>
          <CardDescription>
            Soft-deactivate keeps historical projects & timesheets
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="hidden md:table-cell">Usage</TableHead>
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
                      permissions.canEdit || permissions.canDeactivate ? 5 : 4
                    }
                    className="text-[12px] text-slate-500"
                  >
                    No clients yet.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.code}</Badge>
                    </TableCell>
                    <TableCell className="hidden tabular-nums text-[12px] text-slate-500 md:table-cell">
                      {item.projectCount} projects · {item.developerCount}{" "}
                      developers · {item.userCount} users
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
                          {item.canDeactivate && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-amber-700"
                              disabled={isPending}
                              onClick={() => handleDeactivate(item)}
                              aria-label="Deactivate"
                            >
                              <Power className="h-3.5 w-3.5" />
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
