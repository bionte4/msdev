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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTimesheet } from "@/lib/actions/timesheets";
import { MAX_DAILY_HOURS } from "@/lib/constants";

export interface TimesheetProjectOption {
  id: string;
  name: string;
  code: string;
}

export interface TimesheetFormProps {
  projects: TimesheetProjectOption[];
  onSuccess?: () => void;
}

export function TimesheetForm({ projects, onSuccess }: TimesheetFormProps) {
  const [isPending, startTransition] = useTransition();
  const [projectId, setProjectId] = useState("");
  const [workDate, setWorkDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [hours, setHours] = useState("8");
  const [taskSummary, setTaskSummary] = useState("");
  const [isOvertime, setIsOvertime] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await createTimesheet({
        projectId,
        workDate: new Date(workDate),
        hours: Number(hours),
        taskSummary,
        isOvertime,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `Logged ${result.data.hours}h on ${result.data.projectName}`
      );
      setTaskSummary("");
      setHours("8");
      setIsOvertime(false);
      onSuccess?.();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log Timesheet</CardTitle>
        <CardDescription>
          Max {MAX_DAILY_HOURS}h/day · Weekly hard cap 50h (warning at 45h)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="project">Project</Label>
              <Select value={projectId} onValueChange={setProjectId} required>
                <SelectTrigger id="project">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name} ({project.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="workDate">Work date</Label>
              <Input
                id="workDate"
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="hours">Hours</Label>
              <Input
                id="hours"
                type="number"
                min={0.5}
                max={MAX_DAILY_HOURS}
                step={0.5}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="taskSummary">Task summary</Label>
              <Textarea
                id="taskSummary"
                value={taskSummary}
                onChange={(e) => setTaskSummary(e.target.value)}
                placeholder="What did you work on?"
                required
                minLength={5}
              />
            </div>

            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                id="isOvertime"
                type="checkbox"
                checked={isOvertime}
                onChange={(e) => setIsOvertime(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <Label htmlFor="isOvertime">Mark as overtime</Label>
            </div>
          </div>

          <Button type="submit" disabled={isPending || !projectId} className="w-full sm:w-auto">
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Submit timesheet"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
