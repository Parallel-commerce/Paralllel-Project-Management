"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function LoginForm({ nextPath = "/home" }: { nextPath?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("loading");
    setMessage(null);

    const supabase = createClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setStatus("sent");
    setMessage("Check your email for a magic link to sign in.");
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm text-[var(--muted)]">
        Email address
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2.5 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
        />
      </label>

      <button
        type="submit"
        disabled={status === "loading" || status === "sent"}
        className="rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "loading" ? "Sending link…" : "Send magic link"}
      </button>

      {message ? (
        <p
          className={`text-sm ${status === "error" ? "text-red-700" : "text-[var(--muted)]"}`}
          role="status"
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
