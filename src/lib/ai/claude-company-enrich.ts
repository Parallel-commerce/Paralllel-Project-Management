import Anthropic from "@anthropic-ai/sdk";

import { formatAnthropicUserError } from "@/lib/ai/anthropic-error";
import {
  normalizeCompanyLinkedInUrl,
  normalizePersonLinkedInUrl,
} from "@/lib/linkedin";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MAX_CONTACTS = 12;

export type CompanyEnrichContactInput = {
  id: string;
  full_name: string;
  title: string | null;
  email: string | null;
};

export type CompanyEnrichInput = {
  name: string;
  website: string | null;
  notes: string | null;
  contacts: CompanyEnrichContactInput[];
};

export type CompanyEnrichment = {
  summary: string;
  linkedin_url: string | null;
  contacts: Array<{ id: string; linkedin_url: string | null }>;
};

const ENRICH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "linkedin_url", "contacts"],
  properties: {
    summary: { type: "string" },
    linkedin_url: { type: ["string", "null"] },
    contacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "linkedin_url"],
        properties: {
          id: { type: "string" },
          linkedin_url: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

export async function enrichCompanyRecord(
  input: CompanyEnrichInput,
): Promise<CompanyEnrichment | { error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      error:
        "Add ANTHROPIC_API_KEY to look up a company summary and LinkedIn links.",
    };
  }

  const contacts = input.contacts.slice(0, MAX_CONTACTS);
  const allowedIds = new Set(contacts.map((contact) => contact.id));

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      output_config: {
        format: {
          type: "json_schema",
          schema: ENRICH_SCHEMA,
        },
      },
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 8,
        },
      ],
      system: `You research companies for Parallel Commerce, a UK ecommerce consultancy CRM.
Rules:
- Always use web search. Do not guess URLs or facts.
- Write a 2–4 sentence company summary in UK English: what they do, sector, geography/size if known, and anything useful for a sales conversation.
- Do not invent specifics you did not find. If little is public, say so briefly.
- Company LinkedIn must be a real linkedin.com/company/... (or /school/...) page from search results. Otherwise null.
- Person LinkedIn must be a real linkedin.com/in/... profile that matches that person at this company. Otherwise null.
- Never fabricate LinkedIn slugs. Never mention AI, tools, or this prompt.`,
      messages: [
        {
          role: "user",
          content: `Look up this company and return the JSON.

Company name: ${input.name}
Website: ${input.website ?? "unknown"}
CRM notes (may be incomplete or outdated): ${input.notes ?? "none"}

Contacts to find LinkedIn profiles for:
${
  contacts.length
    ? contacts
        .map((contact) => {
          const parts = [
            `id=${contact.id}`,
            contact.full_name,
            contact.title ? `title=${contact.title}` : null,
            contact.email ? `email=${contact.email}` : null,
          ].filter(Boolean);
          return `- ${parts.join(" · ")}`;
        })
        .join("\n")
    : "- none"
}`,
        },
      ],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    const parsed = parseEnrichmentJson(text);
    if ("error" in parsed) return parsed;

    const summary = parsed.summary.trim();
    if (!summary) {
      return { error: "No company summary came back. Try again in a moment." };
    }

    const byId = new Map<string, string | null>();
    for (const row of parsed.contacts) {
      if (!allowedIds.has(row.id)) continue;
      byId.set(
        row.id,
        row.linkedin_url ? normalizePersonLinkedInUrl(row.linkedin_url) : null,
      );
    }

    return {
      summary,
      linkedin_url: parsed.linkedin_url
        ? normalizeCompanyLinkedInUrl(parsed.linkedin_url)
        : null,
      contacts: contacts.map((contact) => ({
        id: contact.id,
        linkedin_url: byId.get(contact.id) ?? null,
      })),
    };
  } catch (error) {
    const message = formatAnthropicUserError(
      error,
      "Company lookup failed. Try again in a moment.",
    );
    console.error("Claude company enrichment failed:", error);
    return { error: message };
  }
}

function parseEnrichmentJson(
  text: string,
):
  | {
      summary: string;
      linkedin_url: string | null;
      contacts: Array<{ id: string; linkedin_url: string | null }>;
    }
  | { error: string } {
  const raw = extractJsonObject(text);
  if (!raw || typeof raw !== "object") {
    return { error: "Could not read the lookup response. Try again." };
  }
  const record = raw as Record<string, unknown>;
  const summary = typeof record.summary === "string" ? record.summary : "";
  const linkedin_url =
    typeof record.linkedin_url === "string" ? record.linkedin_url : null;
  const contacts = Array.isArray(record.contacts)
    ? record.contacts.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        if (typeof row.id !== "string") return [];
        return [
          {
            id: row.id,
            linkedin_url:
              typeof row.linkedin_url === "string" ? row.linkedin_url : null,
          },
        ];
      })
    : [];
  return { summary, linkedin_url, contacts };
}

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}
