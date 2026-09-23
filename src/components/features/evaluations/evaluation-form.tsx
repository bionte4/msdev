"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { submitMonthlyEvaluation } from "@/lib/actions/evaluations";
import { calculateWeightedScore } from "@/lib/validations/evaluation";
import {
  EVALUATION_REPLACEMENT_THRESHOLD,
  EVALUATION_WEIGHTS,
} from "@/lib/constants";
import { formatScore } from "@/lib/utils";

export interface EvaluationDeveloperOption {
  id: string;
  name: string;
}

export interface EvaluationFormProps {
  developers: EvaluationDeveloperOption[];
  onSuccess?: () => void;
}

interface ScoreState {
  codeQuality: string;
  delivery: string;
  technical: string;
  communication: string;
  professionalism: string;
}

export function EvaluationForm({
  developers,
  onSuccess,
}: EvaluationFormProps) {
  const now = new Date();
  const [isPending, startTransition] = useTransition();
  const [developerId, setDeveloperId] = useState("");
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [comments, setComments] = useState("");
  const [scores, setScores] = useState<ScoreState>({
    codeQuality: "3",
    delivery: "3",
    technical: "3",
    communication: "3",
    professionalism: "3",
  });

  const previewScore = useMemo(() => {
    return calculateWeightedScore({
      codeQuality: Number(scores.codeQuality) || 0,
      delivery: Number(scores.delivery) || 0,
      technical: Number(scores.technical) || 0,
      communication: Number(scores.communication) || 0,
      professionalism: Number(scores.professionalism) || 0,
    });
  }, [scores]);

  const willTriggerReplacement =
    previewScore < EVALUATION_REPLACEMENT_THRESHOLD;

  function updateScore(key: keyof ScoreState, value: string) {
    setScores((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await submitMonthlyEvaluation({
        developerId,
        year: Number(year),
        month: Number(month),
        codeQuality: Number(scores.codeQuality),
        delivery: Number(scores.delivery),
        technical: Number(scores.technical),
        communication: Number(scores.communication),
        professionalism: Number(scores.professionalism),
        comments: comments || undefined,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      if (result.data.replacementTriggered) {
        toast.warning(
          `Score ${formatScore(result.data.totalScore)} triggered replacement ticket (SLA due ${result.data.slaDueDate ? new Date(result.data.slaDueDate).toLocaleDateString() : "TBD"})`
        );
      } else {
        toast.success(
          `Evaluation saved · Total ${formatScore(result.data.totalScore)}`
        );
      }

      setComments("");
      onSuccess?.();
    });
  }

  const scoreFields: {
    key: keyof ScoreState;
    label: string;
    weight: number;
  }[] = [
    { key: "codeQuality", label: "Code quality", weight: EVALUATION_WEIGHTS.codeQuality },
    { key: "delivery", label: "Delivery", weight: EVALUATION_WEIGHTS.delivery },
    { key: "technical", label: "Technical", weight: EVALUATION_WEIGHTS.technical },
    { key: "communication", label: "Communication", weight: EVALUATION_WEIGHTS.communication },
    { key: "professionalism", label: "Professionalism", weight: EVALUATION_WEIGHTS.professionalism },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly evaluation</CardTitle>
        <CardDescription>
          Weighted score · Replacement auto-triggered if total &lt;{" "}
          {EVALUATION_REPLACEMENT_THRESHOLD.toFixed(2)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-2.5 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-3 lg:col-span-1">
              <Label>Developer</Label>
              <Select value={developerId} onValueChange={setDeveloperId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select developer" />
                </SelectTrigger>
                <SelectContent>
                  {developers.map((dev) => (
                    <SelectItem key={dev.id} value={dev.id}>
                      {dev.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                type="number"
                min={2020}
                max={2100}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="month">Month</Label>
              <Input
                id="month"
                type="number"
                min={1}
                max={12}
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {scoreFields.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={field.key}>
                  {field.label}{" "}
                  <span className="text-slate-400">
                    ({Math.round(field.weight * 100)}%)
                  </span>
                </Label>
                <Input
                  id={field.key}
                  type="number"
                  min={1}
                  max={5}
                  step={0.1}
                  value={scores[field.key]}
                  onChange={(e) => updateScore(field.key, e.target.value)}
                  required
                />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Live weighted total
              </p>
              <p className="text-xl font-semibold tabular-nums tracking-tight">
                {formatScore(previewScore)}
              </p>
            </div>
            {willTriggerReplacement ? (
              <Badge variant="destructive">
                Will create replacement ticket (SLA 10 working days)
              </Badge>
            ) : (
              <Badge variant="success">Above replacement threshold</Badge>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="comments">Comments (optional)</Label>
            <Textarea
              id="comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Performance notes for this period"
            />
          </div>

          <Button
            type="submit"
            disabled={isPending || !developerId}
            className="w-full sm:w-auto"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : (
              "Submit evaluation"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
