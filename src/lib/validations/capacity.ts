import { z } from "zod";

export const capacityQuerySchema = z.object({
  weekStart: z.coerce.date().optional(),
  clientId: z.string().optional(),
});

export type CapacityQuery = z.infer<typeof capacityQuerySchema>;

export interface DeveloperCapacityRow {
  developerId: string;
  developerName: string;
  email: string;
  standardCapacity: number;
  loggedHours: number;
  overtimeHours: number;
  utilizationPercent: number;
  status: "ok" | "warning" | "critical" | "over_cap";
}
