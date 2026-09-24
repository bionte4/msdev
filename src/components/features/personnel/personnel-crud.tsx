"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  PlugZap,
  Link2,
  Link2Off,
  Loader2,
  Pencil,
  Plus,
  UserMinus,
  X,
} from "lucide-react";
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
  createPersonnel,
  deactivatePersonnel,
  linkJiraAccount,
  testPersonnelJiraConnection,
  unlinkJiraAccount,
  updatePersonnel,
  type PersonnelItem,
  type PersonnelPermissions,
} from "@/lib/actions/personnel";

export interface PersonnelCrudProps {
  items: PersonnelItem[];
  permissions: PersonnelPermissions;
}

interface FormState {
  id?: string;
  name: string;
  email: string;
  password: string;
  jobTitle: string;
  hourlyRate: string;
  standardCapacity: string;
  skillTags: string;
  jiraAccountEmail: string;
  startDate: string;
  endDate: string;
  notes: string;
  isActive: boolean;
}

function emptyForm(): FormState {
  return {
    name: "",
    email: "",
    password: "password123",
    jobTitle: "Developer",
    hourlyRate: "45",
    standardCapacity: "40",
    skillTags: "TypeScript, React",
    jiraAccountEmail: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    notes: "",
    isActive: true,
  };
}

