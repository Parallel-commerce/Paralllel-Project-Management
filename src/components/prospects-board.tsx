"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { CompanyMark } from "@/components/company-mark";
import { CompanyVerticalTag } from "@/components/company-vertical-tag";
import { updateCompanyStatus } from "@/lib/actions/crm";
import { companyStatusColors } from "@/lib/company-status";
import { formatDayMonth } from "@/lib/format-date";
import {
  OPEN_LEAD_STATUSES,
  type CompanyStatus,
} from "@/types/database";

export type ProspectBoardCompany = {
  id: string;
  name: string;
  website: string | null;
  status: CompanyStatus;
  follow_up_at: string | null;
  summary: string | null;
  contactCount: number;
  verticals: { id: string; name: string }[];
};

const BOARD_COLUMNS: { value: CompanyStatus; label: string; hint?: string }[] = [
  ...OPEN_LEAD_STATUSES,
  { value: "won", label: "Won", hint: "Converts to customer" },
  { value: "lost", label: "Lost", hint: "Converts to lost opportunity" },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function ProspectCard({
  company,
  dragging = false,
}: {
  company: ProspectBoardCompany;
  dragging?: boolean;
}) {
  const today = todayIso();
  const followUp = company.follow_up_at?.slice(0, 10) ?? null;
  const overdue = !!followUp && followUp < today;

  return (
    <article
      className={`rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm ${
        dragging ? "shadow-lg ring-2 ring-[var(--accent)]/25" : ""
      }`}
    >
      <div className="flex items-start gap-2.5">
        <CompanyMark name={company.name} website={company.website} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/crm/${company.id}`}
            className="block truncate font-medium tracking-tight hover:text-[var(--accent)]"
            onClick={(event) => event.stopPropagation()}
          >
            {company.name}
          </Link>
          {company.verticals.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {company.verticals.map((item) => (
                <CompanyVerticalTag key={item.id} name={item.name} />
              ))}
            </div>
          ) : null}
          {company.summary ? (
            <p className="mt-1.5 line-clamp-2 text-xs text-[var(--muted)]">
              {company.summary}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--muted)]">
            <span>
              {company.contactCount} contact
              {company.contactCount === 1 ? "" : "s"}
            </span>
            {followUp ? (
              <span className={overdue ? "text-[var(--danger)]" : undefined}>
                Follow up {formatDayMonth(followUp)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function DraggableProspectCard({ company }: { company: ProspectBoardCompany }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: company.id,
    data: { company },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`touch-none ${isDragging ? "opacity-40" : ""}`}
    >
      <ProspectCard company={company} />
    </div>
  );
}

function ProspectColumn({
  status,
  label,
  hint,
  companies,
}: {
  status: CompanyStatus;
  label: string;
  hint?: string;
  companies: ProspectBoardCompany[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const colors = companyStatusColors(status);
  const isSink = status === "won" || status === "lost";

  return (
    <section
      ref={setNodeRef}
      className={`flex w-[min(85vw,18.5rem)] shrink-0 snap-center flex-col rounded-xl border p-3 transition xl:w-auto ${
        colors.border
      } ${
        isOver
          ? "bg-[var(--accent-soft)]/80 ring-2 ring-[var(--accent)]/30"
          : colors.bg
      }`}
    >
      <div className="flex items-center gap-2 px-1">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${colors.accent}`}
          aria-hidden
        />
        <h2 className={`text-sm font-medium tracking-tight ${colors.label}`}>
          {label}
          <span className="ml-2 font-normal opacity-70">{companies.length}</span>
        </h2>
      </div>
      {hint ? (
        <p className="mt-1 px-1 text-[11px] text-[var(--muted)]">{hint}</p>
      ) : null}
      <div className="mt-3 flex min-h-28 flex-col gap-2">
        {companies.length === 0 ? (
          <p className="px-1 py-8 text-center text-xs text-[var(--muted)]">
            {isSink ? "Drop prospects here" : "No prospects"}
          </p>
        ) : (
          companies.map((company) => (
            <DraggableProspectCard key={company.id} company={company} />
          ))
        )}
      </div>
    </section>
  );
}

export function ProspectsBoard({
  companies: initialCompanies,
}: {
  companies: ProspectBoardCompany[];
}) {
  const router = useRouter();
  const [companies, setCompanies] = useState(initialCompanies);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [prevCompanies, setPrevCompanies] = useState(initialCompanies);

  if (initialCompanies !== prevCompanies) {
    setPrevCompanies(initialCompanies);
    setCompanies(initialCompanies);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const grouped = useMemo(() => {
    const map = Object.fromEntries(
      BOARD_COLUMNS.map((column) => [
        column.value,
        [] as ProspectBoardCompany[],
      ]),
    ) as Record<CompanyStatus, ProspectBoardCompany[]>;
    for (const company of companies) {
      if (company.status in map) {
        map[company.status].push(company);
      } else {
        map.lead.push(company);
      }
    }
    return map;
  }, [companies]);

  const activeCompany = activeId
    ? (companies.find((company) => company.id === activeId) ?? null)
    : null;

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    const companyId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    setActiveId(null);
    if (!overId) return;

    const nextStatus = overId as CompanyStatus;
    if (!BOARD_COLUMNS.some((column) => column.value === nextStatus)) return;

    const company = companies.find((item) => item.id === companyId);
    if (!company || company.status === nextStatus) return;

    const previous = companies;
    if (nextStatus === "won" || nextStatus === "lost") {
      setCompanies((current) =>
        current.filter((item) => item.id !== companyId),
      );
    } else {
      setCompanies((current) =>
        current.map((item) =>
          item.id === companyId ? { ...item, status: nextStatus } : item,
        ),
      );
    }

    startTransition(async () => {
      const result = await updateCompanyStatus(companyId, nextStatus);
      if (result?.error) {
        setCompanies(previous);
        return;
      }
      router.refresh();
    });
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="scroll-x-fade flex snap-x snap-mandatory gap-3 pb-2 xl:grid xl:snap-none xl:grid-cols-5 xl:overflow-visible xl:pb-0">
        {BOARD_COLUMNS.map((column) => (
          <ProspectColumn
            key={column.value}
            status={column.value}
            label={column.label}
            hint={column.hint}
            companies={grouped[column.value]}
          />
        ))}
      </div>
      <DragOverlay>
        {activeCompany ? (
          <ProspectCard company={activeCompany} dragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
