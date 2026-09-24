"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Medal, Search, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  getLeaderboard,
  type LeaderboardData,
  type LeaderboardRow,
} from "@/lib/actions/leaderboard";
import {
  LEADERBOARD_METRIC_LABELS,
  leaderboardMetrics,
  type LeaderboardMetric,
} from "@/lib/validations/leaderboard";
import { cn, formatScore } from "@/lib/utils";

export interface LeaderboardBoardProps {
  initialData: LeaderboardData;
}

function formatValue(metric: LeaderboardMetric, value: number): string {
  if (metric === "evaluation") return formatScore(value);
  if (metric === "hours") return `${value.toFixed(1)}h`;
  return value > 0 ? `+${value}` : String(value);
}

function rankBadge(rank: number) {
  if (rank === 1) return <Badge variant="warning">1st</Badge>;
  if (rank === 2) return <Badge variant="secondary">2nd</Badge>;
  if (rank === 3) return <Badge variant="outline">3rd</Badge>;
  return <span className="tabular-nums text-slate-500">#{rank}</span>;
}

function statusBadge(row: LeaderboardRow) {
  switch (row.badge) {
    case "top":
      return <Badge variant="success">Top</Badge>;
    case "good":
      return <Badge variant="secondary">Good</Badge>;
    case "watch":
      return <Badge variant="destructive">Watch</Badge>;
    default:
      return <Badge variant="outline">—</Badge>;
  }
}

const MONTHS = [
  { value: "1", label: "Jan" },
  { value: "2", label: "Feb" },
  { value: "3", label: "Mar" },
  { value: "4", label: "Apr" },
  { value: "5", label: "May" },
  { value: "6", label: "Jun" },
  { value: "7", label: "Jul" },
  { value: "8", label: "Aug" },
  { value: "9", label: "Sep" },
  { value: "10", label: "Oct" },
  { value: "11", label: "Nov" },
  { value: "12", label: "Dec" },
];

export function LeaderboardBoard({ initialData }: LeaderboardBoardProps) {
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState(initialData);
  const [metric, setMetric] = useState<LeaderboardMetric>(initialData.metric);
  const [year, setYear] = useState(String(initialData.year));
  const [month, setMonth] = useState(String(initialData.month));

  const years = (() => {
    const current = new Date().getFullYear();
    return [current - 1, current, current + 1].map(String);
  })();

  function runQuery() {
    startTransition(async () => {
      const result = await getLeaderboard({
        metric,
        year: Number(year),
        month: Number(month),
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setData(result.data);
      toast.success(`Leaderboard · ${result.data.rows.length} developers`);
    });
  }

  return (
    <div className="page-stack">
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Rank by evaluation, reward points, or logged hours for a month
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1 lg:col-span-2">
              <Select
                value={metric}
                onValueChange={(v) => setMetric(v as LeaderboardMetric)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {leaderboardMetrics.map((m) => (
                    <SelectItem key={m} value={m}>
                      {LEADERBOARD_METRIC_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger>
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger>
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              className="h-9"
              onClick={runQuery}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {data.podium.length > 0 && (
        <div className="grid gap-2.5 sm:grid-cols-3">
          {data.podium.map((row, idx) => (
            <Card
              key={row.developerId}
              className={cn(
                row.isCurrentUser && "border-slate-900",
                idx === 0 && "sm:order-2",
                idx === 1 && "sm:order-1",
                idx === 2 && "sm:order-3"
              )}
            >
              <CardHeader className="pb-1">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-1.5 text-[13px]">
                    {idx === 0 ? (
                      <Trophy className="h-3.5 w-3.5 text-amber-600" />
                    ) : (
                      <Medal className="h-3.5 w-3.5 text-slate-400" />
                    )}
                    {rankBadge(row.rank)}
                  </CardTitle>
                  {statusBadge(row)}
                </div>
                <CardDescription className="text-[12px] text-slate-700">
                  {row.developerName}
                  {row.isCurrentUser ? " · you" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold tabular-nums tracking-tight">
                  {formatValue(data.metric, row.value)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {row.secondaryLabel}: {row.secondaryValue}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {data.metricLabel} · {data.periodLabel}
          </CardTitle>
          <CardDescription>
            {data.rows.length} active developer
            {data.rows.length === 1 ? "" : "s"}
            {data.metric === "evaluation"
              ? ` · replacement threshold ${data.replacementThreshold.toFixed(2)}`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.rows.length === 0 ? (
            <p className="text-[12px] text-slate-500">
              No developers to rank for this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rank</TableHead>
                  <TableHead>Developer</TableHead>
                  <TableHead className="hidden md:table-cell">Title</TableHead>
                  <TableHead className="text-right">{data.metricLabel}</TableHead>
                  <TableHead className="hidden lg:table-cell">Detail</TableHead>
                  <TableHead>Flag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow
                    key={row.developerId}
                    className={cn(row.isCurrentUser && "bg-slate-50")}
                  >
                    <TableCell>{rankBadge(row.rank)}</TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">
                        {row.developerName}
                        {row.isCurrentUser && (
                          <span className="ml-1 text-[11px] font-normal text-slate-400">
                            (you)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {row.email}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {row.jobTitle}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatValue(data.metric, row.value)}
                    </TableCell>
                    <TableCell className="hidden text-[12px] text-slate-500 lg:table-cell">
                      {row.secondaryValue}
                    </TableCell>
                    <TableCell>{statusBadge(row)}</TableCell>
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
