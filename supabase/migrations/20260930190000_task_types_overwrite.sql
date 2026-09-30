-- Replace task_type options with: Bugs, Questions, New Feature, Improvement, Shopify Admin.
-- Keep bug / new_feature / improvement values; clear removed types.

create type public.task_type_new as enum (
  'bug',
  'question',
  'new_feature',
  'improvement',
  'shopify_admin'
);

alter table public.tasks
  alter column task_type type public.task_type_new
  using (
    case task_type::text
      when 'bug' then 'bug'::public.task_type_new
      when 'new_feature' then 'new_feature'::public.task_type_new
      when 'improvement' then 'improvement'::public.task_type_new
      else null
    end
  );

drop type public.task_type;

alter type public.task_type_new rename to task_type;
