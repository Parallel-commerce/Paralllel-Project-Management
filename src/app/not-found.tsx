import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6 py-20">
      <h1 className="font-display text-3xl tracking-tight">Not found</h1>
      <p className="mt-2 text-[var(--muted)]">
        That project or list isn&apos;t available, or you don&apos;t have access.
      </p>
      <Link
        href="/projects"
        className="mt-6 text-sm text-[var(--accent)] hover:underline"
      >
        Back to projects
      </Link>
    </main>
  );
}
