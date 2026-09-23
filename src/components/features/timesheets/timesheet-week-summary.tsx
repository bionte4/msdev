"use client";

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
import type { WeeklyTimesheetSummary } from "@/lib/actions/timesheets";
import { formatHours } from "@/lib/utils";

export interface TimesheetWeekSummaryProps {
  summary: WeeklyTimesheetSummary;
}

export function TimesheetWeekSummary({ summary }: TimesheetWeekSummaryProps) {
  const progressValue = Math.min(
    100,
    (summary.totalHours / summary.hardCap) * 100
  );

  const indicatorClass =
    summary.isOverCap
      ? "bg-red-600"
      : summary.isNearCap
        ? "bg-amber-500"
        : "bg-emerald-600";

  return (
    <div className="page-stack">
      <Card>
        <CardHeader>
          <CardTitle>This week</CardTitle>
          <CardDescription>
            {new Date(summary.weekStart).toLocaleDateString()} –{" "}
            {new Date(summary.weekEnd).toLocaleDateString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xl font-semibold tabular-nums tracking-tight text-slate-900">
                {formatHours(summary.totalHours)}
              </p>
              <p className="text-[12px] text-slate-500">
                of {formatHours(summary.hardCap)} hard cap ·{" "}
                {formatHours(summary.remainingToHardCap)} remaining
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {summary.isNearCap && !summary.isOverCap && (
                <Badge variant="warning">
                  Near warning ({summary.warningThreshold}h)
                </Badge>
              )}
              {summary.isOverCap && (
                <Badge variant="destructive">Hard cap reached</Badge>
              )}
              {!summary.isNearCap && (
                <Badge variant="success">Within capacity</Badge>
              )}
              <Badge variant="secondary">
                OT {formatHours(summary.overtimeHours)}
              </Badge>
            </div>
          </div>
          <Progress value={progressValue} indicatorClassName={indicatorClass} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entries</CardTitle>
          <CardDescription>
            {summary.entries.length} worklog
            {summary.entries.length === 1 ? "" : "s"} this week
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary.entries.length === 0 ? (
            <p className="text-sm text-slate-500">No timesheets logged yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{entry.workDate}</TableCell>
                    <TableCell>{entry.projectName}</TableCell>
                    <TableCell>
                      <span className="line-clamp-1">{entry.taskSummary}</span>
                      {entry.isOvertime && (
                        <Badge variant="warning" className="ml-2">
                          OT
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatHours(entry.hours)}
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
