-- Privacy: profiles.phone was never collected or shown, and is empty for every account.
alter table public.profiles drop column if exists phone;
