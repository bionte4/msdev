"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Power, Shield, X } from "lucide-react";
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
  createAccessUser,
  setAccessUserActive,
  updateAccessUser,
  type AccessClientOption,
  type AccessPermissions,
  type AccessUserItem,
} from "@/lib/actions/access";
import type { Role } from "@/lib/constants";

export interface AccessAdminProps {
  items: AccessUserItem[];
  permissions: AccessPermissions;
  clients: AccessClientOption[];
  roles: Role[];
}

interface FormState {
  id?: string;
  name: string;
  email: string;
  role: Role;
  clientId: string;
  password: string;
  isActive: boolean;
}

function emptyForm(roles: Role[], clients: AccessClientOption[]): FormState {
  const role = roles.includes("DEVELOPER") ? "DEVELOPER" : roles[0];
  return {
    name: "",
    email: "",
    role,
    clientId: role === "SYS_ADMIN" ? "" : clients[0]?.id ?? "",
    password: "password123",
    isActive: true,
  };
}

function roleBadge(role: Role) {
  if (role === "SYS_ADMIN") return <Badge variant="warning">{role}</Badge>;
  if (role === "CLIENT_PM") return <Badge variant="success">{role}</Badge>;
  return <Badge variant="secondary">{role}</Badge>;
}

export function AccessAdmin({
  items,
  permissions,
  clients,
  roles,
}: AccessAdminProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(roles, clients));

  function refresh() {
    router.refresh();
  }

  function openCreate() {
    setForm(emptyForm(roles, clients));
    setOpen(true);
  }

  function openEdit(item: AccessUserItem) {
    setForm({
      id: item.id,
      name: item.name,
      email: item.email,
      role: item.role,
      clientId: item.clientId ?? "",
      password: "",
      isActive: item.isActive,
    });
    setOpen(true);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      if (form.id) {
        const result = await updateAccessUser({
          id: form.id,
          name: form.name,
          role: form.role,
          clientId: form.role === "SYS_ADMIN" ? null : form.clientId || null,
          isActive: form.isActive,
          password: form.password || null,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("User access updated");
      } else {
        const result = await createAccessUser({
          name: form.name,
          email: form.email,
          role: form.role,
          clientId: form.role === "SYS_ADMIN" ? null : form.clientId || null,
          password: form.password || undefined,
          isActive: form.isActive,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("User created");
      }
      setOpen(false);
      refresh();
    });
  }

  function toggleActive(item: AccessUserItem) {
    const next = !item.isActive;
    if (
      !window.confirm(
        `${next ? "Reactivate" : "Deactivate"} access for ${item.name}?`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await setAccessUserActive({
        id: item.id,
        isActive: next,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(next ? "User reactivated" : "User deactivated");
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
          Manage login accounts, roles, and active access
        </p>
        {permissions.canCreate && (
          <Button size="sm" onClick={openCreate} disabled={isPending}>
            <Plus className="h-3.5 w-3.5" />
            Add user
          </Button>
        )}
      </div>

      {canShowForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>
                {form.id ? "Edit user access" : "Create user access"}
              </CardTitle>
              <CardDescription>
                Role-based portal login · optional password reset on edit
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
                  <Label htmlFor="access-name">Name</Label>
                  <Input
                    id="access-name"
                    value={form.name}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, name: e.target.value }))
                    }
                    required
                  />
                </div>
                {!form.id && (
                  <div className="space-y-1">
                    <Label htmlFor="access-email">Email</Label>
                    <Input
                      id="access-email"
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, email: e.target.value }))
                      }
                      required
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Select
                    value={form.role}
                    onValueChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        role: v as Role,
                        clientId:
                          v === "SYS_ADMIN" ? "" : p.clientId || clients[0]?.id || "",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.role !== "SYS_ADMIN" && (
                  <div className="space-y-1">
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
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="access-password">
                    {form.id ? "New password (optional)" : "Temp password"}
                  </Label>
                  <Input
                    id="access-password"
                    type="text"
                    value={form.password}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, password: e.target.value }))
                    }
                    placeholder={form.id ? "Leave blank to keep current" : ""}
                    required={!form.id}
                  />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(v) =>
                      setForm((p) => ({ ...p, isActive: v }))
                    }
                  />
                  <Label className="normal-case tracking-normal">Active</Label>
                </div>
              </div>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Shield className="h-3.5 w-3.5" />
                )}
                {form.id ? "Save access" : "Create user"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>User access</CardTitle>
          <CardDescription>
            {items.length} account{items.length === 1 ? "" : "s"} · inactive
            users cannot sign in
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden md:table-cell">Client</TableHead>
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
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium text-slate-900">
                        {item.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {item.email}
                      </div>
                    </TableCell>
                    <TableCell>{roleBadge(item.role)}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {item.clientName
                        ? `${item.clientName} (${item.clientCode})`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {item.isActive ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="destructive">Inactive</Badge>
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
                              onClick={() => toggleActive(item)}
                              aria-label="Toggle active"
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
