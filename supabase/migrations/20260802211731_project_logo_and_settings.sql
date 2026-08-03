-- Project logo path + storage bucket for logos

alter table public.projects
  add column if not exists logo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-logos',
  'project-logos',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Members can read logos for their projects (also public bucket, but keep policy)
drop policy if exists "Project members can view logos" on storage.objects;
create policy "Project members can view logos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'project-logos'
    and public.is_project_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Project admins can upload logos" on storage.objects;
create policy "Project admins can upload logos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-logos'
    and public.is_project_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Project admins can update logos" on storage.objects;
create policy "Project admins can update logos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'project-logos'
    and public.is_project_admin(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'project-logos'
    and public.is_project_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Project admins can delete logos" on storage.objects;
create policy "Project admins can delete logos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'project-logos'
    and public.is_project_admin(((storage.foldername(name))[1])::uuid)
  );
