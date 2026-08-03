"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import {
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

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const result = await listNotifications();
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
    });
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) refresh();
        }}
        className="relative inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-[var(--border)] px-2 hover:bg-[var(--surface-2)] sm:min-w-0 sm:px-3 sm:py-1.5"
        aria-label="Notifications"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 sm:hidden"
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

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/30 sm:hidden"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 max-h-[70dvh] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-lg sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-none sm:w-80">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Notifications</p>
            <button
              type="button"
              disabled={pending || unreadCount === 0}
              onClick={() => {
                startTransition(async () => {
                  await markAllNotificationsRead();
                  refresh();
                });
              }}
              className="text-xs text-[var(--accent)] hover:underline disabled:opacity-50"
            >
              Mark all read
            </button>
          </div>

          <ul className="max-h-[min(24rem,55dvh)] space-y-2 overflow-y-auto sm:max-h-80">
            {notifications.length === 0 ? (
              <li className="py-6 text-center text-sm text-[var(--muted)]">
                No notifications yet.
              </li>
            ) : (
              notifications.map((notification) => (
                <li
                  key={notification.id}
                  className={`rounded-lg border border-[var(--border)] px-3 py-2 ${
                    notification.read_at ? "opacity-70" : "bg-[var(--accent-soft)]/40"
                  }`}
                >
                  {notification.link ? (
                    <Link
                      href={notification.link}
                      onClick={() => {
                        startTransition(async () => {
                          await markNotificationRead(notification.id);
                          setOpen(false);
                        });
                      }}
                      className="block"
                    >
                      <p className="text-sm font-medium">{notification.title}</p>
                      {notification.body ? (
                        <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">
                          {notification.body}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[10px] text-[var(--muted)]">
                        {formatWhen(notification.created_at)}
                      </p>
                    </Link>
                  ) : (
                    <div>
                      <p className="text-sm font-medium">{notification.title}</p>
                      {notification.body ? (
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {notification.body}
                        </p>
                      ) : null}
                    </div>
                  )}
                </li>
              ))
            )}
          </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
