"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  VERTICAL_NAME_MAX,
  parseVerticalName,
  verticalNamesEqual,
  type VerticalOption,
} from "@/lib/verticals";

export function CompanyVerticalField({
  selected,
  options,
  onAdd,
  onRemove,
  disabled,
  name,
}: {
  selected: VerticalOption[];
  options: VerticalOption[];
  onAdd: (input: { id?: string; name: string }) => void;
  onRemove: (verticalId: string) => void;
  disabled?: boolean;
  name?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const available = useMemo(
    () =>
      options.filter(
        (option) =>
          !selected.some((item) => verticalNamesEqual(item.name, option.name)),
      ),
    [options, selected],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter((option) =>
      option.name.toLowerCase().includes(q),
    );
  }, [available, query]);

  const parsedQuery = parseVerticalName(query);
  const createName =
    typeof parsedQuery === "string" ? parsedQuery : null;
  const canCreate =
    Boolean(createName) &&
    !selected.some((item) => verticalNamesEqual(item.name, createName!)) &&
    !options.some((item) => verticalNamesEqual(item.name, createName!));

  const items: Array<
    | { kind: "option"; option: VerticalOption }
    | { kind: "create"; name: string }
  > = [
    ...matches.map((option) => ({ kind: "option" as const, option })),
    ...(canCreate && createName
      ? [{ kind: "create" as const, name: createName }]
      : []),
  ];

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function choose(index: number) {
    const item = items[index];
    if (!item || disabled) return;
    if (item.kind === "option") {
      onAdd({ id: item.option.id, name: item.option.name });
    } else {
      onAdd({ name: item.name });
    }
    setQuery("");
    setHighlight(0);
    inputRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
      <span>Verticals</span>
      {name
        ? selected.map((item) => (
            <input
              key={item.id || item.name}
              type="hidden"
              name={name}
              value={item.name}
            />
          ))
        : null}
      <div
        ref={rootRef}
        className={`rounded-md border border-[var(--border)] bg-white px-2 py-1.5 outline-none ring-[var(--accent)] focus-within:ring-2 ${
          disabled ? "opacity-60" : ""
        }`}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {selected.map((item) => (
            <span
              key={item.id || item.name}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--foreground)] ring-1 ring-inset ring-[var(--border)]"
            >
              <span className="truncate">{item.name}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${item.name}`}
                onClick={() => onRemove(item.id)}
                className="shrink-0 text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                ×
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={query}
            disabled={disabled}
            maxLength={VERTICAL_NAME_MAX}
            placeholder={
              selected.length === 0
                ? "Search or create a vertical"
                : "Add another"
            }
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
                setHighlight((current) =>
                  items.length === 0
                    ? 0
                    : current + 1 >= items.length
                      ? 0
                      : current + 1,
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setOpen(true);
                setHighlight((current) =>
                  items.length === 0
                    ? 0
                    : current - 1 < 0
                      ? items.length - 1
                      : current - 1,
                );
              } else if (event.key === "Enter") {
                if (
                  open &&
                  items[highlight] &&
                  (query.trim() !== "" || highlight > 0)
                ) {
                  event.preventDefault();
                  choose(highlight);
                }
              } else if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
                setQuery("");
              } else if (
                event.key === "Backspace" &&
                query === "" &&
                selected.length > 0
              ) {
                onRemove(selected[selected.length - 1].id);
              }
            }}
            className="min-w-[8rem] flex-1 border-0 bg-transparent py-1 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
          />
        </div>
        {open ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="Verticals"
            className="mt-1 max-h-48 overflow-y-auto border-t border-[var(--border)] pt-1"
          >
            {items.length === 0 ? (
              <li className="px-2 py-2 text-sm text-[var(--muted)]">
                {query.trim()
                  ? "No matching verticals."
                  : "Type a name to create the first vertical."}
              </li>
            ) : (
              items.map((item, index) => (
                <li key={item.kind === "option" ? item.option.id : "create"}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === highlight}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => choose(index)}
                    className={`flex w-full items-center px-2 py-1.5 text-left text-sm ${
                      index === highlight
                        ? "bg-[var(--accent-soft)] text-[var(--foreground)]"
                        : "text-[var(--foreground)] hover:bg-[var(--surface-2)]"
                    }`}
                  >
                    {item.kind === "option"
                      ? item.option.name
                      : `Create “${item.name}”`}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
      {typeof parsedQuery === "object" && parsedQuery?.error ? (
        <p className="text-sm text-[var(--danger)]">{parsedQuery.error}</p>
      ) : (
        <p className="text-xs">
          The industries they work in. Pick an existing vertical or type a new
          name.
        </p>
      )}
    </div>
  );
}
