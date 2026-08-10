"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Step = "email" | "code";

export function LoginForm({ nextPath = "/home" }: { nextPath?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") {
      codeInputRef.current?.focus();
    }
  }, [step]);

  async function sendCode(event?: React.FormEvent) {
    event?.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;

    setStatus("loading");
    setMessage(null);

    const supabase = createClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: {
        // Magic link still works on the same device; OTP works across devices.
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setEmail(normalized);
    setCode("");
    setStep("code");
    setStatus("idle");
    setMessage(null);
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    const token = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(token)) {
      setStatus("error");
      setMessage("Enter the 6-digit code from your email.");
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
          : error.message,
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
          Enter it below. You can also use the magic link in the same email on
          this device.
        </p>

        <label className="flex flex-col gap-2 text-sm text-[var(--muted)]">
          One-time code
          <input
            ref={codeInputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/[^\d]/g, "").slice(0, 6))
            }
            placeholder="123456"
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2.5 text-center font-display text-xl tracking-[0.35em] text-[var(--foreground)] outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>

        <button
          type="submit"
          disabled={status === "loading" || code.length < 6}
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
            disabled={status === "loading"}
            onClick={() => void sendCode()}
            className="text-[var(--accent)] hover:underline disabled:opacity-60"
          >
            Resend code
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
        disabled={status === "loading"}
        className="rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "loading" ? "Sending…" : "Email me a code"}
      </button>

      {message ? (
        <p className="text-sm text-red-700" role="alert">
          {message}
        </p>
      ) : null}
    </form>
  );
}
