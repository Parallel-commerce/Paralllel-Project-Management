import Link from "next/link";

import { ProjectTypeTag } from "@/components/project-type-tag";
import { planCadenceLabel } from "@/lib/plan-cadence";
import { planChangeAllowanceLabel } from "@/lib/plan-changes";
import type { NextWorkTask } from "@/lib/project-next-work";
import type { ProjectType } from "@/types/database";

export function ProjectClientOverview({
  projectId,
  planType,
  nextWork,
  primaryListId = null,
}: {
  projectId: string;
  planType: ProjectType | null;
  nextWork: NextWorkTask | null;
  /** When set, next-work on this list opens on the project page. */
  primaryListId?: string | null;
}) {
  if (!planType && !nextWork) return null;

  const cadence = planCadenceLabel(planType);
  const allowance = planChangeAllowanceLabel(planType);
  const planBits = [allowance, cadence].filter(Boolean);
  const nextHref = nextWork
    ? nextWork.listId === primaryListId
      ? `/projects/${projectId}?task=${nextWork.id}`
      : `/projects/${projectId}/lists/${nextWork.listId}?task=${nextWork.id}`
    : null;
  const whenLabel = nextWork
    ? nextWork.isInProgress
      ? nextWork.dueLabel
        ? `In progress · due ${nextWork.dueLabel}`
        : "In progress"
      : nextWork.dueLabel
        ? `Scheduled ${nextWork.dueLabel}`
        : "Date TBC"
    : null;

  return (
    <div className="mt-2 flex flex-col gap-1 text-sm text-[var(--muted)]">
      {planType ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <ProjectTypeTag projectType={planType} />
          {planBits.length > 0 ? (
            <span className="text-xs sm:text-sm">{planBits.join(" · ")}</span>
          ) : null}
        </div>
      ) : null}
      {nextWork && nextHref ? (
        <p className="min-w-0 truncate">
          <span className="text-xs uppercase tracking-wide">
            {nextWork.isInProgress ? "Now" : "Up next"}
          </span>
          <span className="mx-1.5 text-[var(--border)]" aria-hidden>
            ·
          </span>
          <Link
            href={nextHref}
            className="font-medium text-[var(--foreground)] hover:text-[var(--accent)]"
          >
            {nextWork.key ? `${nextWork.key} ` : ""}
            {nextWork.title}
          </Link>
          {whenLabel ? (
            <>
              <span className="mx-1.5 text-[var(--border)]" aria-hidden>
                ·
              </span>
              <span>{whenLabel}</span>
            </>
          ) : null}
        </p>
      ) : planType ? (
        <p className="text-xs sm:text-sm">Nothing queued right now.</p>
      ) : null}
    </div>
  );
}
