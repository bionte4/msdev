import { z } from "zod";
import { EVALUATION_WEIGHTS } from "@/lib/constants";

const scoreField = z.coerce
  .number()
  .min(1, "Score must be at least 1.00")
  .max(5, "Score must be at most 5.00");

export const createEvaluationSchema = z.object({
  developerId: z.string().min(1, "Developer is required"),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  codeQuality: scoreField,
  delivery: scoreField,
  technical: scoreField,
  communication: scoreField,
  professionalism: scoreField,
  comments: z.string().max(2000).optional(),
});

export type CreateEvaluationInput = z.infer<typeof createEvaluationSchema>;

export function calculateWeightedScore(input: {
  codeQuality: number;
  delivery: number;
  technical: number;
  communication: number;
  professionalism: number;
}): number {
  const total =
    input.codeQuality * EVALUATION_WEIGHTS.codeQuality +
    input.delivery * EVALUATION_WEIGHTS.delivery +
    input.technical * EVALUATION_WEIGHTS.technical +
    input.communication * EVALUATION_WEIGHTS.communication +
    input.professionalism * EVALUATION_WEIGHTS.professionalism;

  return Math.round(total * 100) / 100;
}
