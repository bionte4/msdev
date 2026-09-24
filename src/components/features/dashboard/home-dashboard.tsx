import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Info,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import type { HomeDashboardData } from "@/lib/actions/dashboard";
import { cn } from "@/lib/utils";

export interface HomeDashboardProps {
  data: HomeDashboardData;
}

function kpiToneClass(tone: HomeDashboardData["kpis"][number]["tone"]): string {
  switch (tone) {
    case "danger":
      return "border-red-200 bg-red-50/60";
    case "warning":
      return "border-amber-200 bg-amber-50/60";
    case "success":
      return "border-emerald-200 bg-emerald-50/50";
    default:
      return "border-slate-200 bg-white";
  }
}

function attentionIcon(tone: HomeDashboardData["attention"][number]["tone"]) {
  switch (tone) {
    case "danger":
      return <AlertTriangle className="h-3.5 w-3.5 text-red-600" />;
    case "warning":
      return <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />;
    default:
      return <Info className="h-3.5 w-3.5 text-sky-600" />;
  }
}

export function HomeDashboard({ data }: HomeDashboardProps) {
  return (
    <div className="page-stack">
      <PageHeader
        title="Dashboard"
        description={`Week ${data.weekLabel}`}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{data.role}</Badge>
            {data.engagementMode === "BODY_SHOPPING" && (
              <Badge variant="outline">Body shopping</Badge>
            )}
          </div>
        }
      />

      <div>
        <h2 className="text-[15px] font-semibold text-slate-900">
          Hello, {data.greetingName}
        </h2>
        <p className="mt-0.5 text-[12px] text-slate-500">
          Governance snapshot for your role and tenant scope.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {data.kpis.map((kpi) => {
          const card = (
            <Card className={cn("h-full transition-colors", kpiToneClass(kpi.tone))}>
              <CardHeader className="pb-1.5">
                <CardDescription className="text-[11px] uppercase tracking-wide">
                  {kpi.label}
                </CardDescription>
                <CardTitle className="text-[22px] tabular-nums tracking-tight">
                  {kpi.value}
                </CardTitle>
              </CardHeader>
              {kpi.hint ? (
                <CardContent className="pt-0">
                  <p className="text-[11px] text-slate-500">{kpi.hint}</p>
                </CardContent>
              ) : null}
            </Card>
          );
          return kpi.href ? (
            <Link key={kpi.key} href={kpi.href} className="block">
              {card}
            </Link>
          ) : (
            <div key={kpi.key}>{card}</div>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-[14px]">
              <Clock3 className="h-3.5 w-3.5 opacity-70" />
              Needs attention
            </CardTitle>
            <CardDescription>
              Queues and risks in your current scope
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {data.attention.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50/70 px-2.5 py-2 text-[12px] text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                No open queues right now.
              </div>
            ) : (
              data.attention.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-start gap-2 rounded-md border border-slate-150 bg-slate-50/80 px-2.5 py-2 transition-colors hover:bg-slate-100"
                >
                  <span className="mt-0.5">{attentionIcon(item.tone)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-medium text-slate-900">
                      {item.title}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      {item.detail}
                    </span>
                  </span>
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-[14px]">Quick links</CardTitle>
            <CardDescription>Jump to common workflows</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-[12px] transition-colors hover:bg-slate-100"
              >
                <span>
                  <span className="block font-medium text-slate-900">
                    {link.label}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    {link.description}
                  </span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
