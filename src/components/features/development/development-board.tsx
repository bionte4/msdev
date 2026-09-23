"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  assignDeveloperSkill,
  deleteCoaching,
  deleteDeveloperSkill,
  deletePerformanceAction,
  deleteSkillCatalog,
  deleteTraining,
  upsertCoaching,
  upsertPerformanceAction,
  upsertSkillCatalog,
  upsertSkillCategory,
  upsertTraining,
  type DevelopmentBoardData,
  type DevelopmentPermissions,
} from "@/lib/actions/development";

export interface DevelopmentBoardProps {
  data: DevelopmentBoardData;
}

export function DevelopmentBoard({ data }: DevelopmentBoardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const p = data.permissions;

  function refresh() {
    router.refresh();
  }

  return (
    <div className="page-stack">
      <SkillsSection
        categories={data.skillCategories}
        catalog={data.skillsCatalog}
        assignments={data.developerSkills}
        developers={data.developers}
        permissions={p}
        isPending={isPending}
        startTransition={startTransition}
        onDone={refresh}
      />
      <TrainingSection
        items={data.trainings}
        developers={data.developers}
        skillOptions={data.skillsCatalog.filter((s) => s.isActive)}
        canManage={p.canManageTraining}
        isPending={isPending}
        startTransition={startTransition}
        onDone={refresh}
      />
      <CoachingSection
        items={data.coachings}
        developers={data.developers}
        canManage={p.canManageCoaching}
        isPending={isPending}
        startTransition={startTransition}
        onDone={refresh}
      />
      <PerformanceSection
        items={data.performanceActions}
        developers={data.developers}
        canManage={p.canManagePerformance}
        isPending={isPending}
        startTransition={startTransition}
        onDone={refresh}
      />
    </div>
  );
}

