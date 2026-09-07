const TASK_ATTACHMENT_BUCKET = "task-attachments";

export const COMMENT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const COMMENT_IMAGE_MAX_FILES = 6;

const COMMENT_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

export function taskAttachmentPublicUrl(filePath: string | null | undefined) {
  if (!filePath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/${TASK_ATTACHMENT_BUCKET}/${filePath}`;
}

export function isPreviewableImage(contentType: string | null | undefined) {
  if (!contentType) return false;
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return type.startsWith("image/") && type !== "image/svg+xml";
}

export function isAllowedCommentImage(file: { type: string; name: string }) {
  const type = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
  if (COMMENT_IMAGE_MIME_TYPES.has(type)) return true;
  if (!type || type === "application/octet-stream") {
    return /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name);
  }
  return false;
}

export function safeAttachmentFileName(name: string) {
  return name.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 120);
}

export function commentMediaPreview(body: string, imageCount: number) {
  const trimmed = body.trim();
  if (trimmed) return trimmed;
  if (imageCount === 1) return "Sent a photo";
  if (imageCount > 1) return `Sent ${imageCount} photos`;
  return "";
}

export { TASK_ATTACHMENT_BUCKET };
