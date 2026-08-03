import Anthropic from "@anthropic-ai/sdk";

import type { ReportDigest } from "@/types/database";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

export async function generateReportNarrative(input: {
  projectName: string;
  periodLabel: string;
  digest: ReportDigest;
}): Promise<{ narrative: string; usedAi: boolean; error?: string }> {
  const fallback = buildFallbackNarrative(input.projectName, input.periodLabel, input.digest);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { narrative: fallback, usedAi: false };
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 900,
      system: `You write concise client-facing project progress reports for Parallel Commerce.
Rules:
- Only use facts from the provided digest. Do not invent work, dates, or outcomes.
- Warm, clear, professional UK English. No hype, no emojis.
- 2–4 short paragraphs. Lead with what was achieved, then notable progress or collaboration, then optional next focus if implied by the data.
- If the digest is thin, say so honestly and keep it brief.
- Do not mention AI, digests, or internal tooling.`,
      messages: [
        {
          role: "user",
          content: `Project: ${input.projectName}
Period: ${input.periodLabel}

Stats:
${JSON.stringify(input.digest.stats, null, 2)}

Completed tasks:
${input.digest.completed_tasks.length ? input.digest.completed_tasks.map((t) => `- ${t}`).join("\n") : "- None recorded"}

Highlights / activity:
${input.digest.activity_summaries.slice(0, 40).map((s) => `- ${s}`).join("\n") || "- No activity recorded"}

Write the narrative only.`,
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

    return { narrative: text, usedAi: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Claude request failed.";
    console.error("Claude report narrative failed:", message);
    return { narrative: fallback, usedAi: false, error: message };
  }
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
