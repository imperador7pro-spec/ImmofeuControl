-- SpeedJob's schema + RLS + realtime + triggers
-- Apply via Supabase CLI: supabase db push
-- Or run in the Supabase SQL editor.

-- ============================================================================
-- Extensions
-- ============================================================================
create extension if not exists "pgcrypto";

-- ============================================================================
-- Tables
-- ============================================================================
create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade unique not null,
  phone text unique not null,
  name text not null,
  photo_url text,
  skills text[] not null default '{}',
  location text not null,
  online boolean not null default false,
  rating float not null default 0,
  rating_count int not null default 0,
  fcm_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade unique not null,
  company_name text not null,
  phone text not null,
  subscription_tier text not null default 'starter' check (subscription_tier in ('starter','pro','business')),
  posts_remaining int not null default 1,
  stripe_customer_id text,
  stripe_subscription_id text,
  next_billing_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employers (id) on delete cascade,
  skill text not null,
  location text not null,
  tarif int not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  details text,
  status text not null default 'open' check (status in ('open','filled','expired')),
  filled_by uuid references public.candidates (id) on delete set null,
  published_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_skill_location_idx on public.jobs (skill, location);
create index if not exists jobs_employer_idx on public.jobs (employer_id);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  status text not null default 'accepted' check (status in ('accepted','confirmed','rejected','completed')),
  accepted_at timestamptz not null default now(),
  confirmed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_id, candidate_id)
);
create index if not exists applications_job_idx on public.applications (job_id);
create index if not exists applications_candidate_idx on public.applications (candidate_id);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  from_user_id uuid not null references auth.users (id) on delete cascade,
  to_user_id uuid not null references auth.users (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (job_id, from_user_id, to_user_id)
);

-- ============================================================================
-- Triggers: maintain candidate rating aggregate
-- ============================================================================
create or replace function public.refresh_candidate_rating()
returns trigger
language plpgsql
as $$
declare
  c_id uuid;
begin
  select c.id into c_id
    from public.candidates c
   where c.user_id = new.to_user_id;
  if c_id is not null then
    update public.candidates
       set rating = coalesce((select avg(rating)::float from public.reviews where to_user_id = new.to_user_id), 0),
           rating_count = (select count(*) from public.reviews where to_user_id = new.to_user_id),
           updated_at = now()
     where id = c_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_refresh_rating on public.reviews;
create trigger trg_refresh_rating
after insert on public.reviews
for each row execute function public.refresh_candidate_rating();

-- ============================================================================
-- Realtime
-- ============================================================================
do $$ begin
  perform 1 from pg_publication where pubname = 'supabase_realtime';
  if found then
    alter publication supabase_realtime add table public.jobs;
    alter publication supabase_realtime add table public.applications;
  end if;
exception when duplicate_object then null;
end $$;

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.candidates enable row level security;
alter table public.employers enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;
alter table public.reviews enable row level security;

-- Candidates
drop policy if exists "candidates_select_self_or_employer" on public.candidates;
create policy "candidates_select_self_or_employer" on public.candidates
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.employers e where e.user_id = auth.uid())
  );

drop policy if exists "candidates_insert_self" on public.candidates;
create policy "candidates_insert_self" on public.candidates
  for insert with check (auth.uid() = user_id);

drop policy if exists "candidates_update_self" on public.candidates;
create policy "candidates_update_self" on public.candidates
  for update using (auth.uid() = user_id);

-- Employers
drop policy if exists "employers_select_self" on public.employers;
create policy "employers_select_self" on public.employers
  for select using (auth.uid() = user_id);

drop policy if exists "employers_insert_self" on public.employers;
create policy "employers_insert_self" on public.employers
  for insert with check (auth.uid() = user_id);

drop policy if exists "employers_update_self" on public.employers;
create policy "employers_update_self" on public.employers
  for update using (auth.uid() = user_id);

-- Jobs: employers can manage their own; candidates can see open jobs.
drop policy if exists "jobs_select_open_or_owner" on public.jobs;
create policy "jobs_select_open_or_owner" on public.jobs
  for select using (
    status = 'open'
    or exists (select 1 from public.employers e where e.id = employer_id and e.user_id = auth.uid())
    or exists (select 1 from public.applications a
                join public.candidates c on c.id = a.candidate_id
               where a.job_id = jobs.id and c.user_id = auth.uid())
  );

drop policy if exists "jobs_insert_owner" on public.jobs;
create policy "jobs_insert_owner" on public.jobs
  for insert with check (
    exists (select 1 from public.employers e where e.id = employer_id and e.user_id = auth.uid())
  );

drop policy if exists "jobs_update_owner" on public.jobs;
create policy "jobs_update_owner" on public.jobs
  for update using (
    exists (select 1 from public.employers e where e.id = employer_id and e.user_id = auth.uid())
  );

-- Applications
drop policy if exists "applications_select_party" on public.applications;
create policy "applications_select_party" on public.applications
  for select using (
    exists (select 1 from public.candidates c where c.id = candidate_id and c.user_id = auth.uid())
    or exists (
      select 1 from public.jobs j
        join public.employers e on e.id = j.employer_id
       where j.id = job_id and e.user_id = auth.uid()
    )
  );

drop policy if exists "applications_insert_candidate" on public.applications;
create policy "applications_insert_candidate" on public.applications
  for insert with check (
    exists (select 1 from public.candidates c where c.id = candidate_id and c.user_id = auth.uid())
  );

drop policy if exists "applications_update_party" on public.applications;
create policy "applications_update_party" on public.applications
  for update using (
    exists (
      select 1 from public.jobs j
        join public.employers e on e.id = j.employer_id
       where j.id = job_id and e.user_id = auth.uid()
    )
    or exists (
      select 1 from public.candidates c where c.id = candidate_id and c.user_id = auth.uid()
    )
  );

-- Reviews
drop policy if exists "reviews_select_party" on public.reviews;
create policy "reviews_select_party" on public.reviews
  for select using (
    auth.uid() = from_user_id or auth.uid() = to_user_id
  );

drop policy if exists "reviews_insert_self" on public.reviews;
create policy "reviews_insert_self" on public.reviews
  for insert with check (auth.uid() = from_user_id);

-- ============================================================================
-- Storage bucket for candidate photos
-- ============================================================================
insert into storage.buckets (id, name, public)
  values ('candidate-photos', 'candidate-photos', true)
  on conflict (id) do nothing;

drop policy if exists "candidate_photos_read" on storage.objects;
create policy "candidate_photos_read" on storage.objects
  for select using (bucket_id = 'candidate-photos');

drop policy if exists "candidate_photos_write" on storage.objects;
create policy "candidate_photos_write" on storage.objects
  for insert with check (
    bucket_id = 'candidate-photos' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "candidate_photos_update" on storage.objects;
create policy "candidate_photos_update" on storage.objects
  for update using (
    bucket_id = 'candidate-photos' and auth.uid()::text = (storage.foldername(name))[1]
  );
