"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Mail,
  Server,
  Ticket,
  Workflow,
  Plug,
  type LucideIcon,
} from "lucide-react";
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
  testIntegration,
  upsertIntegration,
  type IntegrationCardData,
} from "@/lib/actions/integrations";
import type {
  IntegrationProviderKey,
  UpsertIntegrationInput,
} from "@/lib/validations/integrations";

export interface IntegrationsBoardProps {
  initialItems: IntegrationCardData[];
  canEdit: boolean;
}

const PROVIDER_META: Record<
  IntegrationProviderKey,
  { icon: LucideIcon; accent: string }
> = {
  EMAIL: { icon: Mail, accent: "text-sky-700 bg-sky-50" },
  SMTP: { icon: Server, accent: "text-emerald-700 bg-emerald-50" },
  JIRA: { icon: Ticket, accent: "text-indigo-700 bg-indigo-50" },
  SERVICENOW: { icon: Workflow, accent: "text-orange-700 bg-orange-50" },
};

function statusBadge(
  status: IntegrationCardData["lastTestStatus"]
): React.ReactNode {
  switch (status) {
    case "SUCCESS":
      return <Badge variant="success">Test OK</Badge>;
    case "FAILED":
      return <Badge variant="destructive">Test failed</Badge>;
    default:
      return <Badge variant="secondary">Not tested</Badge>;
  }
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function IntegrationsBoard({
  initialItems,
  canEdit,
}: IntegrationsBoardProps) {
  const [items, setItems] = useState(initialItems);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ordered = useMemo(
    () =>
      [...items].sort((a, b) =>
        a.provider.localeCompare(b.provider)
      ),
    [items]
  );

  function updateLocal(
    provider: IntegrationProviderKey,
    patch: Partial<IntegrationCardData>
  ) {
    setItems((prev) =>
      prev.map((item) =>
        item.provider === provider ? { ...item, ...patch } : item
      )
    );
  }

  function updateConfig(
    provider: IntegrationProviderKey,
    key: string,
    value: string | number | boolean
  ) {
    setItems((prev) =>
      prev.map((item) =>
        item.provider === provider
          ? { ...item, config: { ...item.config, [key]: value } }
          : item
      )
    );
  }

  function buildPayload(item: IntegrationCardData): UpsertIntegrationInput {
    const enabled = item.enabled;
    const c = item.config;

    if (item.provider === "EMAIL") {
      return {
        provider: "EMAIL",
        enabled,
        config: {
          fromName: String(c.fromName ?? ""),
          fromAddress: String(c.fromAddress ?? ""),
          replyTo: String(c.replyTo ?? ""),
          defaultCc: String(c.defaultCc ?? ""),
        },
      };
    }

    if (item.provider === "SMTP") {
      return {
        provider: "SMTP",
        enabled,
        config: {
          host: String(c.host ?? ""),
          port: Number(c.port ?? 587),
          username: String(c.username ?? ""),
          password: String(c.password ?? ""),
          secure: Boolean(c.secure),
          fromOverride: String(c.fromOverride ?? ""),
        },
      };
    }

    if (item.provider === "JIRA") {
      return {
        provider: "JIRA",
        enabled,
        config: {
          baseUrl: String(c.baseUrl ?? ""),
          email: String(c.email ?? ""),
          apiToken: String(c.apiToken ?? ""),
          projectKey: String(c.projectKey ?? ""),
          issueType: String(c.issueType ?? "Task"),
        },
      };
    }

    return {
      provider: "SERVICENOW",
      enabled,
      config: {
        instanceUrl: String(c.instanceUrl ?? ""),
        username: String(c.username ?? ""),
        password: String(c.password ?? ""),
        clientId: String(c.clientId ?? ""),
        clientSecret: String(c.clientSecret ?? ""),
        assignmentGroup: String(c.assignmentGroup ?? ""),
      },
    };
  }

  function handleSave(item: IntegrationCardData) {
    setPendingKey(`${item.provider}:save`);
    startTransition(async () => {
      const result = await upsertIntegration(buildPayload(item));
      setPendingKey(null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setItems((prev) =>
        prev.map((row) =>
          row.provider === result.data.provider ? result.data : row
        )
      );
      toast.success(`${item.displayName} saved`);
    });
  }

  function handleTest(item: IntegrationCardData) {
    setPendingKey(`${item.provider}:test`);
    startTransition(async () => {
      const result = await testIntegration(item.provider);
      setPendingKey(null);
      if (!result.success) {
        updateLocal(item.provider, {
          lastTestStatus: "FAILED",
          lastTestMessage: result.error,
          lastTestedAt: new Date().toISOString(),
        });
        toast.error(result.error);
        return;
      }
      updateLocal(item.provider, {
        lastTestStatus: result.data.status,
        lastTestMessage: result.data.message,
        lastTestedAt: new Date().toISOString(),
      });
      toast.success(result.data.message);
    });
  }

  return (
    <div className="grid gap-2.5 md:grid-cols-2">
      {ordered.map((item) => {
        const meta = PROVIDER_META[item.provider];
        const Icon = meta.icon;
        const saving = isPending && pendingKey === `${item.provider}:save`;
        const testing = isPending && pendingKey === `${item.provider}:test`;

        return (
          <Card key={item.provider} className="overflow-hidden">
            <CardHeader className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-md ${meta.accent}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base">
                      {item.displayName}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {item.description}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {statusBadge(item.lastTestStatus)}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">
                      {item.enabled ? "Enabled" : "Disabled"}
                    </span>
                    <Switch
                      checked={item.enabled}
                      disabled={!canEdit || isPending}
                      onCheckedChange={(checked) =>
                        updateLocal(item.provider, { enabled: checked })
                      }
                    />
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {item.provider === "EMAIL" && (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <Field id={`${item.provider}-fromName`} label="From name">
                    <Input
                      id={`${item.provider}-fromName`}
                      value={String(item.config.fromName ?? "")}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateConfig(item.provider, "fromName", e.target.value)
                      }
                    />
                  </Field>
                  <Field id={`${item.provider}-fromAddress`} label="From email">
                    <Input
                      id={`${item.provider}-fromAddress`}
                      type="email"
                      value={String(item.config.fromAddress ?? "")}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateConfig(
                          item.provider,
                          "fromAddress",
                          e.target.value
                        )
                      }
                    />
                  </Field>
                  <Field id={`${item.provider}-replyTo`} label="Reply-to">
                    <Input
                      id={`${item.provider}-replyTo`}
                      type="email"
                      value={String(item.config.replyTo ?? "")}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateConfig(item.provider, "replyTo", e.target.value)
                      }
                    />
                  </Field>
                  <Field id={`${item.provider}-defaultCc`} label="Default CC">
                    <Input
                      id={`${item.provider}-defaultCc`}
                      value={String(item.config.defaultCc ?? "")}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateConfig(item.provider, "defaultCc", e.target.value)
                      }
                    />
                  </Field>
                </div>
              )}

              {item.provider === "SMTP" && (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <Field id={`${item.provider}-host`} label="Host">
                    <Input
                      id={`${item.provider}-host`}
                      value={String(item.config.host ?? "")}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateConfig(item.provider, "host", e.target.value)
                      }
                    />
                  </Field>
                  <Field id={`${item.provider}-port`} label="Port">
                    <Input
                      id={`${item.provider}-port`}
                      type="number"
                      value={String(item.config.port ?? "")}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateConfig(
                          item.provider,
                          "port",
                          Number(e.target.value)
                        )
                      }
                    />
                  </Field>
                  <Field id={`${item.provider}-username`} label="Username">
                    <Input
                      id={`${item.provider}-username`}
                      value={String(item.config.username ?? "")}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateConfig(item.provider, "username", e.target.value)
                      }
                    />
                  </Field>
                  <Field id={`${item.provider}-password`} label="Password">
                    <Input
                      id={`${item.provider}-password`}
                      type="password"
                      value={String(item.config.password ?? "")}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateConfig(item.provider, "password", e.target.value)
                      }
                    />
                  </Field>
                  <Field
                    id={`${item.provider}-fromOverride`}
                    label="From override"
                  >
                    <Input
                      id={`${item.provider}-fromOverride`}
                      type="email"
                      value={String(item.config.fromOverride ?? "")}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateConfig(
                          item.provider,
                          "fromOverride",
                          e.target.value
                        )
                      }
                    />
                  </Field>
                  <div className="flex items-end gap-2 pb-1">
                    <Switch
                      checked={Boolean(item.config.secure)}
                      disabled={!canEdit}
                      onCheckedChange={(checked) =>
                        updateConfig(item.provider, "secure", checked)
                      }
                    />
                    <Label>TLS / secure</Label>
                  </div>
                </div>
              )}

              {item.provider === "JIRA" && (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <Field id={`${item.provider}-baseUrl`} label="Base URL">
                    <Input
                      id={`${item.provider}-baseUrl`}
                      value={String(item.config.baseUrl ?? "")}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateConfig(item.provider, "baseUrl", e.target.value)
                      }
                    />
                  </Field>
                  <Field id={`${item.provider}-projectKey`} label="Project key">
                    <Input
                      id={`${item.provider}-projectKey`}
                      value={String(item.config.projectKey ?? "")}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateConfig(
                          item.provider,
                          "projectKey",
                          e.target.value.toUpperCase()
                        )
                      }
                    />
                  </Field>
                  <Field id={`${item.provider}-email`} label="Account email">
                    <Input
                      id={`${item.provider}-email`}
                      type="email"
                      value={String(item.config.email ?? "")}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateConfig(item.provider, "email", e.target.value)
                      }
                    />
                  </Field>
                  <Field id={`${item.provider}-apiToken`} label="API token">
                    <Input
                      id={`${item.provider}-apiToken`}
                      type="password"
                      value={String(item.config.apiToken ?? "")}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateConfig(item.provider, "apiToken", e.target.value)
                      }
                    />
                  </Field>
                  <Field id={`${item.provider}-issueType`} label="Issue type">
                    <Input
                      id={`${item.provider}-issueType`}
                      value={String(item.config.issueType ?? "Task")}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateConfig(item.provider, "issueType", e.target.value)
                      }
                    />
                  </Field>
                </div>
              )}

              {item.provider === "SERVICENOW" && (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <Field
                    id={`${item.provider}-instanceUrl`}
                    label="Instance URL"
                  >
                    <Input
                      id={`${item.provider}-instanceUrl`}
                      value={String(item.config.instanceUrl ?? "")}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateConfig(
                          item.provider,
                          "instanceUrl",
                          e.target.value
                        )
                      }
                    />
                  </Field>
                  <Field
                    id={`${item.provider}-assignmentGroup`}
                    label="Assignment group"
                  >
                    <Input
                      id={`${item.provider}-assignmentGroup`}
                      value={String(item.config.assignmentGroup ?? "")}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateConfig(
                          item.provider,
                          "assignmentGroup",
                          e.target.value
                        )
                      }
                    />
                  </Field>
                  <Field id={`${item.provider}-username`} label="Username">
                    <Input
                      id={`${item.provider}-username`}
                      value={String(item.config.username ?? "")}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateConfig(item.provider, "username", e.target.value)
                      }
                    />
                  </Field>
                  <Field id={`${item.provider}-password`} label="Password">
                    <Input
                      id={`${item.provider}-password`}
                      type="password"
                      value={String(item.config.password ?? "")}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateConfig(item.provider, "password", e.target.value)
                      }
                    />
                  </Field>
                  <Field id={`${item.provider}-clientId`} label="Client ID">
                    <Input
                      id={`${item.provider}-clientId`}
                      value={String(item.config.clientId ?? "")}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateConfig(item.provider, "clientId", e.target.value)
                      }
                    />
                  </Field>
                  <Field
                    id={`${item.provider}-clientSecret`}
                    label="Client secret"
                  >
                    <Input
                      id={`${item.provider}-clientSecret`}
                      type="password"
                      value={String(item.config.clientSecret ?? "")}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateConfig(
                          item.provider,
                          "clientSecret",
                          e.target.value
                        )
                      }
                    />
                  </Field>
                </div>
              )}

              {item.lastTestMessage && (
                <p className="text-xs text-slate-500">{item.lastTestMessage}</p>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {canEdit ? (
                  <>
                    <Button
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleSave(item)}
                    >
                      {saving ? (
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
                      onClick={() => handleTest(item)}
                    >
                      {testing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      Test connection
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">
                    Read-only · only SYS_ADMIN can edit integrations
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
