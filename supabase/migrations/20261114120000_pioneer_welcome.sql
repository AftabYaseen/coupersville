-- Pioneer Circle welcome step (client request, 2026-11-11). When a new business finishes setup while
-- the founding offer (Pioneer Circle) window is open, it sees the Pioneer Circle page once. This
-- records when that happened, so it is shown only once. Written by server code only.
--
-- Adds one nullable column. Drops nothing; existing businesses keep null and never see the step,
-- because it is shown only straight after setup.

begin;

alter table public.businesses
  add column if not exists pioneer_welcome_seen_at timestamptz;

comment on column public.businesses.pioneer_welcome_seen_at is
  'When the owner was shown the Pioneer Circle welcome after setup; null if never shown.';

commit;
