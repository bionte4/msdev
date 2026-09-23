import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatHours(hours: number | string): string {
  const value = typeof hours === "string" ? Number(hours) : hours;
  return `${value.toFixed(1)}h`;
}

export function formatScore(score: number | string): string {
  const value = typeof score === "string" ? Number(score) : score;
  return value.toFixed(2);
}

export function addWorkingDays(start: Date, workingDays: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < workingDays) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) {
      added += 1;
    }
  }
  return result;
}

export function getWeekBounds(reference: Date = new Date()): {
  weekStart: Date;
  weekEnd: Date;
} {
  const date = new Date(reference);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(date);
  weekStart.setDate(date.getDate() + diffToMonday);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

export function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value !== null && typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
}
