"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  exportAllReportsExcel,
  exportReportExcel,
  getReport,
  type ReportResult,
} from "@/lib/actions/reports";
import {
  REPORT_TYPE_LABELS,
  reportTypes,
  type ReportType,
} from "@/lib/validations/reports";

function defaultFrom(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

function downloadBase64Excel(filename: string, base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface ReportsBoardProps {
  canExportAll: boolean;
}

export function ReportsBoard({ canExportAll }: ReportsBoardProps) {
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState<ReportType>("timesheets");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [report, setReport] = useState<ReportResult | null>(null);

  const previewRows = useMemo(
    () => (report ? report.rows.slice(0, 100) : []),
    [report]
  );

  function runQuery() {
    startTransition(async () => {
      const result = await getReport({
        type,
        from: new Date(from),
        to: new Date(to),
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setReport(result.data);
      toast.success(`${result.data.label}: ${result.data.rows.length} rows`);
    });
  }

  function handleExportCurrent() {
    startTransition(async () => {
      const result = await exportReportExcel({
        type,
        from: new Date(from),
        to: new Date(to),
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      downloadBase64Excel(result.data.filename, result.data.base64);
      toast.success(`Downloaded ${result.data.filename}`);
    });
  }

  function handleExportAll() {
    startTransition(async () => {
      const result = await exportAllReportsExcel({
        from: new Date(from),
        to: new Date(to),
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      downloadBase64Excel(result.data.filename, result.data.base64);
      toast.success(`Downloaded ${result.data.filename}`);
    });
  }

  return (
    <div className="page-stack">
      <Card>
        <CardHeader>
          <CardTitle>Report filters</CardTitle>
          <CardDescription>
            Preview in portal · export current sheet or full pack to Excel (.xlsx)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label>Report type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as ReportType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {reportTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {REPORT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="report-from">From</Label>
              <Input
                id="report-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="report-to">To</Label>
              <Input
                id="report-to"
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Button
                type="button"
                size="sm"
                onClick={runQuery}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                Run
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleExportCurrent}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Export Excel
            </Button>
            {canExportAll && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleExportAll}
                disabled={isPending}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Export all sheets
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>{report?.label ?? REPORT_TYPE_LABELS[type]}</CardTitle>
            <CardDescription>
              {report
                ? `${report.from} → ${report.to} · ${report.rows.length} row(s)`
                : "Run a report to preview data"}
            </CardDescription>
          </div>
          {report && (
            <Badge variant="secondary">
              Preview {Math.min(previewRows.length, 100)}
              {report.rows.length > 100 ? ` / ${report.rows.length}` : ""}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {!report ? (
            <p className="text-[12px] text-slate-500">
              Choose type and date range, then click Run.
            </p>
          ) : report.rows.length === 0 ? (
            <p className="text-[12px] text-slate-500">
              No rows for this filter.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {report.columns.map((c) => (
                      <TableHead key={c.key}>{c.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, idx) => (
                    <TableRow key={idx}>
                      {report.columns.map((c) => (
                        <TableCell
                          key={c.key}
                          className={
                            typeof row[c.key] === "number"
                              ? "tabular-nums"
                              : undefined
                          }
                        >
                          {row[c.key] === null || row[c.key] === undefined
                            ? "—"
                            : String(row[c.key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
