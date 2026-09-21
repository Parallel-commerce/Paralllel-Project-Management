import type { ReportDigest } from "@/types/database";
import {
  escapeHtml,
  markdownToEmailHtml,
  markdownToPlainText,
} from "@/lib/report-markdown";

export { escapeHtml, markdownToEmailHtml, markdownToPlainText };

const FONT =
  "ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif";
const CHARCOAL = "#111111";
const MUTED = "#6F5C50";
const SAND = "#C7BCB1";
const BONE = "#EAE6DE";
const ACCENT = "#A53328";

export function buildProjectReportEmail(input: {
  projectName: string;
  title: string;
  narrative: string | null;
  reportUrl: string;
  progressDigest?: ReportDigest | null;
}): { text: string; html: string } {
  const narrative =
    input.narrative?.trim() ||
    (input.progressDigest
      ? "Progress update attached."
      : "Store performance update attached.");
  const snapshotText = input.progressDigest
    ? formatProgressSnapshotText(input.progressDigest)
    : "";

  const text = [
    input.projectName,
    input.title,
    "",
    markdownToPlainText(narrative),
    snapshotText,
    `View in Parallel: ${input.reportUrl}`,
    "",
    "— Parallel",
  ]
    .filter((part, index, parts) => part !== "" || parts[index - 1] !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  const html = wrapSystemEmail(
    `
    <p style="margin:0 0 4px;font-size:13px;color:${MUTED};">${escapeHtml(input.projectName)}</p>
    <p style="margin:0 0 20px;font-size:16px;font-weight:600;color:${CHARCOAL};">${escapeHtml(input.title)}</p>
    <div style="font-size:15px;line-height:1.55;color:${CHARCOAL};">
      ${markdownToEmailHtml(narrative)}
    </div>
    ${input.progressDigest ? formatProgressSnapshotHtml(input.progressDigest) : ""}
    <p style="margin:24px 0 0;">
      <a href="${escapeHtml(input.reportUrl)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">
        View in Parallel
      </a>
    </p>
    `.trim(),
    { maxWidth: 640 },
  );

  return { text, html };
}

function wrapSystemEmail(innerHtml: string, options?: { maxWidth?: number }) {
  const maxWidth = options?.maxWidth ?? 520;
  return `
  <div style="font-family:${FONT};line-height:1.5;color:${CHARCOAL};background:#ffffff;max-width:${maxWidth}px;margin:0 auto;padding:24px;">
    <p style="font-size:20px;font-weight:700;margin:0 0 20px;color:${CHARCOAL};">Parallel</p>
    ${innerHtml}
    <p style="margin:28px 0 0;font-size:13px;color:${MUTED};">— Parallel</p>
  </div>
  `.trim();
}

function formatProgressSnapshotText(digest: ReportDigest) {
  const lines = [
    "",
    "Snapshot",
    `• Tasks completed: ${digest.stats.tasks_completed}`,
    `• Tasks created: ${digest.stats.tasks_created}`,
    `• Comments: ${digest.stats.comments}`,
    `• Status updates: ${digest.stats.status_changes}`,
  ];
  if (digest.completed_tasks.length) {
    lines.push("", "Completed:");
    for (const task of digest.completed_tasks) {
      lines.push(`• ${task}`);
    }
  }
  return lines.join("\n");
}

function formatProgressSnapshotHtml(digest: ReportDigest) {
  const rows: [string, string][] = [
    ["Tasks completed", String(digest.stats.tasks_completed)],
    ["Tasks created", String(digest.stats.tasks_created)],
    ["Comments", String(digest.stats.comments)],
    ["Status updates", String(digest.stats.status_changes)],
  ];

  const completed =
    digest.completed_tasks.length > 0
      ? `
      <div style="padding:8px 16px 16px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:${CHARCOAL};">Completed</p>
        <ul style="margin:0;padding-left:18px;font-size:14px;color:${CHARCOAL};">
          ${digest.completed_tasks
            .map(
              (task) =>
                `<li style="margin-bottom:4px;">${escapeHtml(task)}</li>`,
            )
            .join("")}
        </ul>
      </div>`
      : `<div style="height:8px;"></div>`;

  return `
    <div style="margin:20px 0 0;border:1px solid ${SAND};border-radius:12px;background:${BONE};overflow:hidden;">
      <div style="padding:12px 16px 8px;font-size:13px;font-weight:600;color:${CHARCOAL};">Snapshot</div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">
        ${rows
          .map(
            ([label, value]) => `
          <tr>
            <td style="padding:4px 16px;font-size:14px;color:${MUTED};">${escapeHtml(label)}</td>
            <td style="padding:4px 16px;font-size:14px;font-weight:600;text-align:right;color:${CHARCOAL};">${escapeHtml(value)}</td>
          </tr>`,
          )
          .join("")}
      </table>
      ${completed}
    </div>
  `;
}
