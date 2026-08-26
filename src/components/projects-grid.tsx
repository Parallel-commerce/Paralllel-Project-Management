"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Image from "next/image";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";

import { StatusCountTag } from "@/components/status-tag";
import { reorderProjects } from "@/lib/actions/projects";

export type ProjectCardData = {
  id: string;
  name: string;
  logoUrl: string | null;
  todoCount: number;
};

function ProjectMark({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt=""
        width={36}
        height={36}
        className="h-9 w-9 shrink-0 rounded-lg border border-[var(--border)] bg-white object-cover"
      />
    );
  }

  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] font-display text-sm text-[var(--accent)]">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function ProjectCardContent({ project }: { project: ProjectCardData }) {
  return (
    <>
      <ProjectMark name={project.name} logoUrl={project.logoUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium tracking-tight">
          {project.name}
        </p>
        <div className="mt-0.5">
          {project.todoCount > 0 ? (
            <StatusCountTag status="todo" count={project.todoCount} />
          ) : (
            <span className="text-[11px] text-[var(--muted)]">No to do</span>
          )}
        </div>
      </div>
    </>
  );
}

function SortableProjectCard({
  project,
  canReorder,
}: {
  project: ProjectCardData;
  canReorder: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: project.id,
    disabled: !canReorder,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={isDragging ? "opacity-40" : undefined}
    >
      <div className="group flex min-h-[3.25rem] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 py-2 transition hover:border-[var(--foreground)]/15 hover:bg-white sm:gap-2.5 sm:px-2.5">
        {canReorder ? (
          <button
            type="button"
            className="shrink-0 cursor-grab touch-none px-0.5 py-2 text-[var(--muted)] active:cursor-grabbing"
            aria-label={`Reorder ${project.name}`}
            {...listeners}
            {...attributes}
          >
            ⋮⋮
          </button>
        ) : null}
        <Link
          href={`/projects/${project.id}`}
          className="flex min-w-0 flex-1 items-center gap-2.5"
        >
          <ProjectCardContent project={project} />
        </Link>
      </div>
    </li>
  );
}

export function ProjectsGrid({
  projects,
  canReorder,
}: {
  projects: ProjectCardData[];
  canReorder: boolean;
}) {
  const [items, setOptimisticItems] = useOptimistic(projects);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const activeProject = activeId
    ? (items.find((project) => project.id === activeId) ?? null)
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setError(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((project) => project.id === active.id);
    const newIndex = items.findIndex((project) => project.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(items, oldIndex, newIndex);
    startTransition(async () => {
      setOptimisticItems(next);
      const result = await reorderProjects(next.map((project) => project.id));
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  const gridClass =
    "mt-5 grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-2.5";

  if (!canReorder) {
    return (
      <ul className={gridClass}>
        {items.map((project) => (
          <li key={project.id}>
            <Link
              href={`/projects/${project.id}`}
              className="group flex min-h-[3.25rem] items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 transition hover:border-[var(--foreground)]/15 hover:bg-white"
            >
              <ProjectCardContent project={project} />
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((project) => project.id)}
          strategy={rectSortingStrategy}
        >
          <ul className={gridClass}>
            {items.map((project) => (
              <SortableProjectCard
                key={project.id}
                project={project}
                canReorder
              />
            ))}
          </ul>
        </SortableContext>
        <DragOverlay>
          {activeProject ? (
            <div className="flex min-h-[3.25rem] items-center gap-2 rounded-xl border border-[var(--foreground)]/15 bg-white px-2 py-2 shadow-lg sm:gap-2.5 sm:px-2.5">
              <span className="shrink-0 px-0.5 py-2 text-[var(--muted)]">
                ⋮⋮
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <ProjectCardContent project={activeProject} />
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {error ? (
        <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
