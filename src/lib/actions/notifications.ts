"use server";

import { prisma } from "@/lib/prisma";
import { auth, assertRole } from "@/lib/auth";
import {
  createNotificationSchema,
  markNotificationReadSchema,
  type CreateNotificationInput,
  type MarkNotificationReadInput,
} from "@/lib/validations/access";
import { fail, ok, type ActionResult } from "@/types/actions";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  href: string | null;
  type: "INFO" | "SUCCESS" | "WARNING" | "ALERT";
  readAt: string | null;
  createdAt: string;
  isRead: boolean;
}

function mapNotification(row: {
  id: string;
  title: string;
  body: string;
  href: string | null;
  type: NotificationItem["type"];
  readAt: Date | null;
  createdAt: Date;
}): NotificationItem {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    href: row.href,
    type: row.type,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    isRead: Boolean(row.readAt),
  };
}

/** Internal helper for other modules / seed scripts */
export async function createNotification(
  input: CreateNotificationInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = createNotificationSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid notification");
    }
    const row = await prisma.notification.create({
      data: {
        userId: parsed.data.userId,
        title: parsed.data.title,
        body: parsed.data.body,
        href: parsed.data.href || null,
        type: parsed.data.type,
      },
    });
    return ok({ id: row.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create notification";
    return fail(message);
  }
}

export async function notifyUsers(
  userIds: string[],
  payload: {
    title: string;
    body: string;
    href?: string | null;
    type?: CreateNotificationInput["type"];
  }
): Promise<void> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return;

  await prisma.notification.createMany({
    data: unique.map((userId) => ({
      userId,
      title: payload.title,
      body: payload.body,
      href: payload.href || null,
      type: payload.type ?? "INFO",
    })),
  });
}

export async function listMyNotifications(): Promise<
  ActionResult<{ items: NotificationItem[]; unreadCount: number }>
> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "DEVELOPER",
    ]);

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.notification.count({
        where: { userId: session.user.id, readAt: null },
      }),
    ]);

    return ok({
      items: items.map(mapNotification),
      unreadCount,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load notifications";
    return fail(message);
  }
}

export async function markNotificationRead(
  input: MarkNotificationReadInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "DEVELOPER",
    ]);

    const parsed = markNotificationReadSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid notification id");

    const existing = await prisma.notification.findUnique({
      where: { id: parsed.data.id },
    });
    if (!existing || existing.userId !== session.user.id) {
      return fail("Notification not found");
    }

    await prisma.notification.update({
      where: { id: existing.id },
      data: { readAt: existing.readAt ?? new Date() },
    });

    return ok({ id: existing.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to mark as read";
    return fail(message);
  }
}

export async function markAllNotificationsRead(): Promise<
  ActionResult<{ updated: number }>
> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "DEVELOPER",
    ]);

    const result = await prisma.notification.updateMany({
      where: { userId: session.user.id, readAt: null },
      data: { readAt: new Date() },
    });

    return ok({ updated: result.count });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to mark all as read";
    return fail(message);
  }
}