export function PersonnelCrud({ items, permissions }: PersonnelCrudProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [jiraLinkFor, setJiraLinkFor] = useState<PersonnelItem | null>(null);
  const [jiraEmailDraft, setJiraEmailDraft] = useState("");
  const [jiraTestHint, setJiraTestHint] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  function openCreate() {
    setForm(emptyForm());
    setJiraTestHint(null);
    setOpen(true);
  }

  function openEdit(item: PersonnelItem) {
    setForm({
      id: item.id,
      name: item.name,
      email: item.email,
      password: "",
      jobTitle: item.jobTitle,
      hourlyRate: String(item.hourlyRate),
      standardCapacity: String(item.standardCapacity),
      skillTags: item.skillTags.join(", "),
      jiraAccountEmail: item.jiraAccountEmail ?? "",
      startDate: item.startDate ?? "",
      endDate: item.endDate ?? "",
      notes: item.notes ?? "",
      isActive: item.isActive,
    });
    setJiraTestHint(null);
    setOpen(true);
  }

  function openJiraLink(item: PersonnelItem) {
    setJiraLinkFor(item);
    setJiraEmailDraft(item.jiraAccountEmail ?? item.email);
    setJiraTestHint(null);
  }

  async function runJiraTest(params: {
    email: string;
    developerId?: string;
  }): Promise<boolean> {
    const email = params.email.trim();
    if (!email) {
      toast.error("Enter a Jira account email first");
      return false;
    }
    const result = await testPersonnelJiraConnection({
      developerId: params.developerId,
      jiraAccountEmail: email,
    });
    if (!result.success) {
      toast.error(result.error);
      setJiraTestHint(result.error);
      return false;
    }
    toast.success(result.data.message);
    setJiraTestHint(
      `Verified · ${result.data.displayName} · ${result.data.accountId}`
    );
    return true;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      if (form.id) {
        const result = await updatePersonnel({
          id: form.id,
          name: form.name,
          jobTitle: form.jobTitle,
          hourlyRate: Number(form.hourlyRate),
          standardCapacity: Number(form.standardCapacity),
          skillTags: form.skillTags,
          jiraAccountEmail: form.jiraAccountEmail || null,
          startDate: form.startDate ? new Date(form.startDate) : null,
          endDate: form.endDate ? new Date(form.endDate) : null,
          notes: form.notes || null,
          isActive: form.isActive,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Personnel updated");
      } else {
        const result = await createPersonnel({
          name: form.name,
          email: form.email,
          password: form.password || undefined,
          jobTitle: form.jobTitle,
          hourlyRate: Number(form.hourlyRate),
          standardCapacity: Number(form.standardCapacity),
          skillTags: form.skillTags,
          jiraAccountEmail: form.jiraAccountEmail || null,
          startDate: form.startDate ? new Date(form.startDate) : undefined,
          notes: form.notes || undefined,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Personnel added");
      }
      setOpen(false);
      refresh();
    });
  }

  function handleDeactivate(item: PersonnelItem) {
    if (!window.confirm(`Deactivate ${item.name}?`)) return;
    startTransition(async () => {
      const result = await deactivatePersonnel({ id: item.id });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Personnel deactivated");
      refresh();
    });
  }

  function handleLinkJira(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!jiraLinkFor) return;
    startTransition(async () => {
      const result = await linkJiraAccount({
        developerId: jiraLinkFor.id,
        jiraAccountEmail: jiraEmailDraft.trim(),
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Jira verified & linked for ${jiraLinkFor.name}`
      );
      setJiraLinkFor(null);
      refresh();
    });
  }

  function handleUnlinkJira(item: PersonnelItem) {
    if (
      !window.confirm(
        `Unlink Jira account ${item.jiraAccountEmail} from ${item.name}?`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await unlinkJiraAccount({ developerId: item.id });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Jira account unlinked");
      if (jiraLinkFor?.id === item.id) setJiraLinkFor(null);
      refresh();
    });
  }

  const canShowForm =
    open &&
    ((form.id && permissions.canEdit) || (!form.id && permissions.canCreate));

  return (
    <div className="page-stack">
      <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-[12px] text-sky-900">
        Jira live verify aktif · tiap developer 1 akun · cari tombol{" "}
        <span className="font-semibold">Test Jira connection</span> /{" "}
        <span className="font-semibold">Test connection</span> di form Edit,
        panel Link, atau ikon plug di roster.
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-slate-500">
          1 developer = 1 Jira account · Test connection before link
        </p>
        {permissions.canCreate && (
          <Button size="sm" onClick={openCreate} disabled={isPending}>
            <Plus className="h-3.5 w-3.5" />
            Add developer
          </Button>
        )}
      </div>

      {canShowForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>
                {form.id ? "Edit personnel" : "Add personnel"}
              </CardTitle>
              <CardDescription>
                Optional Jira email · gunakan tombol Test Jira connection di bawah
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
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, name: e.target.value }))
                    }
                    required
                  />
                </div>
                {!form.id && (
                  <div className="space-y-1">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, email: e.target.value }))
                      }
                      required
                    />
                  </div>
                )}
                {!form.id && (
                  <div className="space-y-1">
                    <Label htmlFor="password">Temp password</Label>
                    <Input
                      id="password"
                      type="text"
                      value={form.password}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, password: e.target.value }))
                      }
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label htmlFor="jobTitle">Job title</Label>
                  <Input
                    id="jobTitle"
                    value={form.jobTitle}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, jobTitle: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="hourlyRate">Hourly rate</Label>
                  <Input
                    id="hourlyRate"
                    type="number"
                    min={1}
                    step={0.5}
                    value={form.hourlyRate}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, hourlyRate: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="capacity">Weekly capacity (h)</Label>
                  <Input
                    id="capacity"
                    type="number"
                    min={1}
                    max={50}
                    value={form.standardCapacity}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        standardCapacity: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2 sm:col-span-2 rounded-md border border-sky-200 bg-sky-50/80 p-3">
                  <Label htmlFor="jiraAccountEmail" className="text-sky-900">
                    Jira account email (1 developer = 1 account)
                  </Label>
                  <Input
                    id="jiraAccountEmail"
                    type="email"
                    placeholder="alex@company.atlassian.net"
                    value={form.jiraAccountEmail}
                    onChange={(e) => {
                      setForm((p) => ({
                        ...p,
                        jiraAccountEmail: e.target.value,
                      }));
                      setJiraTestHint(null);
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="w-full sm:w-auto bg-sky-700 text-white hover:bg-sky-800"
                    disabled={isPending || !form.jiraAccountEmail.trim()}
                    onClick={() =>
                      startTransition(async () => {
                        await runJiraTest({
                          email: form.jiraAccountEmail,
                          developerId: form.id,
                        });
                      })
                    }
                  >
                    {isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PlugZap className="h-3.5 w-3.5" />
                    )}
                    Test Jira connection
                  </Button>
                  <p className="text-[11px] text-sky-800/80">
                    Cek email ke Jira API + pastikan belum dipakai developer
                    lain. Butuh Integrations → Jira aktif.
                  </p>
                  {jiraTestHint && (
                    <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-800">
                      {jiraTestHint}
                    </p>
                  )}
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="skills">Skills (comma-separated)</Label>
                  <Input
                    id="skills"
                    value={form.skillTags}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, skillTags: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="startDate">Start date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={form.startDate}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, startDate: e.target.value }))
                    }
                  />
                </div>
                {form.id && (
                  <div className="space-y-1">
                    <Label htmlFor="endDate">End date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={form.endDate}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, endDate: e.target.value }))
                      }
                    />
                  </div>
                )}
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
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
                ) : null}
                {form.id ? "Save changes" : "Create personnel"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {jiraLinkFor && (
        <Card className="border-sky-300 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 bg-sky-50">
            <div>
              <CardTitle>Link Jira account</CardTitle>
              <CardDescription>
                {jiraLinkFor.name} · test connection dulu, baru link & verify
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setJiraLinkFor(null)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <div className="space-y-1">
              <Label htmlFor="jira-link-email">Jira email</Label>
              <Input
                id="jira-link-email"
                type="email"
                value={jiraEmailDraft}
                onChange={(e) => {
                  setJiraEmailDraft(e.target.value);
                  setJiraTestHint(null);
                }}
                required
              />
            </div>
            {jiraTestHint && (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-800">
                {jiraTestHint}
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                size="sm"
                className="bg-sky-700 text-white hover:bg-sky-800"
                disabled={isPending || !jiraEmailDraft.trim()}
                onClick={() =>
                  startTransition(async () => {
                    await runJiraTest({
                      email: jiraEmailDraft,
                      developerId: jiraLinkFor.id,
                    });
                  })
                }
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PlugZap className="h-3.5 w-3.5" />
                )}
                Test connection
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isPending || !jiraEmailDraft.trim()}
                onClick={() =>
                  startTransition(async () => {
                    const result = await linkJiraAccount({
                      developerId: jiraLinkFor.id,
                      jiraAccountEmail: jiraEmailDraft.trim(),
                    });
                    if (!result.success) {
                      toast.error(result.error);
                      return;
                    }
                    toast.success(
                      `Jira verified & linked for ${jiraLinkFor.name}`
                    );
                    setJiraLinkFor(null);
                    refresh();
                  })
                }
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" />
                )}
                Link & verify
              </Button>
            </div>
            <p className="text-[11px] text-slate-500">
              Test = cek API Jira + unik di roster (tanpa simpan). Link & verify
              = simpan email + accountId.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Developer roster</CardTitle>
          <CardDescription>
            {items.length} personnel · active first
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-[12px] text-slate-500">No personnel yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Title</TableHead>
                  <TableHead>Jira</TableHead>
                  <TableHead className="hidden lg:table-cell">Rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[148px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium text-slate-900">
                        {item.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {item.email}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {item.jobTitle}
                    </TableCell>
                    <TableCell>
                      {item.jiraAccountEmail ? (
                        <div>
                          <div className="text-[12px] text-slate-800">
                            {item.jiraAccountEmail}
                          </div>
                          {item.jiraAccountId ? (
                            <div className="mt-0.5 space-y-0.5">
                              <Badge variant="success">Verified</Badge>
                              <div
                                className="max-w-[160px] truncate font-mono text-[10px] text-slate-400"
                                title={item.jiraAccountId}
                              >
                                {item.jiraAccountId}
                              </div>
                            </div>
                          ) : (
                            <Badge variant="warning" className="mt-0.5">
                              Unverified
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <Badge variant="secondary">Not linked</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden tabular-nums lg:table-cell">
                      {item.hourlyRate}/h · {item.standardCapacity}h
                    </TableCell>
                    <TableCell>
                      {item.isActive ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
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
                        {item.canLinkJira && item.jiraAccountEmail && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={isPending}
                            onClick={() =>
                              startTransition(async () => {
                                await runJiraTest({
                                  email: item.jiraAccountEmail!,
                                  developerId: item.id,
                                });
                              })
                            }
                            aria-label="Test Jira connection"
                            title="Test Jira connection"
                          >
                            <PlugZap className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {item.canLinkJira && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={isPending}
                            onClick={() => openJiraLink(item)}
                            aria-label="Link Jira"
                            title="Link Jira account"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {item.canLinkJira && item.jiraAccountEmail && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-amber-700"
                            disabled={isPending}
                            onClick={() => handleUnlinkJira(item)}
                            aria-label="Unlink Jira"
                            title="Unlink Jira account"
                          >
                            <Link2Off className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {item.canDeactivate && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-600"
                            disabled={isPending}
                            onClick={() => handleDeactivate(item)}
                            aria-label="Deactivate"
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {!item.canEdit &&
                          !item.canDeactivate &&
                          !item.canLinkJira && (
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
