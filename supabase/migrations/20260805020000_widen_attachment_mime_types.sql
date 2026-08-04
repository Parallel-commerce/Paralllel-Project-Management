-- Widen task attachment MIME types (allow common office/docs + catch-all null list)

update storage.buckets
set allowed_mime_types = array[
  -- Images
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/heic',
  'image/heif',
  -- Documents
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/rtf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  -- Archives / misc
  'application/zip',
  'application/x-zip-compressed',
  'application/json',
  'application/xml',
  'text/xml',
  -- Browsers sometimes send empty/octet for Office files
  'application/octet-stream'
]
where id = 'task-attachments';
