"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, Loader2 } from "lucide-react";
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
import { createScopeSwap } from "@/lib/actions/scope-swaps";
import { SCOPE_SWAP_TOLERANCE } from "@/lib/constants";

export interface ScopeSwapOption {
  id: string;
  name: string;
}

export interface ScopeSwapFormProps {
  projects: ScopeSwapOption[];
  developers: ScopeSwapOption[];
  onSuccess?: () => void;
}

export function ScopeSwapForm({
  projects,
  developers,
  onSuccess,
}: ScopeSwapFormProps) {
  const [isPending, startTransition] = useTransition();
  const [projectId, setProjectId] = useState("");
  const [outDeveloperId, setOutDeveloperId] = useState("");
  const [inDeveloperId, setInDeveloperId] = useState("");
  const [outStoryPoints, setOutStoryPoints] = useState("5");
  const [inStoryPoints, setInStoryPoints] = useState("5");
  const [outHours, setOutHours] = useState("8");
  const [inHours, setInHours] = useState("8");
  const [outTaskDescription, setOutTaskDescription] = useState("");
  const [inTaskDescription, setInTaskDescription] = useState("");
  const [rationale, setRationale] = useState("");

  const balanced = useMemo(() => {
    const spOk =
      Math.abs(Number(outStoryPoints) - Number(inStoryPoints)) <=
      SCOPE_SWAP_TOLERANCE;
    const hoursOk =
      Math.abs(Number(outHours) - Number(inHours)) <= SCOPE_SWAP_TOLERANCE;
    return spOk && hoursOk;
  }, [outStoryPoints, inStoryPoints, outHours, inHours]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await createScopeSwap({
        projectId,
        outDeveloperId,
        inDeveloperId,
        outStoryPoints: Number(outStoryPoints),
        inStoryPoints: Number(inStoryPoints),
        outHours: Number(outHours),
        inHours: Number(inHours),
        outTaskDescription,
        inTaskDescription,
        rationale,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `Scope swap created: ${result.data.outDeveloperName} → ${result.data.inDeveloperName}`
      );
      setOutTaskDescription("");
      setInTaskDescription("");
      setRationale("");
      onSuccess?.();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5" />
          Scope swap (1-in, 1-out)
        </CardTitle>
        <CardDescription>
          Story points and hours must match between outgoing and incoming work
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId} required>
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2.5 lg:grid-cols-2">
            <div className="space-y-1.5 rounded-md border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-slate-900">
                  Out (remove)
                </h3>
                <Badge variant="outline">1-out</Badge>
              </div>
              <div className="space-y-1">
                <Label>Developer</Label>
                <Select
                  value={outDeveloperId}
                  onValueChange={setOutDeveloperId}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Outgoing developer" />
                  </SelectTrigger>
                  <SelectContent>
                    {developers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="outSp">Story points</Label>
                  <Input
                    id="outSp"
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={outStoryPoints}
                    onChange={(e) => setOutStoryPoints(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="outHours">Hours</Label>
                  <Input
                    id="outHours"
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={outHours}
                    onChange={(e) => setOutHours(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="outTask">Task description</Label>
                <Textarea
                  id="outTask"
                  value={outTaskDescription}
                  onChange={(e) => setOutTaskDescription(e.target.value)}
                  required
                  minLength={10}
                />
              </div>
            </div>

            <div className="space-y-1.5 rounded-md border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-slate-900">
                  In (add)
                </h3>
                <Badge variant="outline">1-in</Badge>
              </div>
              <div className="space-y-1">
                <Label>Developer</Label>
                <Select
                  value={inDeveloperId}
                  onValueChange={setInDeveloperId}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Incoming developer" />
                  </SelectTrigger>
                  <SelectContent>
                    {developers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="inSp">Story points</Label>
                  <Input
                    id="inSp"
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={inStoryPoints}
                    onChange={(e) => setInStoryPoints(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="inHours">Hours</Label>
                  <Input
                    id="inHours"
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={inHours}
                    onChange={(e) => setInHours(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="inTask">Task description</Label>
                <Textarea
                  id="inTask"
                  value={inTaskDescription}
                  onChange={(e) => setInTaskDescription(e.target.value)}
                  required
                  minLength={10}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {balanced ? (
              <Badge variant="success">Balanced 1-in / 1-out</Badge>
            ) : (
              <Badge variant="destructive">
                Story points or hours are not equal
              </Badge>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="rationale">Rationale</Label>
            <Textarea
              id="rationale"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              required
              minLength={10}
              placeholder="Why is this swap needed?"
            />
          </div>

          <Button
            type="submit"
            disabled={
              isPending ||
              !projectId ||
              !outDeveloperId ||
              !inDeveloperId ||
              !balanced
            }
            className="w-full sm:w-auto"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Submit scope swap"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
