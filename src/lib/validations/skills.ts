import { z } from "zod";

export const skillLevels = [
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
  "EXPERT",
] as const;

export const upsertSkillCategorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(80),
  isActive: z.boolean().optional(),
});

export const upsertSkillCatalogSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(80),
  categoryId: z.string().min(1, "Category is required"),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const deleteSkillCatalogSchema = z.object({
  id: z.string().min(1),
});

export const assignDeveloperSkillSchema = z.object({
  id: z.string().optional(),
  developerId: z.string().min(1),
  skillId: z.string().min(1),
  level: z.enum(skillLevels),
  yearsExp: z.coerce.number().min(0).max(40).optional(),
  notes: z.string().max(500).optional(),
});

export const deleteDeveloperSkillSchema = z.object({
  id: z.string().min(1),
});

export type UpsertSkillCategoryInput = z.infer<typeof upsertSkillCategorySchema>;
export type UpsertSkillCatalogInput = z.infer<typeof upsertSkillCatalogSchema>;
export type DeleteSkillCatalogInput = z.infer<typeof deleteSkillCatalogSchema>;
export type AssignDeveloperSkillInput = z.infer<
  typeof assignDeveloperSkillSchema
>;
export type DeleteDeveloperSkillInput = z.infer<
  typeof deleteDeveloperSkillSchema
>;
