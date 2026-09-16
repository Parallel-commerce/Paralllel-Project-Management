import { APIError } from "@anthropic-ai/sdk";

export function formatAnthropicUserError(
  error: unknown,
  fallback: string,
): string {
  const details = extractAnthropicDetails(error);
  const text = details.text.toLowerCase();

  if (
    text.includes("credit balance") ||
    text.includes("purchase credits") ||
    text.includes("plans & billing") ||
    text.includes("billing")
  ) {
    return "Claude API credits are used up. Add usage billing at console.anthropic.com (this is separate from a Claude.ai subscription), then try again.";
  }

  if (details.status === 401 || text.includes("invalid api key") || text.includes("authentication")) {
    return "The Anthropic API key is invalid. Check ANTHROPIC_API_KEY and try again.";
  }

  if (details.status === 429 || text.includes("rate limit")) {
    return "Claude is rate-limited right now. Wait a moment and try again.";
  }

  if (details.userMessage) return details.userMessage;
  return fallback;
}

function extractAnthropicDetails(error: unknown): {
  status: number | undefined;
  text: string;
  userMessage: string | null;
} {
  if (error instanceof APIError) {
    const nested = nestedErrorMessage(error.error);
    return {
      status: error.status,
      text: [error.message, nested].filter(Boolean).join(" "),
      userMessage: nested,
    };
  }

  const raw = error instanceof Error ? error.message : String(error ?? "");
  const nested = extractJsonErrorMessage(raw);
  return {
    status: parseStatusPrefix(raw),
    text: [raw, nested].filter(Boolean).join(" "),
    userMessage: nested,
  };
}

function nestedErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const nested = record.error;
  if (nested && typeof nested === "object") {
    const message = (nested as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }
  return null;
}

function extractJsonErrorMessage(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;
  try {
    return nestedErrorMessage(JSON.parse(raw.slice(start)));
  } catch {
    return null;
  }
}

function parseStatusPrefix(raw: string): number | undefined {
  const match = raw.trim().match(/^(\d{3})\b/);
  if (!match) return undefined;
  return Number(match[1]);
}
