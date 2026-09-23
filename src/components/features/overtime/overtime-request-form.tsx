"use client";

import { useState, useTransition } from "react";
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
import { createOvertimeRequest } from "@/lib/actions/overtime";
import { MAX_DAILY_HOURS } from "@/lib/constants";

export interface OvertimeRequestFormProps {
  onSuccess?: () => void;
}

export function OvertimeRequestForm({ onSuccess }: OvertimeRequestFormProps) {
  const [isPending, startTransition] = useTransition();
  const [workDate, setWorkDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [requestedHours, setRequestedHours] = useState("2");
  const [reason, setReason] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await createOvertimeRequest({
        workDate: new Date(workDate),
        requestedHours: Number(requestedHours),
        reason,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `Overtime request submitted for ${result.data.requestedHours}h on ${result.data.workDate}`
      );
      setReason("");
      setRequestedHours("2");
      onSuccess?.();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request overtime</CardTitle>
        <CardDescription>
          Pre-approval required before logging OT · Daily max {MAX_DAILY_HOURS}
          h · Weekly hard cap 50h
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="otWorkDate">Work date</Label>
              <Input
                id="otWorkDate"
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="otHours">Requested hours</Label>
              <Input
                id="otHours"
                type="number"
                min={0.5}
                max={MAX_DAILY_HOURS}
                step={0.5}
                value={requestedHours}
                onChange={(e) => setRequestedHours(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="otReason">Reason</Label>
              <Textarea
                id="otReason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is overtime needed? Reference task / deadline."
                required
                minLength={10}
              />
            </div>
          </div>
          <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : (
              "Submit for client approval"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
