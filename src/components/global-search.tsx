"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";

import { StatusTag } from "@/components/status-tag";
import { TaskTypeTag } from "@/components/task-type-tag";
import { searchApp, type SearchHit, type SearchResults } from "@/lib/actions/search";

const EMPTY: SearchResults = {
  query: "",
  projects: [],
  lists: [],
  tasks: [],
  companies: [],
  contacts: [],
};

type FlatHit = SearchHit & {
  group: "Projects" | "Lists" | "Tasks" | "Companies" | "Contacts";
};

function flatten(results: SearchResults): FlatHit[] {
  return [
    ...results.projects.map((hit) => ({ ...hit, group: "Projects" as const })),
    ...results.lists.map((hit) => ({ ...hit, group: "Lists" as const })),
    ...results.tasks.map((hit) => ({ ...hit, group: "Tasks" as const })),
    ...results.companies.map((hit) => ({
      ...hit,
      group: "Companies" as const,
    })),
    ...results.contacts.map((hit) => ({ ...hit, group: "Contacts" as const })),
  ];
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export function GlobalSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const [openedOnPath, setOpenedOnPath] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [activeIndex, setActiveIndex] = useState(0);
  const [, startTransition] = useTransition();

  const open = openedOnPath === pathname;
  const hits = useMemo(() => flatten(results), [results]);
  const trimmedQuery = query.trim();
  const showResults = trimmedQuery.length > 0;
  const resultsMatchQuery = results.query === trimmedQuery;

  const openSearch = useCallback(() => {
    setOpenedOnPath(pathname);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [pathname]);

  const close = useCallback(() => {
    setOpenedOnPath(null);
  }, []);

  const goTo = useCallback(
    (href: string) => {
      setOpenedOnPath(null);
      router.push(href);
    },
    [router],
  );

  function updateQuery(next: string) {
    setQuery(next);
    if (next.trim().length < 1) {
      requestId.current += 1;
      setResults(EMPTY);
      setActiveIndex(0);
    }
  }

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenedOnPath(null);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k") return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      event.preventDefault();
      openSearch();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openSearch]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 1) return;

    const id = ++requestId.current;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const next = await searchApp(trimmed);
        if (id !== requestId.current) return;
        setResults(next);
        setActiveIndex(0);
      });
    }, 180);

    return () => clearTimeout(timer);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const hit = hits[activeIndex];
    if (!hit) return;
    document
      .getElementById(`${listId}-${hit.group}-${hit.id}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, hits, listId, open]);

  const panel = (
    <>
      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
        <SearchIcon className="h-4 w-4 shrink-0 text-[var(--muted)]" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) =>
                hits.length === 0 ? 0 : (index + 1) % hits.length,
              );
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) =>
                hits.length === 0
                  ? 0
                  : (index - 1 + hits.length) % hits.length,
              );
            } else if (event.key === "Enter") {
              event.preventDefault();
              const hit = hits[activeIndex];
              if (hit) goTo(hit.href);
            }
          }}
          placeholder="Search projects, lists, tasks, and CRM"
          className="min-h-10 w-full bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
          role="combobox"
          aria-expanded={showResults}
          aria-controls={listId}
          aria-activedescendant={
            hits[activeIndex]
              ? `${listId}-${hits[activeIndex].group}-${hits[activeIndex].id}`
              : undefined
          }
          aria-autocomplete="list"
        />
        <button
          type="button"
          className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] md:hidden"
          onClick={close}
        >
          Close
        </button>
      </div>

      <div className="max-h-[min(24rem,calc(100dvh-12rem))] overflow-y-auto overscroll-contain pt-2">
        {!showResults ? (
          <p className="px-1 py-6 text-center text-sm text-[var(--muted)]">
            Type to search across your projects.
          </p>
        ) : !resultsMatchQuery ? (
          <p className="px-1 py-6 text-center text-sm text-[var(--muted)]">
            Searching…
          </p>
        ) : results.error ? (
          <p className="px-1 py-6 text-center text-sm text-[var(--danger)]" role="alert">
            {results.error}
          </p>
        ) : hits.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-[var(--muted)]">
            No matches for “{trimmedQuery}”.
          </p>
        ) : (
          <ul id={listId} role="listbox" className="space-y-3">
            {(["Projects", "Lists", "Tasks", "Companies", "Contacts"] as const).map((group) => {
              const groupHits = hits.filter((hit) => hit.group === group);
              if (groupHits.length === 0) return null;
              return (
                <li key={group}>
                  <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                    {group}
                  </p>
                  <ul className="space-y-1">
                    {groupHits.map((hit) => {
                      const index = hits.findIndex(
                        (item) => item.id === hit.id && item.group === hit.group,
                      );
                      const active = index === activeIndex;
                      return (
                        <li key={`${hit.group}-${hit.id}`} role="none">
                          <Link
                            id={`${listId}-${hit.group}-${hit.id}`}
                            role="option"
                            aria-selected={active}
                            href={hit.href}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={close}
                            className={`flex items-start gap-2 rounded-lg px-2.5 py-2 ${
                              active
                                ? "bg-[var(--accent-soft)]"
                                : "hover:bg-[var(--surface-2)]"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {hit.title}
                              </p>
                              {hit.subtitle ? (
                                <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                                  {hit.subtitle}
                                </p>
                              ) : null}
                            </div>
                            {hit.taskType ? (
                              <span className="mt-0.5 shrink-0">
                                <TaskTypeTag taskType={hit.taskType} />
                              </span>
                            ) : null}
                            {hit.status ? (
                              <span className="mt-0.5 shrink-0">
                                <StatusTag status={hit.status} />
                              </span>
                            ) : null}
                            {hit.archived ? (
                              <span className="mt-0.5 shrink-0 rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--muted)]">
                                Archived
                              </span>
                            ) : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );

  return (
    <div className="flex min-w-0 flex-1 justify-end md:justify-center md:px-2">
      <button
        type="button"
        onClick={openSearch}
        className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[var(--border)] px-2 hover:bg-[var(--surface-2)] md:hidden"
        aria-label="Search"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <SearchIcon className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={openSearch}
        className="hidden h-9 w-full min-w-0 max-w-md items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 text-left text-sm text-[var(--muted)] hover:bg-[var(--surface-2)] md:flex"
        aria-label="Search"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
      >
        <SearchIcon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Search</span>
        <kbd className="hidden rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted)] lg:inline">
          ⌘K
        </kbd>
      </button>

      {open
        ? createPortal(
            <>
              <button
                type="button"
                className="fixed inset-0 z-[80] bg-black/40 md:bg-black/20"
                aria-label="Close search"
                onClick={close}
              />
              <div
                role="dialog"
                aria-label="Search"
                className="fixed inset-x-3 top-[4.25rem] z-[90] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-lg md:inset-x-auto md:left-1/2 md:top-20 md:w-[32rem] md:max-w-[calc(100vw-2rem)] md:-translate-x-1/2"
              >
                {panel}
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
