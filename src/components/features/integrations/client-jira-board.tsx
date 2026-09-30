"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CloudDownload, Loader2, Plug, PlugZap } from "lucide-react";
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
  listClientJiraConfigs,
  runJiraPullNow,
  testClientJiraConnection,
  upsertClientJiraConfig,
  type ClientJiraCardData,
} from "@/lib/actions/integrations";

export interface ClientJiraBoardProps {
  initialItems: ClientJiraCardData[];
  canEdit: boolean;
}

function statusBadge(status: ClientJiraCardData["lastTestStatus"]) {
  if (status === "SUCCESS") return <Badge variant="success">TEST OK</Badge>;
  if (status === "FAILED") return <Badge variant="destructive">TEST FAILED</Badge>;
  return <Badge variant="secondary">NOT TESTED</Badge>;
}

export function ClientJiraBoard({
  initialItems,
  canEdit,
}: ClientJiraBoardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState(initialItems);
  const [selectedId, setSelectedId] = useState(initialItems[0]?.clientId ?? "");
  const selected =
    items.find((i) => i.clientId === selectedId) ?? items[0] ?? null;

  function updateLocal(clientId: string, patch: Partial<ClientJiraCardData>) {
    setItems((prev) =>
      prev.map((item) =>
        item.clientId === clientId ? { ...item, ...patch } : item
      )
    );
  }

  function updateConfig(key: string, value: string | boolean) {
    if (!selected) return;
    updateLocal(selected.clientId, {
      config: { ...selected.config, [key]: value },
    });
  }

  function handleSave() {
    if (!selected) return;
    startTransition(async () => {
      const result = await upsertClientJiraConfig({
        clientId: selected.clientId,
        enabled: selected.enabled,
        config: {
          baseUrl: String(selected.config.baseUrl ?? "")
            .trim()
            .replace(/\/+$/, "")
            .replace(/\/jira$/i, ""),
          email: String(selected.config.email ?? ""),
          apiToken: String(selected.config.apiToken ?? ""),
          projectKey: String(selected.config.projectKey ?? "")
            .trim()
            .toUpperCase(),
          issueType: String(selected.config.issueType ?? "Task"),
        },
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setItems((prev) =>
        prev.map((row) =>
          row.clientId === result.data.clientId ? result.data : row
        )
      );
      toast.success(`Jira saved for ${result.data.clientCode}`);
      router.refresh();
    });
  }

  function handleTest() {
    if (!selected) return;
    startTransition(async () => {
      const saved = await upsertClientJiraConfig({
        clientId: selected.clientId,
        enabled: selected.enabled,
        config: {
          baseUrl: String(selected.config.baseUrl ?? "")
            .trim()
            .replace(/\/+$/, "")
            .replace(/\/jira$/i, ""),
          email: String(selected.config.email ?? ""),
          apiToken: String(selected.config.apiToken ?? ""),
          projectKey: String(selected.config.projectKey ?? "")
            .trim()
            .toUpperCase(),
          issueType: String(selected.config.issueType ?? "Task"),
        },
      });
      if (!saved.success) {
        toast.error(saved.error);
        return;
      }
      setItems((prev) =>
        prev.map((row) =>
          row.clientId === saved.data.clientId ? saved.data : row
        )
      );

      const result = await testClientJiraConnection({
        clientId: selected.clientId,
      });
      if (!result.success) {
        updateLocal(selected.clientId, {
          lastTestStatus: "FAILED",
          lastTestMessage: result.error,
          lastTestedAt: new Date().toISOString(),
        });
        toast.error(result.error);
        return;
      }
      updateLocal(selected.clientId, {
        lastTestStatus: result.data.status,
        lastTestMessage: result.data.message,
        lastTestedAt: new Date().toISOString(),
      });
      toast.success(result.data.message);
      const refreshed = await listClientJiraConfigs();
      if (refreshed.success) setItems(refreshed.data);
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <p className="text-[12px] text-slate-500">
        No active clients — create a client first to attach a Jira site.
      </p>
    );
  }

  return (
    <Card className="border-sky-200">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Client Jira (per company)</CardTitle>
            <CardDescription>
              Different Atlassian sites per client. Falls back to global Jira
              card above when a client has no config. Optional project key
              override lives on each portal Project. Scheduled pull (every 15
              min when enabled) imports/updates tickets for each company with
              Client Jira saved.
            </CardDescription>
          </div>
          {selected && statusBadge(selected.lastTestStatus)}
        </div>
        <div className="max-w-md space-y-1">
          <Label>Company</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger>
              <SelectValue placeholder="Select client" />
            </SelectTrigger>
            <SelectContent>
              {items.map((c) => (
                <SelectItem key={c.clientId} value={c.clientId}>
                  {c.clientCode} · {c.clientName}
                  {c.configured ? "" : " (using global)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      {selected && (
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[12px] font-medium text-slate-700">
                Enabled = ticket push for this company
              </p>
              <p className="text-[11px] text-slate-500">
                Test / personnel verify / import pull work with credentials
                saved (Enabled not required).
              </p>
            </div>
            <Switch
              checked={selected.enabled}
              disabled={!canEdit || isPending}
              onCheckedChange={(checked) =>
                updateLocal(selected.clientId, { enabled: checked })
              }
            />
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Base URL</Label>
              <Input
                placeholder="https://your-org.atlassian.net"
                value={String(selected.config.baseUrl ?? "")}
                disabled={!canEdit}
                onChange={(e) => updateConfig("baseUrl", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Default project key</Label>
              <Input
                value={String(selected.config.projectKey ?? "")}
                disabled={!canEdit}
                onChange={(e) =>
                  updateConfig("projectKey", e.target.value.toUpperCase())
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Issue type</Label>
              <Input
                value={String(selected.config.issueType ?? "Task")}
                disabled={!canEdit}
                onChange={(e) => updateConfig("issueType", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Account email</Label>
              <Input
                type="email"
                value={String(selected.config.email ?? "")}
                disabled={!canEdit}
                onChange={(e) => updateConfig("email", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>API token</Label>
              <Input
                type="password"
                autoComplete="off"
                placeholder="Paste Atlassian API token"
                value={String(selected.config.apiToken ?? "")}
                disabled={!canEdit}
                onChange={(e) => updateConfig("apiToken", e.target.value)}
              />
            </div>
          </div>

          {selected.lastTestMessage && (
            <p className="text-xs text-slate-500">{selected.lastTestMessage}</p>
          )}

          {canEdit ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" disabled={isPending} onClick={handleSave}>
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plug className="h-4 w-4" />
                )}
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={handleTest}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PlugZap className="h-4 w-4" />
                )}
                Test connection
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await runJiraPullNow();
                    if (!result.success) {
                      toast.error(result.error);
                      return;
                    }
                    toast.success(result.data.message);
                    const refreshed = await listClientJiraConfigs();
                    if (refreshed.success) setItems(refreshed.data);
                    router.refresh();
                  })
                }
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CloudDownload className="h-4 w-4" />
                )}
                Pull all companies now
              </Button>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Read-only · only SYS_ADMIN can edit client Jira
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
