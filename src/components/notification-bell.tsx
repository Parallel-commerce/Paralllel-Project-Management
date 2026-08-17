"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import {
  clearAllNotifications,
  clearNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/actions/notifications";
import type { Notification } from "@/types/database";

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function notificationKind(type: string) {
  if (type.startsWith("task_comment")) return "Comment";
  if (type === "task_assigned") return "Assigned";
  if (type === "chat_message") return "Message";
  if (type === "task_feedback") return "Feedback";
  if (type === "task_reported") return "Task";
  if (type === "project_invite") return "Invite";
  return "Alert";
}

export function NotificationBell({
  initialUnreadCount = 0,
}: {
  initialUnreadCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [pending, startTransition] = useTransition();

  const unreadInList = useMemo(
    () => notifications.filter((notification) => !notification.read_at).length,
    [notifications],
  );
  const canMarkRead = unreadCount > 0 || unreadInList > 0;
  const canClearAll = notifications.length > 0;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setUnreadCount(initialUnreadCount);
  }, [initialUnreadCount]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function refresh() {
    startTransition(async () => {
      const result = await listNotifications();
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
      setLoading(false);
    });
  }

  function openPanel() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      refresh();
    }
  }

  function markOneRead(notificationId: string) {
    const target = notifications.find((item) => item.id === notificationId);
    if (!target || target.read_at) return;

    setNotifications((current) =>
      current.map((item) =>
        item.id === notificationId
          ? { ...item, read_at: new Date().toISOString() }
          : item,
      ),
    );
    setUnreadCount((count) => Math.max(0, count - 1));
    startTransition(async () => {
      await markNotificationRead(notificationId);
    });
  }

  function clearOne(notificationId: string) {
    const target = notifications.find((item) => item.id === notificationId);
    if (!target) return;

    setNotifications((current) =>
      current.filter((item) => item.id !== notificationId),
    );
    if (!target.read_at) {
      setUnreadCount((count) => Math.max(0, count - 1));
    }
    startTransition(async () => {
      await clearNotification(notificationId);
    });
  }

  function markAllRead() {
    if (!canMarkRead) return;
    setNotifications((current) =>
      current.map((item) =>
        item.read_at ? item : { ...item, read_at: new Date().toISOString() },
      ),
    );
    setUnreadCount(0);
    startTransition(async () => {
      await markAllNotificationsRead();
    });
  }

  function clearAll() {
    if (!canClearAll) return;
    setNotifications([]);
    setUnreadCount(0);
    startTransition(async () => {
      await clearAllNotifications();
    });
  }

  const panel = (
    <>
      <div className="flex items-center justify-between gap-3 pb-2">
        <p className="text-sm font-medium">Notifications</p>
        <button
          type="button"
          className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] md:hidden"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </div>

      <ul className="max-h-[min(22rem,calc(100dvh-16rem))] space-y-2 overflow-y-auto overscroll-contain">
        {loading && notifications.length === 0 ? (
          <li className="py-6 text-center text-sm text-[var(--muted)]">
            Loading notifications…
          </li>
        ) : notifications.length === 0 ? (
          <li className="py-6 text-center text-sm text-[var(--muted)]">
            No notifications yet.
          </li>
        ) : (
          notifications.map((notification) => {
            const unread = !notification.read_at;
            const kind = notificationKind(notification.type);
            const details = (
              <>
                <p className="text-sm font-medium">{notification.title}</p>
                {notification.body ? (
                  <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">
                    {notification.body}
                  </p>
                ) : null}
                <p className="mt-1 text-[10px] text-[var(--muted)]">
                  {kind} · {formatWhen(notification.created_at)}
                </p>
              </>
            );

            return (
              <li
                key={notification.id}
                className={`flex items-start gap-2 rounded-lg border border-[var(--border)] px-3 py-2 ${
                  unread ? "bg-[var(--accent-soft)]/40" : "opacity-70"
                }`}
              >
                <div className="min-w-0 flex-1">
                  {notification.link ? (
                    <Link
                      href={notification.link}
                      onClick={() => {
                        markOneRead(notification.id);
                        setOpen(false);
                      }}
                      className="block"
                    >
                      {details}
                    </Link>
                  ) : (
                    details
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`Clear ${kind.toLowerCase()} notification`}
                  onClick={() => clearOne(notification.id)}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]"
                >
                  Clear
                </button>
              </li>
            );
          })
        )}
      </ul>

      <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
        <button
          type="button"
          disabled={pending || !canMarkRead}
          onClick={markAllRead}
          className="min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-medium hover:bg-[var(--border)] disabled:opacity-50"
        >
          Mark as read
        </button>
        <button
          type="button"
          disabled={pending || !canClearAll}
          onClick={clearAll}
          className="min-h-10 w-full rounded-md px-3 py-2 text-sm font-medium text-[var(--danger)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
        >
          Clear all
        </button>
      </div>
    </>
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={openPanel}
        className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[var(--border)] px-2 hover:bg-[var(--surface-2)] sm:min-h-9 sm:min-w-0 sm:px-3 sm:py-1.5"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 sm:hidden"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </svg>
        <span className="hidden sm:inline">Alerts</span>
        {unreadCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-medium text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open && mounted
        ? createPortal(
            <>
              <button
                type="button"
                className="fixed inset-0 z-[80] bg-black/40 md:bg-black/10"
                aria-label="Close notifications"
                onClick={() => setOpen(false)}
              />
              <div
                role="dialog"
                aria-label="Notifications"
                className="fixed inset-x-3 top-[4.25rem] z-[90] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-lg md:inset-x-auto md:right-4 md:top-16 md:w-80 lg:right-8"
              >
                {panel}
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
