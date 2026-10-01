import Anthropic from "@anthropic-ai/sdk";

import { formatAnthropicUserError } from "@/lib/ai/anthropic-error";
import type { ReportDigest, ReportPeriod } from "@/types/database";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

const PROGRESS_SYSTEM = `You write concise client-facing project progress reports for Parallel Commerce.
Rules:
- Only use facts from the provided digest. Do not invent work, dates, or outcomes.
- Warm, clear, professional UK English. No hype, no emojis.
- 2–4 short paragraphs. Lead with what was achieved, then notable progress or collaboration, then optional next focus if implied by the data.
- If the digest is thin, say so honestly and keep it brief.
- Do not mention AI, digests, or internal tooling.`;

const MONTHLY_SYSTEM = `You write the opening of a monthly client letter for Parallel Commerce.
This letter shows the client the value of the work we completed for them. It should leave them pleased with the month.

Write two or three short sentences only. No heading, no bullet list, no sign-off.
- UK English. Warm, specific, and positive. No emojis.
- Talk up the value of the completed work. Stay truthful: do not invent results, revenue, or tasks.
- Use the task titles only as evidence of what we delivered. If a title names a fault, describe the improvement we made, not the fault.
- Do not mention unfinished work, delays, problems, queries, a thin month, or anything still to do.
- Do not mention AI, digests, or internal tooling.`;

export async function generateReportNarrative(input: {
  projectName: string;
  periodLabel: string;
  period?: ReportPeriod;
  digest: ReportDigest;
}): Promise<{ narrative: string; usedAi: boolean; error?: string }> {
  const monthly = input.period === "month";
  const fallback = monthly
    ? composeMonthlyLetter(
        monthlyFallbackSummary(input.projectName, input.periodLabel, input.digest),
        input.digest,
      )
    : buildFallbackNarrative(input.projectName, input.periodLabel, input.digest);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { narrative: fallback, usedAi: false };
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: monthly ? 400 : 900,
      system: monthly ? MONTHLY_SYSTEM : PROGRESS_SYSTEM,
      messages: [
        {
          role: "user",
          content: monthly
            ? monthlyUserMessage(input)
            : progressUserMessage(input),
        },
      ],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) {
      return { narrative: fallback, usedAi: false, error: "Empty AI response." };
    }

    return {
      narrative: monthly ? composeMonthlyLetter(text, input.digest) : text,
      usedAi: true,
    };
  } catch (error) {
    const message = formatAnthropicUserError(
      error,
      "Claude request failed.",
    );
    console.error("Claude report narrative failed:", error);
    return { narrative: fallback, usedAi: false, error: message };
  }
}

function progressUserMessage(input: {
  projectName: string;
  periodLabel: string;
  digest: ReportDigest;
}) {
  return `Project: ${input.projectName}
Period: ${input.periodLabel}

Stats:
${JSON.stringify(input.digest.stats, null, 2)}

Completed tasks:
${input.digest.completed_tasks.length ? input.digest.completed_tasks.map((task) => `- ${task}`).join("\n") : "- None recorded"}

Highlights / activity:
${input.digest.activity_summaries.slice(0, 40).map((summary) => `- ${summary}`).join("\n") || "- No activity recorded"}

Write the narrative only.`;
}

function monthlyUserMessage(input: {
  projectName: string;
  periodLabel: string;
  digest: ReportDigest;
}) {
  const tasks = input.digest.completed_tasks.length
    ? input.digest.completed_tasks.map((task) => `- ${task}`).join("\n")
    : "- None recorded";
  return `Client: ${input.projectName}
Month: ${input.periodLabel}

Work we completed:
${tasks}

Write the short positive summary only. The task list is added separately.`;
}

function monthlyFallbackSummary(
  projectName: string,
  periodLabel: string,
  digest: ReportDigest,
) {
  const count = digest.completed_tasks.length;
  if (count === 0) {
    return `${periodLabel} was a steady month for ${projectName}. We stayed close to the store and kept the work in good shape.`;
  }
  const piece = count === 1 ? "piece" : "pieces";
  return `${periodLabel} was a strong month for ${projectName}. We completed ${count} ${piece} of work that make the store easier to run and better for your customers.`;
}

function composeMonthlyLetter(summary: string, digest: ReportDigest) {
  const opening = summary
    .trim()
    .replace(/\n+#{1,3} [\s\S]*$/, "")
    .trim();
  if (!digest.completed_tasks.length) return opening;
  const items = digest.completed_tasks.map((task) => `- ${task}`).join("\n");
  return `${opening}\n\n## Completed this month\n\n${items}`;
}

function buildFallbackNarrative(
  projectName: string,
  periodLabel: string,
  digest: ReportDigest,
) {
  const { stats } = digest;
  const lines = [
    `Here’s a progress update for ${projectName} covering ${periodLabel}.`,
  ];

  if (stats.tasks_completed > 0) {
    lines.push(
      `We completed ${stats.tasks_completed} task${stats.tasks_completed === 1 ? "" : "s"} in this period${
        digest.completed_tasks.length
          ? `, including: ${digest.completed_tasks.slice(0, 5).join("; ")}`
          : ""
      }.`,
    );
  } else {
    lines.push("No tasks were marked complete in this period.");
  }

  const extras: string[] = [];
  if (stats.tasks_created > 0) {
    extras.push(`${stats.tasks_created} new task${stats.tasks_created === 1 ? "" : "s"} opened`);
  }
  if (stats.comments > 0) {
    extras.push(`${stats.comments} comment${stats.comments === 1 ? "" : "s"} added`);
  }
  if (stats.status_changes > 0) {
    extras.push(`${stats.status_changes} status update${stats.status_changes === 1 ? "" : "s"}`);
  }
  if (extras.length) {
    lines.push(`Also noted: ${extras.join(", ")}.`);
  }

  return lines.join("\n\n");
}
