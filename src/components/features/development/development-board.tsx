"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  deleteSkillCategory,
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
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null
  );
  const [categoryActive, setCategoryActive] = useState(true);

  const [skillName, setSkillName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [skillActive, setSkillActive] = useState(true);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);

  const [developerId, setDeveloperId] = useState(developers[0]?.id ?? "");
  const [skillId, setSkillId] = useState("");
  const [level, setLevel] = useState("INTERMEDIATE");
  const [yearsExp, setYearsExp] = useState("1");

  function resetCategoryForm() {
    setEditingCategoryId(null);
    setCategoryName("");
    setCategoryActive(true);
  }

  function resetSkillForm() {
    setEditingSkillId(null);
    setSkillName("");
    setCategoryId("");
    setDescription("");
    setSkillActive(true);
  }

  function categoryOptionsForSkillForm() {
    if (editingSkillId) return categories;
    return activeCategories;
  }

  return (
    <div className="page-stack">
      <Card>
        <CardHeader>
          <CardTitle>Skill catalog</CardTitle>
          <CardDescription>
            Full CRUD for categories & skills · inactive items stay in history
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {permissions.canManageCatalog ? (
            <>
              <div className="space-y-2">
                <p className="text-[12px] font-semibold text-slate-700">
                  Categories
                </p>
                <form
                  className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"
                  onSubmit={(e) => {
                    e.preventDefault();
                    startTransition(async () => {
                      const result = await upsertSkillCategory({
                        id: editingCategoryId ?? undefined,
                        name: categoryName,
                        isActive: categoryActive,
                      });
                      if (!result.success) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success(
                        editingCategoryId
                          ? "Category updated"
                          : `Category “${result.data.name}” created`
                      );
                      if (!editingCategoryId) {
                        setCategoryId(result.data.id);
                      }
                      resetCategoryForm();
                      onDone();
                    });
                  }}
                >
                  <Input
                    placeholder="Category name (e.g. Backend)"
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    required
                  />
                  <div className="flex items-center gap-2 px-1">
                    <Switch
                      checked={categoryActive}
                      onCheckedChange={setCategoryActive}
                    />
                    <Label className="normal-case tracking-normal text-[11px]">
                      Active
                    </Label>
                  </div>
                  <div className="flex gap-1">
                    <Button type="submit" size="sm" disabled={isPending}>
                      {isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : editingCategoryId ? (
                        <Pencil className="h-3.5 w-3.5" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      {editingCategoryId ? "Save" : "Add"}
                    </Button>
                    {editingCategoryId && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={resetCategoryForm}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="text-[12px] text-slate-500"
                        >
                          No categories yet — create one to start the catalog.
                        </TableCell>
                      </TableRow>
                    ) : (
                      categories.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell>
                            {c.isActive ? (
                              <Badge variant="success">Active</Badge>
                            ) : (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                disabled={isPending}
                                aria-label="Edit category"
                                onClick={() => {
                                  setEditingCategoryId(c.id);
                                  setCategoryName(c.name);
                                  setCategoryActive(c.isActive);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-600"
                                disabled={isPending}
                                aria-label="Delete category"
                                onClick={() => {
                                  if (
                                    !window.confirm(
                                      `Remove category “${c.name}”? Skills under it will be deactivated if still referenced.`
                                    )
                                  ) {
                                    return;
                                  }
                                  startTransition(async () => {
                                    const result = await deleteSkillCategory({
                                      id: c.id,
                                    });
                                    if (!result.success) {
                                      toast.error(result.error);
                                      return;
                                    }
                                    toast.success(
                                      result.data.deactivated
                                        ? "Category deactivated (has skills)"
                                        : "Category deleted"
                                    );
                                    if (editingCategoryId === c.id) {
                                      resetCategoryForm();
                                    }
                                    if (categoryId === c.id) setCategoryId("");
                                    onDone();
                                  });
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-3">
                <p className="text-[12px] font-semibold text-slate-700">
                  Skills
                </p>
                <form
                  className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6"
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
                        isActive: skillActive,
                      });
                      if (!result.success) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success(
                        editingSkillId
                          ? "Skill updated"
                          : "Skill added to catalog"
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
                      {categoryOptionsForSkillForm().map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {!c.isActive ? " (inactive)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Description (optional)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="sm:col-span-2 lg:col-span-1"
                  />
                  <div className="flex items-center gap-2 px-1">
                    <Switch
                      checked={skillActive}
                      onCheckedChange={setSkillActive}
                    />
                    <Label className="normal-case tracking-normal text-[11px]">
                      Active
                    </Label>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={
                        isPending || categoryOptionsForSkillForm().length === 0
                      }
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
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>

                {activeCategories.length === 0 && !editingSkillId && (
                  <p className="text-[12px] text-amber-700">
                    Create an active category first, then add skills.
                  </p>
                )}
              </div>
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
                  <TableHead className="w-[100px]">Actions</TableHead>
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
                            size="icon"
                            className="h-7 w-7"
                            disabled={isPending}
                            aria-label="Edit skill"
                            onClick={() => {
                              setEditingSkillId(s.id);
                              setSkillName(s.name);
                              setCategoryId(s.categoryId);
                              setDescription(s.description ?? "");
                              setSkillActive(s.isActive);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-600"
                            disabled={isPending}
                            aria-label="Delete skill"
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Remove skill “${s.name}” from catalog?`
                                )
                              ) {
                                return;
                              }
                              startTransition(async () => {
                                const result = await deleteSkillCatalog({
                                  id: s.id,
                                });
                                if (!result.success) {
                                  toast.error(result.error);
                                  return;
                                }
                                toast.success(
                                  result.data.deactivated
                                    ? "Skill deactivated (still assigned)"
                                    : "Skill deleted"
                                );
                                if (editingSkillId === s.id) resetSkillForm();
                                onDone();
                              });
                            }}
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
                    yearsExp: Number(yearsExp) || 0,
                  });
                  if (!result.success) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success("Skill assigned");
                  setSkillId("");
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
                  <SelectItem value="BEGINNER">Beginner</SelectItem>
                  <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
                  <SelectItem value="ADVANCED">Advanced</SelectItem>
                  <SelectItem value="EXPERT">Expert</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={0}
                max={40}
                step={0.5}
                placeholder="Years"
                value={yearsExp}
                onChange={(e) => setYearsExp(e.target.value)}
              />
              <Button type="submit" size="sm" disabled={isPending}>
                Assign
              </Button>
            </form>
          )}

          {activeSkills.length === 0 && permissions.canAssignSkills && (
            <p className="text-[12px] text-amber-700">
              No active skills in catalog yet — add them in Skill catalog first.
            </p>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Developer</TableHead>
                <TableHead>Skill</TableHead>
                <TableHead>Level</TableHead>
                <TableHead className="hidden sm:table-cell">Years</TableHead>
                {permissions.canAssignSkills && (
                  <TableHead className="w-[72px]">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={permissions.canAssignSkills ? 5 : 4}
                    className="text-[12px] text-slate-500"
                  >
                    No skill assignments yet.
                  </TableCell>
                </TableRow>
              ) : (
                assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.developerName}</TableCell>
                    <TableCell className="font-medium">
                      {a.skillName}
                      <span className="ml-1 text-[11px] text-slate-400">
                        ({a.category})
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{a.level}</Badge>
                    </TableCell>
                    <TableCell className="hidden tabular-nums sm:table-cell">
                      {a.yearsExp ?? "—"}
                    </TableCell>
                    {permissions.canAssignSkills && (
                      <TableCell>
                        {a.canEdit && (
                          <Button
                            type="button"
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
                                toast.success("Assignment removed");
                                onDone();
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    )}
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

function trainingStatusVariant(
  status: string
): "default" | "secondary" | "success" | "warning" | "destructive" {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "IN_PROGRESS":
      return "warning";
    case "CANCELLED":
      return "destructive";
    default:
      return "secondary";
  }
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
  const today = new Date().toISOString().slice(0, 10);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [developerId, setDeveloperId] = useState(developers[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState("");
  const [hours, setHours] = useState("8");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("PLANNED");
  const [skillFocus, setSkillFocus] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setProvider("");
    setHours("8");
    setStartDate(today);
    setEndDate("");
    setStatus("PLANNED");
    setSkillFocus("");
    setLocation("");
    setNotes("");
    setDeveloperId(developers[0]?.id ?? "");
  }

  function loadForEdit(t: DevelopmentBoardData["trainings"][number]) {
    setEditingId(t.id);
    setDeveloperId(t.developerId);
    setTitle(t.title);
    setProvider(t.provider);
    setHours(String(t.hours));
    setStartDate(t.startDate);
    setEndDate(t.endDate ?? "");
    setStatus(t.status);
    setSkillFocus(t.skillFocus ?? "");
    setLocation(t.location ?? "");
    setNotes(t.notes ?? "");
  }

  const upcoming = items.filter(
    (t) =>
      t.status !== "CANCELLED" &&
      t.status !== "COMPLETED" &&
      t.startDate >= today
  ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule training</CardTitle>
        <CardDescription>
          Plan sessions with start/end dates, location, and status
          {upcoming > 0 ? ` · ${upcoming} upcoming` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {canManage && (
          <form
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (endDate && endDate < startDate) {
                toast.error("End date must be on or after start date");
                return;
              }
              startTransition(async () => {
                const result = await upsertTraining({
                  id: editingId ?? undefined,
                  developerId,
                  title,
                  provider,
                  hours: Number(hours),
                  startDate: new Date(startDate),
                  endDate: endDate ? new Date(endDate) : null,
                  status: status as
                    | "PLANNED"
                    | "IN_PROGRESS"
                    | "COMPLETED"
                    | "CANCELLED",
                  skillFocus: skillFocus || null,
                  location: location || null,
                  notes: notes || null,
                });
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                toast.success(
                  editingId ? "Training schedule updated" : "Training scheduled"
                );
                resetForm();
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
              placeholder="Training title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <Input
              placeholder="Provider / vendor"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              required
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map(
                  (s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-500">
                Start date
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-500">
                End date
              </label>
              <Input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-500">
                Hours
              </label>
              <Input
                type="number"
                min={0.5}
                step={0.5}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="Hours"
                required
              />
            </div>
            <Input
              placeholder="Location / meeting link"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <Select
              value={skillFocus || "__none__"}
              onValueChange={(v) => setSkillFocus(v === "__none__" ? "" : v)}
            >
              <SelectTrigger className="sm:col-span-2">
                <SelectValue placeholder="Skill focus from catalog" />
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
            <Textarea
              className="sm:col-span-2 lg:col-span-2 min-h-[64px]"
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {editingId ? "Save schedule" : "Schedule training"}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={resetForm}
                  disabled={isPending}
                >
                  Cancel edit
                </Button>
              )}
            </div>
          </form>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Developer</TableHead>
              <TableHead>Training</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Hours</TableHead>
              {canManage && <TableHead className="w-[88px]">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canManage ? 6 : 5}
                  className="text-[12px] text-slate-500"
                >
                  No training scheduled yet.
                </TableCell>
              </TableRow>
            ) : (
              items.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.developerName}</TableCell>
                  <TableCell>
                    <div className="font-medium">{t.title}</div>
                    <div className="text-[11px] text-slate-500">
                      {t.provider}
                      {t.skillFocus ? ` · ${t.skillFocus}` : ""}
                      {t.location ? ` · ${t.location}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums text-[12px]">
                    {t.startDate}
                    {t.endDate && t.endDate !== t.startDate
                      ? ` → ${t.endDate}`
                      : ""}
                  </TableCell>
                  <TableCell>
                    <Badge variant={trainingStatusVariant(t.status)}>
                      {t.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden tabular-nums md:table-cell">
                    {t.hours}h
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex gap-1">
                        {t.canEdit && (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7"
                              disabled={isPending}
                              onClick={() => loadForEdit(t)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-600"
                              disabled={isPending}
                              onClick={() =>
                                startTransition(async () => {
                                  const result = await deleteTraining({
                                    id: t.id,
                                  });
                                  if (!result.success) {
                                    toast.error(result.error);
                                    return;
                                  }
                                  toast.success("Training removed");
                                  if (editingId === t.id) resetForm();
                                  onDone();
                                })
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
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
