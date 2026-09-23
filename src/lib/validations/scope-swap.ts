import { z } from "zod";
import { SCOPE_SWAP_TOLERANCE } from "@/lib/constants";

export const createScopeSwapSchema = z
  .object({
    projectId: z.string().min(1, "Project is required"),
    outDeveloperId: z.string().min(1, "Outgoing developer is required"),
    inDeveloperId: z.string().min(1, "Incoming developer is required"),
    outStoryPoints: z.coerce.number().positive("Out story points must be > 0"),
    inStoryPoints: z.coerce.number().positive("In story points must be > 0"),
    outHours: z.coerce.number().positive("Out hours must be > 0"),
    inHours: z.coerce.number().positive("In hours must be > 0"),
    outTaskDescription: z
      .string()
      .min(10, "Out task description must be at least 10 characters"),
    inTaskDescription: z
      .string()
      .min(10, "In task description must be at least 10 characters"),
    rationale: z
      .string()
      .min(10, "Rationale must be at least 10 characters")
      .max(1000),
  })
  .refine((data) => data.outDeveloperId !== data.inDeveloperId, {
    message: "Incoming and outgoing developers must be different",
    path: ["inDeveloperId"],
  })
  .refine(
    (data) =>
      Math.abs(data.outStoryPoints - data.inStoryPoints) <= SCOPE_SWAP_TOLERANCE,
    {
      message: "Story points must be equal (1-in, 1-out)",
      path: ["inStoryPoints"],
    }
  )
  .refine(
    (data) => Math.abs(data.outHours - data.inHours) <= SCOPE_SWAP_TOLERANCE,
    {
      message: "Hours must be equal (1-in, 1-out)",
      path: ["inHours"],
    }
  );

export type CreateScopeSwapInput = z.infer<typeof createScopeSwapSchema>;
