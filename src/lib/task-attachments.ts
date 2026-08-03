const TASK_ATTACHMENT_BUCKET = "task-attachments";

export function taskAttachmentPublicUrl(filePath: string | null | undefined) {
  if (!filePath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/${TASK_ATTACHMENT_BUCKET}/${filePath}`;
}

export { TASK_ATTACHMENT_BUCKET };
