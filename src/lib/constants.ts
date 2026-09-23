export const MAX_DAILY_HOURS = Number(process.env.MAX_DAILY_HOURS ?? 16);
export const MAX_WEEKLY_HOURS_HARD_CAP = Number(
  process.env.MAX_WEEKLY_HOURS_HARD_CAP ?? 50
);
export const WEEKLY_HOURS_WARNING = Number(
  process.env.WEEKLY_HOURS_WARNING ?? 45
);
export const EVALUATION_REPLACEMENT_THRESHOLD = Number(
  process.env.EVALUATION_REPLACEMENT_THRESHOLD ?? 2.8
);
export const REPLACEMENT_SLA_WORKING_DAYS = Number(
  process.env.REPLACEMENT_SLA_WORKING_DAYS ?? 10
);

export const EVALUATION_WEIGHTS = {
  codeQuality: 0.3,
  delivery: 0.25,
  technical: 0.2,
  communication: 0.15,
  professionalism: 0.1,
} as const;

export const SCOPE_SWAP_TOLERANCE = 0.01;

export type Role =
  | "SYS_ADMIN"
  | "CLIENT_PM"
  | "VENDOR_LEAD"
  | "VENDOR_AM"
  | "DEVELOPER";

export const ALL_ROLES: Role[] = [
  "SYS_ADMIN",
  "CLIENT_PM",
  "VENDOR_LEAD",
  "VENDOR_AM",
  "DEVELOPER",
];
