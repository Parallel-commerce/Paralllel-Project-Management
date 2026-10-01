import { formatDate, formatDateTime } from "@/lib/format-date";

/** UTC calendar day, so server-rendered labels stay stable. */
export function utcCalendarDay(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function timelineDayLabel(
  day: string,
  today: string,
  yesterday: string,
) {
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  return formatDate(day);
}

export function timelineRecordedLabel(occurredOn: string, createdAt: string) {
  const loggedDay = createdAt.slice(0, 10);
  if (loggedDay === occurredOn) {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(createdAt));
  }
  return `Logged ${formatDateTime(createdAt)}`;
}
