"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Step = "email" | "code";

const RESEND_COOLDOWN_SECONDS = 15;

function friendlyAuthError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("only request this after") || lower.includes("security purposes")) {
    return "Please wait a few seconds before requesting another code.";
  }
  if (lower.includes("rate") || lower.includes("too many")) {
    return "Too many attempts. Wait a moment, then try again.";
  }
  return message;
}

export function LoginForm({ nextPath = "/home" }: { nextPath?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") {
      codeInputRef.current?.focus();
    }
  }, [step]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  async function sendCode(event?: React.FormEvent) {
    event?.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    if (cooldown > 0) {
      setStatus("error");
      setMessage(`Please wait ${cooldown}s before requesting another code.`);
      return;
    }

    setStatus("loading");
    setMessage(null);

    const supabase = createClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: {
        // Cross-device sign-in uses the emailed code, or the token_hash link
        // handled by /auth/confirm (not the PKCE ConfirmationURL).
        emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(nextPath)}`,
      },
    });

    if (error) {
      const friendly = friendlyAuthError(error.message);
      // If they already requested a code, still move them to the entry step.
      if (
        error.message.toLowerCase().includes("only request this after") ||
        error.message.toLowerCase().includes("security purposes")
      ) {
        setEmail(normalized);
        setStep("code");
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setStatus("error");
        setMessage(friendly);
        return;
      }
      setStatus("error");
      setMessage(friendly);
      return;
    }

    setEmail(normalized);
    setCode("");
    setStep("code");
    setCooldown(RESEND_COOLDOWN_SECONDS);
    setStatus("idle");
    setMessage(null);
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    const token = code.replace(/\s+/g, "");
    if (!/^\d{6,8}$/.test(token)) {
      setStatus("error");
      setMessage("Enter the code from your email.");
      return;
    }

    setStatus("loading");
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: "email",
    });

    if (error) {
      setStatus("error");
      setMessage(
        error.message.includes("expired") || error.message.includes("invalid")
          ? "That code is invalid or expired. Request a new one."
          : friendlyAuthError(error.message),
      );
      return;
    }

    router.replace(nextPath);
    router.refresh();
  }

  if (step === "code") {
    return (
      <form onSubmit={verifyCode} className="flex w-full flex-col gap-4">
        <p className="text-sm text-[var(--muted)]">
          We sent a sign-in code to{" "}
          <span className="font-medium text-[var(--foreground)]">{email}</span>.
          Enter the code from that email.
        </p>

        <label className="flex flex-col gap-2 text-sm text-[var(--muted)]">
          One-time code
          <input
            ref={codeInputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            required
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/[^\d]/g, "").slice(0, 8))
            }
            placeholder="12345678"
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2.5 text-center font-display text-xl tracking-[0.35em] text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>

        <button
          type="submit"
          disabled={
            status === "loading" || (code.length !== 6 && code.length !== 8)
          }
          className="rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading" ? "Signing in…" : "Sign in"}
        </button>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <button
            type="button"
            disabled={status === "loading"}
            onClick={() => {
              setStep("email");
              setCode("");
              setMessage(null);
              setStatus("idle");
            }}
            className="text-[var(--muted)] hover:text-[var(--foreground)] hover:underline disabled:opacity-60"
          >
            Use a different email
          </button>
          <button
            type="button"
            disabled={status === "loading" || cooldown > 0}
            onClick={() => void sendCode()}
            className="text-[var(--accent)] hover:underline disabled:opacity-60"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        </div>

        {message ? (
          <p className="text-sm text-red-700" role="alert">
            {message}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} className="flex w-full flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm text-[var(--muted)]">
        Email address
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          autoComplete="email"
          className="rounded-md border border-[var(--border)] bg-white px-3 py-2.5 text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
        />
      </label>

      <button
        type="submit"
        disabled={status === "loading" || cooldown > 0}
        className="rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "loading"
          ? "Sending…"
          : cooldown > 0
            ? `Wait ${cooldown}s`
            : "Email me a code"}
      </button>

      {message ? (
        <p className="text-sm text-red-700" role="alert">
          {message}
        </p>
      ) : null}
    </form>
  );
}
