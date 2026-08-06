export default function AppLoading() {
  return (
    <main className="app-container py-6 sm:py-10" aria-busy="true" aria-live="polite">
      <div className="h-3 w-24 animate-pulse rounded bg-[var(--border)]" />
      <div className="mt-4 h-8 w-48 max-w-full animate-pulse rounded bg-[var(--border)]" />
      <div className="mt-2 h-4 w-72 max-w-full animate-pulse rounded bg-[var(--border)]/70" />

      <div className="mt-8 space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-16 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]"
          >
            <div className="flex h-full items-center gap-3 px-4">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-[var(--border)]" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3 w-1/3 rounded bg-[var(--border)]" />
                <div className="h-2.5 w-2/3 rounded bg-[var(--border)]/70" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
