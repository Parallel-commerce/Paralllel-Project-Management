-- Task URLs were unused; attachments cover related files instead.

alter table public.tasks
  drop column if exists link_url;
