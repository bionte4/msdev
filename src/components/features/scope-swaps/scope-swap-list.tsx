import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ScopeSwapListItem } from "@/lib/actions/scope-swaps";

export interface ScopeSwapListProps {
  items: ScopeSwapListItem[];
}

function statusVariant(
  status: string
): "secondary" | "success" | "destructive" | "warning" {
  switch (status) {
    case "APPROVED":
    case "COMPLETED":
      return "success";
    case "REJECTED":
      return "destructive";
    case "PENDING":
      return "warning";
    default:
      return "secondary";
  }
}

export function ScopeSwapList({ items }: ScopeSwapListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Scope swap history</CardTitle>
        <CardDescription>Recent 1-in / 1-out requests</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">No scope swaps yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Swap</TableHead>
                <TableHead className="hidden md:table-cell">SP / Hours</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.projectName}
                  </TableCell>
                  <TableCell>
                    <span className="text-slate-500">
                      {item.outDeveloperName}
                    </span>
                    {" → "}
                    <span>{item.inDeveloperName}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {item.outStoryPoints} SP / {item.outHours}h
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(item.status)}>
                      {item.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
