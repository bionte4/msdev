"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/lib/actions/notifications";

function typeBadge(type: NotificationItem["type"]) {
  switch (type) {
    case "SUCCESS":
      return <Badge variant="success">OK</Badge>;
    case "WARNING":
      return <Badge variant="warning">Warn</Badge>;
    case "ALERT":
      return <Badge variant="destructive">Alert</Badge>;
    default:
      return <Badge variant="secondary">Info</Badge>;
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function NotificationBell() {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  function load() {
    startTransition(async () => {
      const result = await listMyNotifications();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setItems(result.data.items);
      setUnreadCount(result.data.unreadCount);
    });
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onDocClick);
    }
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) load();
  }

  function handleMarkAll() {
    startTransition(async () => {
      const result = await markAllNotificationsRead();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("All notifications marked read");
      load();
    });
  }

  function handleOpenItem(item: NotificationItem) {
    startTransition(async () => {
      if (!item.isRead) {
        await markNotificationRead({ id: item.id });
      }
      setOpen(false);
      if (item.href) {
        router.push(item.href);
      } else {
        load();
      }
    });
  }

  return (
    <div className="relative" ref={panelRef}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="relative h-8 w-8"
        onClick={toggle}
        aria-label="Notifications"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Bell className="h-3.5 w-3.5" />
        )}
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-[320px] overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg sm:w-[360px]">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <div>
              <p className="text-[12px] font-semibold text-slate-900">
                Notifications
              </p>
              <p className="text-[10px] text-slate-500">
                {unreadCount} unread
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7"
              disabled={isPending || unreadCount === 0}
              onClick={handleMarkAll}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all
            </Button>
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] text-slate-500">
                No notifications yet.
              </p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleOpenItem(item)}
                  className={cn(
                    "block w-full border-b border-slate-50 px-3 py-2.5 text-left transition-colors hover:bg-slate-50",
                    !item.isRead && "bg-slate-50/80"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12px] font-semibold text-slate-900">
                      {item.title}
                    </p>
                    <div className="flex shrink-0 items-center gap-1">
                      {typeBadge(item.type)}
                      <span className="text-[10px] tabular-nums text-slate-400">
                        {timeAgo(item.createdAt)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-600">
                    {item.body}
                  </p>
                  {item.href && (
                    <p className="mt-1 text-[10px] text-slate-400">{item.href}</p>
                  )}
                </button>
              ))
            )}
          </div>

          <div className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
            Alerts refresh automatically every minute.
          </div>
        </div>
      )}
    </div>
  );
}
