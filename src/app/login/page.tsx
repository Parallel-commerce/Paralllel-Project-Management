import Link from "next/link";

import { LoginForm } from "@/components/login-form";
import { ParallelLogo } from "@/components/parallel-logo";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-10 sm:px-6 sm:py-16">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
        <ParallelLogo href="/" className="h-8 w-auto" priority />
        <h1 className="mt-5 font-display text-xl tracking-tight">
          Sign in
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          We&apos;ll email you a one-time code. Enter it here to sign in — works
          on any device.
        </p>

        {params.error === "removed" ? (
          <p className="mt-4 rounded-md bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent-hover)]">
            This account has been removed. Contact Parallel if you need access
            again.
          </p>
        ) : params.error ? (
          <p className="mt-4 rounded-md bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent-hover)]">
            Sign-in failed. Request a new code from the form below.
          </p>
        ) : null}

        <div className="mt-6">
          <LoginForm nextPath={params.next || "/home"} />
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        <Link href="/" className="underline-offset-2 hover:underline">
          Back home
        </Link>
      </p>
    </main>
  );
}
