import type { ReportDigest } from "@/types/database";

const FONT =
  "ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif";
const CHARCOAL = "#111111";
const MUTED = "#6F5C50";
const SAND = "#C7BCB1";
const BONE = "#EAE6DE";
const ACCENT = "#A53328";

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

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

export function markdownToEmailHtml(markdown: string) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const parts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      parts.push(renderHeading(heading[1].length, heading[2].trim()));
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      parts.push(
        `<hr style="border:none;border-top:1px solid ${SAND};margin:20px 0;" />`,
      );
      i += 1;
      continue;
    }

    if (isTableRow(line) && looksLikeTable(lines, i)) {
      const { html, next } = renderTable(lines, i);
      parts.push(html);
      i = next;
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const { html, next } = renderList(lines, i);
      parts.push(html);
      i = next;
      continue;
    }

    const { html, next } = renderParagraph(lines, i);
    parts.push(html);
    i = next;
  }

  return parts.join("\n") || `<p style="margin:0 0 12px;">${renderInline(markdown)}</p>`;
}

export function markdownToPlainText(markdown: string) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const out: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      out.push("");
      continue;
    }
    if (isTableSeparator(trimmed)) continue;
    if (isTableRow(trimmed)) {
      out.push(
        splitTableCells(trimmed)
          .map((cell) => stripInlineMarkdown(cell))
          .join(" · "),
      );
      continue;
    }
    out.push(
      stripInlineMarkdown(trimmed.replace(/^#{1,6}\s+/, "").replace(/^\s*[-*+]\s+/, "• ")),
    );
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripInlineMarkdown(value: string) {
  return value
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 ($2)")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*(.+?)\*/g, "$1");
}

function renderInline(value: string) {
  const placeholders: string[] = [];
  const token = (html: string) => {
    const key = `@@EMAIL${placeholders.length}@@`;
    placeholders.push(html);
    return key;
  };

  let text = escapeHtml(value);
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_, label, href) =>
    token(
      `<a href="${href}" style="color:${ACCENT};text-decoration:underline;">${label}</a>`,
    ),
  );
  text = text.replace(/`([^`]+)`/g, (_, code) =>
    token(
      `<code style="font-size:13px;background:${BONE};padding:1px 4px;border-radius:4px;">${code}</code>`,
    ),
  );
  text = text.replace(/\*\*(.+?)\*\*/g, (_, inner) => token(`<strong>${inner}</strong>`));
  text = text.replace(/__(.+?)__/g, (_, inner) => token(`<strong>${inner}</strong>`));
  text = text.replace(/\*(.+?)\*/g, (_, inner) => token(`<em>${inner}</em>`));

  return text.replace(/@@EMAIL(\d+)@@/g, (_, index) => placeholders[Number(index)] ?? "");
}

function renderHeading(level: number, text: string) {
  if (level === 1) {
    return `<p style="margin:0 0 12px;font-size:18px;font-weight:700;color:${CHARCOAL};">${renderInline(text)}</p>`;
  }
  if (level === 2) {
    return `<p style="margin:24px 0 10px;font-size:16px;font-weight:600;color:${CHARCOAL};">${renderInline(text)}</p>`;
  }
  return `<p style="margin:18px 0 8px;font-size:15px;font-weight:600;color:${CHARCOAL};">${renderInline(text)}</p>`;
}

function isTableRow(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|", 1);
}

function isTableSeparator(line: string) {
  if (!isTableRow(line) && !line.trim().includes("|")) return false;
  const cells = splitTableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}

function looksLikeTable(lines: string[], start: number) {
  const first = lines[start];
  const next = lines[start + 1];
  if (!isTableRow(first)) return false;
  return Boolean(next && (isTableSeparator(next) || isTableRow(next)));
}

function splitTableCells(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function renderTable(lines: string[], start: number) {
  const rows: string[][] = [];
  let i = start;
  while (i < lines.length && (isTableRow(lines[i]) || isTableSeparator(lines[i]))) {
    if (!isTableSeparator(lines[i])) {
      rows.push(splitTableCells(lines[i]));
    }
    i += 1;
  }

  if (rows.length === 0) {
    return { html: "", next: i };
  }

  const [header, ...body] = rows;
  const headerHtml = header
    .map(
      (cell) =>
        `<th style="text-align:left;padding:8px 10px;border-bottom:1px solid ${SAND};background:${BONE};font-size:12px;font-weight:600;color:${MUTED};">${renderInline(cell)}</th>`,
    )
    .join("");
  const bodyHtml = body
    .map(
      (row, rowIndex) => `
        <tr>
          ${row
            .map(
              (cell, cellIndex) =>
                `<td style="padding:8px 10px;border-bottom:1px solid ${SAND};font-size:13px;color:${CHARCOAL};${cellIndex === 0 ? "font-weight:600;" : ""}${rowIndex === body.length - 1 ? "border-bottom:none;" : ""}">${renderInline(cell)}</td>`,
            )
            .join("")}
        </tr>`,
    )
    .join("");

  return {
    html: `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;margin:0 0 20px;border:1px solid ${SAND};border-radius:12px;overflow:hidden;">
        <thead><tr>${headerHtml}</tr></thead>
        <tbody>${bodyHtml}</tbody>
      </table>`,
    next: i,
  };
}

function renderList(lines: string[], start: number) {
  const ordered = /^\s*\d+[.)]\s+/.test(lines[start]);
  const items: string[] = [];
  let i = start;
  const itemRe = ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/;

  while (i < lines.length) {
    const match = lines[i].match(itemRe);
    if (!match) break;
    items.push(`<li style="margin-bottom:6px;">${renderInline(match[1].trim())}</li>`);
    i += 1;
  }

  const tag = ordered ? "ol" : "ul";
  return {
    html: `<${tag} style="margin:0 0 16px;padding-left:20px;">${items.join("")}</${tag}>`,
    next: i,
  };
}

function renderParagraph(lines: string[], start: number) {
  const collected: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) break;
    if (/^#{1,3}\s+/.test(line)) break;
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) break;
    if (looksLikeTable(lines, i)) break;
    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) break;
    collected.push(line.trim());
    i += 1;
  }

  return {
    html: `<p style="margin:0 0 12px;">${renderInline(collected.join(" "))}</p>`,
    next: i,
  };
}
