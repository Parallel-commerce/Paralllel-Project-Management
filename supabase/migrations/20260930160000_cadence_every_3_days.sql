-- Every 3 days cadence (Growth / top-level package scheduling).
alter type public.schedule_cadence add value if not exists 'every_3_days';

comment on column public.project_engagement.schedule_cadence is
  'How often work days are available: weekly, fortnightly, or every 3 days from the anchor date.';

comment on column public.project_engagement.schedule_anchor_date is
  'Reference date for fortnightly and every-3-days cadences.';
