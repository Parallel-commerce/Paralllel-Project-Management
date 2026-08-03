import Link from "next/link";

import { ParallelLogo } from "@/components/parallel-logo";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-6 py-20">
      <ParallelLogo href="/" className="h-10 w-auto sm:h-12" priority />
      <h1 className="mt-6 max-w-xl font-display text-2xl tracking-tight text-[var(--foreground)] sm:text-3xl">
        Project task tracking for teams and clients
      </h1>
      <p className="mt-3 max-w-lg text-[var(--muted)]">
        Organize work across projects and lists. Invite your team and clients,
        then collaborate on public boards with clear statuses and due dates.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/login"
          className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
        >
          Sign in
        </Link>
        <Link
          href="/projects"
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-5 py-2.5 text-sm font-medium hover:bg-[var(--surface-2)]"
        >
          Go to projects
        </Link>
      </div>
    </main>
  );
}
