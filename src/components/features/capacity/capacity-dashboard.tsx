"use client";

import { AlertTriangle, Clock, Users, Gauge } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import type { CapacityDashboardData } from "@/lib/actions/capacity";
import type { DeveloperCapacityRow } from "@/lib/validations/capacity";
import { formatHours } from "@/lib/utils";

export interface CapacityDashboardProps {
  data: CapacityDashboardData;
  hideHeader?: boolean;
}

function statusBadge(status: DeveloperCapacityRow["status"]) {
  switch (status) {
    case "over_cap":
      return <Badge variant="destructive">Over cap</Badge>;
    case "critical":
      return <Badge variant="warning">Critical</Badge>;
    case "warning":
      return <Badge variant="warning">Warning</Badge>;
    default:
      return <Badge variant="success">OK</Badge>;
  }
}

function progressColor(status: DeveloperCapacityRow["status"]): string {
  switch (status) {
    case "over_cap":
      return "bg-red-600";
    case "critical":
      return "bg-amber-500";
    case "warning":
      return "bg-amber-400";
    default:
      return "bg-emerald-600";
  }
}

export function CapacityDashboard({
  data,
  hideHeader = false,
}: CapacityDashboardProps) {
  const stats = [
    {
      label: "Developers",
      value: String(data.totals.developers),
      icon: Users,
    },
    {
      label: "Logged hours",
      value: formatHours(data.totals.totalLoggedHours),
      icon: Clock,
    },
    {
      label: "Avg utilization",
      value: `${data.totals.averageUtilization}%`,
      icon: Gauge,
    },
    {
      label: "At risk / over",
      value: `${data.totals.nearCapCount} / ${data.totals.overCapCount}`,
      icon: AlertTriangle,
    },
  ];

  return (
    <div className="page-stack">
      {!hideHeader && (
        <PageHeader
          title="Weekly capacity"
          description={`Week of ${new Date(data.weekStart).toLocaleDateString()} – ${new Date(data.weekEnd).toLocaleDateString()} · Warning ${data.warningThreshold}h · Hard cap ${data.hardCap}h`}
        />
      )}

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-1">
              <CardTitle className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">
                {stat.label}
              </CardTitle>
              <stat.icon className="h-3.5 w-3.5 text-slate-400" />
            </CardHeader>
            <CardContent className="pb-3 pt-0">
              <p className="text-xl font-semibold tracking-tight text-slate-900">
                {stat.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team utilization</CardTitle>
          <CardDescription>
            Logged hours vs standard capacity and weekly hard cap
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.rows.length === 0 ? (
            <p className="text-[12px] text-slate-500">
              No active developers found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Developer</TableHead>
                  <TableHead className="hidden md:table-cell">Logged</TableHead>
                  <TableHead className="hidden lg:table-cell">OT</TableHead>
                  <TableHead>Utilization</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => {
                  const capPercent = Math.min(
                    100,
                    (row.loggedHours / data.hardCap) * 100
                  );
                  return (
                    <TableRow key={row.developerId}>
                      <TableCell>
                        <div className="font-medium text-slate-900">
                          {row.developerName}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {row.email}
                        </div>
                      </TableCell>
                      <TableCell className="hidden tabular-nums md:table-cell">
                        {formatHours(row.loggedHours)} /{" "}
                        {formatHours(row.standardCapacity)}
                      </TableCell>
                      <TableCell className="hidden tabular-nums lg:table-cell">
                        {formatHours(row.overtimeHours)}
                      </TableCell>
                      <TableCell className="min-w-[120px]">
                        <div className="mb-1 flex justify-between text-[11px] tabular-nums text-slate-500">
                          <span>{row.utilizationPercent}%</span>
                          <span>{formatHours(row.loggedHours)}</span>
                        </div>
                        <Progress
                          value={capPercent}
                          indicatorClassName={progressColor(row.status)}
                        />
                      </TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
