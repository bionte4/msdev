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
import type { EvaluationListItem } from "@/lib/actions/evaluations";
import { EVALUATION_REPLACEMENT_THRESHOLD } from "@/lib/constants";
import { formatScore } from "@/lib/utils";

export interface EvaluationListProps {
  items: EvaluationListItem[];
}

export function EvaluationList({ items }: EvaluationListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent evaluations</CardTitle>
        <CardDescription>
          Scores below {EVALUATION_REPLACEMENT_THRESHOLD.toFixed(2)} show a
          replacement ticket
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">No evaluations yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Developer</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Replacement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.developerName}
                  </TableCell>
                  <TableCell>
                    {String(item.month).padStart(2, "0")}/{item.year}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        item.totalScore < EVALUATION_REPLACEMENT_THRESHOLD
                          ? "font-semibold text-red-600"
                          : "font-medium"
                      }
                    >
                      {formatScore(item.totalScore)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {item.hasReplacement ? (
                      <Badge variant="destructive">Ticket open</Badge>
                    ) : (
                      <Badge variant="secondary">None</Badge>
                    )}
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