function SkillsSection({
  categories,
  catalog,
  assignments,
  developers,
  permissions,
  isPending,
  startTransition,
  onDone,
}: {
  categories: DevelopmentBoardData["skillCategories"];
  catalog: DevelopmentBoardData["skillsCatalog"];
  assignments: DevelopmentBoardData["developerSkills"];
  developers: DevelopmentBoardData["developers"];
  permissions: DevelopmentPermissions;
  isPending: boolean;
  startTransition: (cb: () => void) => void;
  onDone: () => void;
}) {
  const activeCategories = categories.filter((c) => c.isActive);
  const activeSkills = catalog.filter((s) => s.isActive);

  const [categoryName, setCategoryName] = useState("");
  const [skillName, setSkillName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);

  const [developerId, setDeveloperId] = useState(developers[0]?.id ?? "");
  const [skillId, setSkillId] = useState("");
  const [level, setLevel] = useState("INTERMEDIATE");
  const [yearsExp, setYearsExp] = useState("1");

  function resetSkillForm() {
    setEditingSkillId(null);
    setSkillName("");
    setCategoryId("");
    setDescription("");
  }

  return (
    <div className="page-stack">
      <Card>
        <CardHeader>
          <CardTitle>Skill catalog</CardTitle>
          <CardDescription>
            Managed from database — add categories & skills (no hardcoded list)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {permissions.canManageCatalog ? (
            <>
              <form
                className="grid gap-2 sm:grid-cols-[1fr_auto]"
                onSubmit={(e) => {
                  e.preventDefault();
                  startTransition(async () => {
                    const result = await upsertSkillCategory({
                      name: categoryName,
                    });
                    if (!result.success) {
                      toast.error(result.error);
                      return;
                    }
                    toast.success(`Category “${result.data.name}” saved`);
                    setCategoryName("");
                    setCategoryId(result.data.id);
                    onDone();
                  });
                }}
              >
                <Input
                  placeholder="New category name (e.g. Backend)"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  required
                />
                <Button type="submit" size="sm" disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Add category
                </Button>
              </form>

              <form
                className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!categoryId) {
                    toast.error("Select a category first");
                    return;
                  }
                  startTransition(async () => {
                    const result = await upsertSkillCatalog({
                      id: editingSkillId ?? undefined,
                      name: skillName,
                      categoryId,
                      description: description || null,
                      isActive: true,
                    });
                    if (!result.success) {
                      toast.error(result.error);
                      return;
                    }
                    toast.success(
                      editingSkillId ? "Skill updated" : "Skill added to catalog"
                    );
                    resetSkillForm();
                    onDone();
                  });
                }}
              >
                <Input
                  placeholder="Skill name"
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  required
                />
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Description (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending || activeCategories.length === 0}
                >
                  {editingSkillId ? "Save skill" : "Add skill"}
                </Button>
                {editingSkillId && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={resetSkillForm}
                  >
                    Cancel edit
                  </Button>
                )}
              </form>

              {activeCategories.length === 0 && (
                <p className="text-[12px] text-amber-700">
                  Create a category first, then add skills to the catalog.
                </p>
              )}
            </>
          ) : (
            <p className="text-[12px] text-slate-500">
              Catalog is read-only for your role.
            </p>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Skill</TableHead>
                <TableHead className="hidden md:table-cell">Description</TableHead>
                <TableHead>Status</TableHead>
                {permissions.canManageCatalog && (
                  <TableHead className="w-[88px]">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {catalog.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={permissions.canManageCatalog ? 5 : 4}
                    className="text-[12px] text-slate-500"
                  >
                    Catalog empty — add categories and skills above.
                  </TableCell>
                </TableRow>
              ) : (
                catalog.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.categoryName}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="hidden max-w-[240px] md:table-cell">
                      <span className="line-clamp-1 text-slate-500">
                        {s.description || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {s.isActive ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    {permissions.canManageCatalog && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7"
                            disabled={isPending}
                            onClick={() => {
                              setEditingSkillId(s.id);
                              setSkillName(s.name);
                              setCategoryId(s.categoryId);
                              setDescription(s.description ?? "");
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-600"
                            disabled={isPending}
                            onClick={() =>
                              startTransition(async () => {
                                const result = await deleteSkillCatalog({
                                  id: s.id,
                                });
                                if (!result.success) {
                                  toast.error(result.error);
                                  return;
                                }
                                toast.success(
                                  "Skill removed / deactivated from catalog"
                                );
                                if (editingSkillId === s.id) resetSkillForm();
                                onDone();
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Developer skill matrix</CardTitle>
          <CardDescription>
            Assign skills from catalog with level & years of experience
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {permissions.canAssignSkills && (
            <form
              className="grid gap-2 sm:grid-cols-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!skillId) {
                  toast.error("Select a skill from catalog");
                  return;
                }
                startTransition(async () => {
                  const result = await assignDeveloperSkill({
                    developerId,
                    skillId,
                    level: level as
                      | "BEGINNER"
                      | "INTERMEDIATE"
                      | "ADVANCED"
                      | "EXPERT",
                    yearsExp: Number(yearsExp),
                  });
                  if (!result.success) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success("Skill assigned");
                  onDone();
                });
              }}
            >
              <Select value={developerId} onValueChange={setDeveloperId}>
                <SelectTrigger>
                  <SelectValue placeholder="Developer" />
                </SelectTrigger>
                <SelectContent>
                  {developers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={skillId} onValueChange={setSkillId}>
                <SelectTrigger>
                  <SelectValue placeholder="Skill from catalog" />
                </SelectTrigger>
                <SelectContent>
                  {activeSkills.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.categoryName} · {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"].map(
                    (l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={yearsExp}
                onChange={(e) => setYearsExp(e.target.value)}
                placeholder="Years"
              />
              <Button
                type="submit"
                size="sm"
                disabled={isPending || activeSkills.length === 0}
              >
                Assign
              </Button>
            </form>
          )}

          {activeSkills.length === 0 && (
            <p className="text-[12px] text-slate-500">
              No active skills in catalog yet — add them in Skill catalog first.
            </p>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Developer</TableHead>
                <TableHead>Skill</TableHead>
                <TableHead>Level</TableHead>
                <TableHead className="hidden md:table-cell">Years</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-[12px] text-slate-500">
                    No skill assignments yet.
                  </TableCell>
                </TableRow>
              ) : (
                assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.developerName}</TableCell>
                    <TableCell>
                      {a.skillName}
                      <span className="ml-1 text-[11px] text-slate-400">
                        ({a.category})
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{a.level}</Badge>
                    </TableCell>
                    <TableCell className="hidden tabular-nums md:table-cell">
                      {a.yearsExp ?? "—"}
                    </TableCell>
                    <TableCell>
                      {a.canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-600"
                          disabled={isPending}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await deleteDeveloperSkill({
                                id: a.id,
                              });
                              if (!result.success) {
                                toast.error(result.error);
                                return;
                              }
                              toast.success("Skill removed");
                              onDone();
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function TrainingSection({
  items,
  developers,
  skillOptions,
  canManage,
  isPending,
  startTransition,
  onDone,
}: {
  items: DevelopmentBoardData["trainings"];
  developers: DevelopmentBoardData["developers"];
  skillOptions: DevelopmentBoardData["skillsCatalog"];
  canManage: boolean;
  isPending: boolean;
  startTransition: (cb: () => void) => void;
  onDone: () => void;
}) {
  const [developerId, setDeveloperId] = useState(developers[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState("");
  const [hours, setHours] = useState("8");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [skillFocus, setSkillFocus] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Training</CardTitle>
        <CardDescription>Planned / in-progress / completed programs</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {canManage && (
          <form
            className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await upsertTraining({
                  developerId,
                  title,
                  provider,
                  hours: Number(hours),
                  startDate: new Date(startDate),
                  skillFocus,
                  status: "PLANNED",
                });
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Training added");
                setTitle("");
                setProvider("");
                onDone();
              });
            }}
          >
            <Select value={developerId} onValueChange={setDeveloperId}>
              <SelectTrigger>
                <SelectValue placeholder="Developer" />
              </SelectTrigger>
              <SelectContent>
                {developers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <Input
              placeholder="Provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              required
            />
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
            <Input
              type="number"
              min={0.5}
              step={0.5}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="Hours"
              required
            />
            <Button type="submit" size="sm" disabled={isPending}>
              Add training
            </Button>
            <Select
              value={skillFocus || "__none__"}
              onValueChange={(v) => setSkillFocus(v === "__none__" ? "" : v)}
            >
              <SelectTrigger className="sm:col-span-3 lg:col-span-6">
                <SelectValue placeholder="Skill focus from catalog (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No skill focus</SelectItem>
                {skillOptions.map((s) => (
                  <SelectItem key={s.id} value={s.name}>
                    {s.categoryName} · {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </form>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Developer</TableHead>
              <TableHead>Training</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Hours</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-[12px] text-slate-500">
                  No trainings yet.
                </TableCell>
              </TableRow>
            ) : (
              items.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.developerName}</TableCell>
                  <TableCell>
                    <div className="font-medium">{t.title}</div>
                    <div className="text-[11px] text-slate-500">
                      {t.provider} · {t.startDate}
                      {t.skillFocus ? ` · ${t.skillFocus}` : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{t.status}</Badge>
                  </TableCell>
                  <TableCell className="hidden tabular-nums md:table-cell">
                    {t.hours}h
                  </TableCell>
                  <TableCell>
                    {t.canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-600"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await deleteTraining({ id: t.id });
                            if (!result.success) {
                              toast.error(result.error);
                              return;
                            }
                            toast.success("Training deleted");
                            onDone();
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CoachingSection({
  items,
  developers,
  canManage,
  isPending,
  startTransition,
  onDone,
}: {
  items: DevelopmentBoardData["coachings"];
  developers: DevelopmentBoardData["developers"];
  canManage: boolean;
  isPending: boolean;
  startTransition: (cb: () => void) => void;
  onDone: () => void;
}) {
  const [developerId, setDeveloperId] = useState(developers[0]?.id ?? "");
  const [coachName, setCoachName] = useState("");
  const [topic, setTopic] = useState("");
  const [sessionDate, setSessionDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Coaching</CardTitle>
        <CardDescription>1:1 coaching sessions and outcomes</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {canManage && (
          <form
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await upsertCoaching({
                  developerId,
                  coachName,
                  topic,
                  sessionDate: new Date(sessionDate),
                  status: "SCHEDULED",
                  durationMin: 60,
                });
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Coaching scheduled");
                setCoachName("");
                setTopic("");
                onDone();
              });
            }}
          >
            <Select value={developerId} onValueChange={setDeveloperId}>
              <SelectTrigger>
                <SelectValue placeholder="Developer" />
              </SelectTrigger>
              <SelectContent>
                {developers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Coach name"
              value={coachName}
              onChange={(e) => setCoachName(e.target.value)}
              required
            />
            <Input
              placeholder="Topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              required
            />
            <Input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              required
            />
            <Button type="submit" size="sm" disabled={isPending}>
              Schedule
            </Button>
          </form>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Developer</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Date</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-[12px] text-slate-500">
                  No coaching sessions yet.
                </TableCell>
              </TableRow>
            ) : (
              items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.developerName}</TableCell>
                  <TableCell>
                    <div className="font-medium">{c.topic}</div>
                    <div className="text-[11px] text-slate-500">
                      Coach: {c.coachName}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{c.status}</Badge>
                  </TableCell>
                  <TableCell className="hidden tabular-nums md:table-cell">
                    {c.sessionDate} · {c.durationMin}m
                  </TableCell>
                  <TableCell>
                    {c.canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-600"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await deleteCoaching({ id: c.id });
                            if (!result.success) {
                              toast.error(result.error);
                              return;
                            }
                            toast.success("Coaching deleted");
                            onDone();
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PerformanceSection({
  items,
  developers,
  canManage,
  isPending,
  startTransition,
  onDone,
}: {
  items: DevelopmentBoardData["performanceActions"];
  developers: DevelopmentBoardData["developers"];
  canManage: boolean;
  isPending: boolean;
  startTransition: (cb: () => void) => void;
  onDone: () => void;
}) {
  const [developerId, setDeveloperId] = useState(developers[0]?.id ?? "");
  const [actionType, setActionType] = useState<"REWARD" | "PUNISHMENT">(
    "REWARD"
  );
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [points, setPoints] = useState("5");
  const [actionDate, setActionDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reward & punishment</CardTitle>
        <CardDescription>
          Track recognition and corrective actions with points
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {canManage && (
          <form
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const pts = Number(points);
                const result = await upsertPerformanceAction({
                  developerId,
                  actionType,
                  title,
                  reason,
                  points:
                    actionType === "PUNISHMENT" ? -Math.abs(pts) : Math.abs(pts),
                  actionDate: new Date(actionDate),
                });
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                toast.success(
                  actionType === "REWARD" ? "Reward recorded" : "Punishment recorded"
                );
                setTitle("");
                setReason("");
                onDone();
              });
            }}
          >
            <Select value={developerId} onValueChange={setDeveloperId}>
              <SelectTrigger>
                <SelectValue placeholder="Developer" />
              </SelectTrigger>
              <SelectContent>
                {developers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={actionType}
              onValueChange={(v) =>
                setActionType(v as "REWARD" | "PUNISHMENT")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="REWARD">Reward</SelectItem>
                <SelectItem value="PUNISHMENT">Punishment</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <Input
              type="number"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              required
            />
            <Input
              type="date"
              value={actionDate}
              onChange={(e) => setActionDate(e.target.value)}
              required
            />
            <Button type="submit" size="sm" disabled={isPending}>
              Record
            </Button>
            <Textarea
              className="sm:col-span-2 lg:col-span-6"
              placeholder="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={5}
            />
          </form>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Developer</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Points</TableHead>
              <TableHead className="hidden md:table-cell">Date</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-[12px] text-slate-500">
                  No rewards or punishments yet.
                </TableCell>
              </TableRow>
            ) : (
              items.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.developerName}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={
                          a.actionType === "REWARD" ? "success" : "destructive"
                        }
                      >
                        {a.actionType}
                      </Badge>
                      <span className="font-medium">{a.title}</span>
                    </div>
                    <div className="line-clamp-1 text-[11px] text-slate-500">
                      {a.reason}
                    </div>
                  </TableCell>
                  <TableCell
                    className={
                      a.points >= 0
                        ? "tabular-nums text-emerald-700"
                        : "tabular-nums text-red-700"
                    }
                  >
                    {a.points > 0 ? `+${a.points}` : a.points}
                  </TableCell>
                  <TableCell className="hidden tabular-nums md:table-cell">
                    {a.actionDate}
                  </TableCell>
                  <TableCell>
                    {a.canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-600"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await deletePerformanceAction({
                              id: a.id,
                            });
                            if (!result.success) {
                              toast.error(result.error);
                              return;
                            }
                            toast.success("Deleted");
                            onDone();
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
