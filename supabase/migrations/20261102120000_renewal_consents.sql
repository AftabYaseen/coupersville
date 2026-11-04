-- Automatic-renewal agreements (New York General Business Law 527-a).
--
-- Before payment, a merchant ticks a box next to the renewal terms: price, billing cycle, renewal
-- date, renewal price and how to cancel. Each agreement is recorded here with the exact wording
-- shown and the time it was given:
--   checkout   buying an offer through Accept Hosted (linked to the checkout)
--   add_card   a free Founding seat adding a card, so it continues on General when the free year ends
-- Written by server code only. Owners, managers and admins can read their business's records.

create table public.renewal_consents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  context text not null check (context in ('checkout', 'add_card')),
  checkout_id uuid references public.checkouts(id) on delete set null,
  offer_code text not null references public.offers(code),
  billing_cycle text not null check (billing_cycle in ('annual', 'monthly')),
  wording text not null check (length(wording) between 50 and 4000),
  agreed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index renewal_consents_business_idx on public.renewal_consents (business_id, agreed_at desc);
create unique index renewal_consents_checkout_idx on public.renewal_consents (checkout_id) where checkout_id is not null;

alter table public.renewal_consents enable row level security;

create policy renewal_consents_select on public.renewal_consents
  for select to authenticated
  using (public.can_manage_business(business_id) or (select public.is_admin()));

revoke all on public.renewal_consents from anon;
revoke insert, update, delete on public.renewal_consents from authenticated;
grant select on public.renewal_consents to authenticated;
grant all on public.renewal_consents to service_role;
