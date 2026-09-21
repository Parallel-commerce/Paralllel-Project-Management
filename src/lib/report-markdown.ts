export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const EMAIL = {
  charcoal: "#111111",
  muted: "#6F5C50",
  sand: "#C7BCB1",
  bone: "#EAE6DE",
  accent: "#A53328",
} as const;

type HtmlVariant = "email" | "page";

export function markdownToEmailHtml(markdown: string) {
  return renderMarkdown(markdown, "email");
}

export function markdownToPageHtml(markdown: string) {
  return renderMarkdown(markdown, "page");
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

function renderMarkdown(markdown: string, variant: HtmlVariant) {
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
      parts.push(renderHeading(variant, heading[1].length, heading[2].trim()));
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      parts.push(renderHr(variant));
      i += 1;
      continue;
    }

    if (isTableRow(line) && looksLikeTable(lines, i)) {
      const { html, next } = renderTable(variant, lines, i);
      parts.push(html);
      i = next;
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const { html, next } = renderList(variant, lines, i);
      parts.push(html);
      i = next;
      continue;
    }

    const { html, next } = renderParagraph(variant, lines, i);
    parts.push(html);
    i = next;
  }

  return (
    parts.join("\n") ||
    (variant === "email"
      ? `<p style="margin:0 0 12px;">${renderInline(variant, markdown)}</p>`
      : `<p>${renderInline(variant, markdown)}</p>`)
  );
}

function stripInlineMarkdown(value: string) {
  return value
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 ($2)")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*(.+?)\*/g, "$1");
}

function renderInline(variant: HtmlVariant, value: string) {
  const placeholders: string[] = [];
  const token = (html: string) => {
    const key = `@@MD${placeholders.length}@@`;
    placeholders.push(html);
    return key;
  };

  let text = escapeHtml(value);
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_, label, href) =>
    token(
      variant === "email"
        ? `<a href="${href}" style="color:${EMAIL.accent};text-decoration:underline;">${label}</a>`
        : `<a href="${href}">${label}</a>`,
    ),
  );
  text = text.replace(/`([^`]+)`/g, (_, code) =>
    token(
      variant === "email"
        ? `<code style="font-size:13px;background:${EMAIL.bone};padding:1px 4px;border-radius:4px;">${code}</code>`
        : `<code>${code}</code>`,
    ),
  );
  text = text.replace(/\*\*(.+?)\*\*/g, (_, inner) => token(`<strong>${inner}</strong>`));
  text = text.replace(/__(.+?)__/g, (_, inner) => token(`<strong>${inner}</strong>`));
  text = text.replace(/\*(.+?)\*/g, (_, inner) => token(`<em>${inner}</em>`));

  return text.replace(/@@MD(\d+)@@/g, (_, index) => placeholders[Number(index)] ?? "");
}

function renderHeading(variant: HtmlVariant, level: number, text: string) {
  const inner = renderInline(variant, text);
  if (variant === "page") {
    if (level === 1) {
      return `<p class="report-prose-doc-title">${inner}</p>`;
    }
    const tag = level === 2 ? "h2" : "h3";
    return `<${tag}>${inner}</${tag}>`;
  }
  if (level === 1) {
    return `<p style="margin:0 0 12px;font-size:18px;font-weight:700;color:${EMAIL.charcoal};">${inner}</p>`;
  }
  if (level === 2) {
    return `<p style="margin:24px 0 10px;font-size:16px;font-weight:600;color:${EMAIL.charcoal};">${inner}</p>`;
  }
  return `<p style="margin:18px 0 8px;font-size:15px;font-weight:600;color:${EMAIL.charcoal};">${inner}</p>`;
}

function renderHr(variant: HtmlVariant) {
  if (variant === "page") return "<hr />";
  return `<hr style="border:none;border-top:1px solid ${EMAIL.sand};margin:20px 0;" />`;
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

function renderTable(variant: HtmlVariant, lines: string[], start: number) {
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
  if (variant === "page") {
    const headerHtml = header.map((cell) => `<th>${renderInline(variant, cell)}</th>`).join("");
    const bodyHtml = body
      .map(
        (row) =>
          `<tr>${row.map((cell, cellIndex) => `<td${cellIndex === 0 ? ' class="report-prose-row-label"' : ""}>${renderInline(variant, cell)}</td>`).join("")}</tr>`,
      )
      .join("");
    return {
      html: `<div class="report-prose-table"><table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`,
      next: i,
    };
  }

  const headerHtml = header
    .map(
      (cell) =>
        `<th style="text-align:left;padding:8px 10px;border-bottom:1px solid ${EMAIL.sand};background:${EMAIL.bone};font-size:12px;font-weight:600;color:${EMAIL.muted};">${renderInline(variant, cell)}</th>`,
    )
    .join("");
  const bodyHtml = body
    .map(
      (row, rowIndex) => `
        <tr>
          ${row
            .map(
              (cell, cellIndex) =>
                `<td style="padding:8px 10px;border-bottom:1px solid ${EMAIL.sand};font-size:13px;color:${EMAIL.charcoal};${cellIndex === 0 ? "font-weight:600;" : ""}${rowIndex === body.length - 1 ? "border-bottom:none;" : ""}">${renderInline(variant, cell)}</td>`,
            )
            .join("")}
        </tr>`,
    )
    .join("");

  return {
    html: `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;margin:0 0 20px;border:1px solid ${EMAIL.sand};border-radius:12px;overflow:hidden;">
        <thead><tr>${headerHtml}</tr></thead>
        <tbody>${bodyHtml}</tbody>
      </table>`,
    next: i,
  };
}

function renderList(variant: HtmlVariant, lines: string[], start: number) {
  const ordered = /^\s*\d+[.)]\s+/.test(lines[start]);
  const items: string[] = [];
  let i = start;
  const itemRe = ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/;

  while (i < lines.length) {
    const match = lines[i].match(itemRe);
    if (!match) break;
    const inner = renderInline(variant, match[1].trim());
    items.push(
      variant === "email"
        ? `<li style="margin-bottom:6px;">${inner}</li>`
        : `<li>${inner}</li>`,
    );
    i += 1;
  }

  const tag = ordered ? "ol" : "ul";
  if (variant === "page") {
    return { html: `<${tag}>${items.join("")}</${tag}>`, next: i };
  }
  return {
    html: `<${tag} style="margin:0 0 16px;padding-left:20px;">${items.join("")}</${tag}>`,
    next: i,
  };
}

function renderParagraph(variant: HtmlVariant, lines: string[], start: number) {
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

  const inner = renderInline(variant, collected.join(" "));
  return {
    html:
      variant === "email"
        ? `<p style="margin:0 0 12px;">${inner}</p>`
        : `<p>${inner}</p>`,
    next: i,
  };
}
