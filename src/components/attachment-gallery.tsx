"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  isPreviewableImage,
  taskAttachmentPublicUrl,
} from "@/lib/task-attachments";

export type GalleryAttachment = {
  id: string;
  file_path: string;
  file_name: string;
  content_type: string | null;
};

export function AttachmentGallery({
  attachments,
}: {
  attachments: GalleryAttachment[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = attachments.find((file) => file.id === openId) ?? null;
  const openUrl = open ? taskAttachmentPublicUrl(open.file_path) : null;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (attachments.length === 0) return null;

  return (
    <>
      <ul
        className={`mt-2 grid gap-2 ${
          attachments.length > 1 ? "grid-cols-2" : "grid-cols-1"
        }`}
      >
        {attachments.map((file) => {
          const url = taskAttachmentPublicUrl(file.file_path);
          const preview = isPreviewableImage(file.content_type);
          return (
            <li key={file.id}>
              {url && preview ? (
                <button
                  type="button"
                  onClick={() => setOpenId(file.id)}
                  className="block w-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-left"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={file.file_name}
                    className="max-h-64 w-full object-cover"
                  />
                </button>
              ) : url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--accent)] hover:underline"
                >
                  {file.file_name}
                </a>
              ) : (
                <span className="block truncate text-sm">{file.file_name}</span>
              )}
            </li>
          );
        })}
      </ul>
      {open && openUrl
        ? createPortal(
            <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-black/70"
                aria-label="Close image"
                onClick={() => setOpenId(null)}
              />
              <figure className="relative z-10 max-h-[90vh] max-w-[min(96vw,56rem)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={openUrl}
                  alt={open.file_name}
                  className="max-h-[90vh] w-auto max-w-full rounded-lg object-contain"
                />
                <figcaption className="mt-2 text-center text-xs text-white/80">
                  <a
                    href={openUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {open.file_name}
                  </a>
                </figcaption>
              </figure>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
