-- Klander database schema (Supabase / Postgres 17)
-- Consolidated from the migrations applied to project `klander` (davompbqkwiiiecfuthx), October 2026.
-- Every table has Row Level Security (RLS) switched on.

create extension if not exists citext with schema extensions;
create extension if not exists pg_net;
create extension if not exists pg_cron;

---------------------------------------------------------------------------
-- PROFILES: one row per user, created automatically on sign-up
---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username extensions.citext unique check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) <= 50),
  avatar_url text,
  colour text not null default '#2b4cff' check (colour ~ '^#[0-9a-fA-F]{6}$'),
  timezone text not null default 'Europe/London',
  theme text not null default 'system' check (theme in ('system','light','dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "Signed-in users can view profiles" on public.profiles for select to authenticated using (true);
create policy "Users update own profile" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

---------------------------------------------------------------------------
-- CATEGORIES: Work, Uni, Sport, Social, Personal (editable)
---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  colour text not null check (colour ~ '^#[0-9a-fA-F]{6}$'),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.categories enable row level security;
create policy "Users manage own categories" on public.categories for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

---------------------------------------------------------------------------
-- CALENDAR SOURCES: linked .ics / webcal calendars (uni timetable etc.)
---------------------------------------------------------------------------
create table public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  url text not null check (url ~* '^(https?|webcal)://'),
  category_id uuid references public.categories(id) on delete set null,
  visibility text not null default 'busy' check (visibility in ('friends','busy','private')),
  last_synced_at timestamptz,
  last_error text,
  event_count int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.calendar_sources enable row level security;
create policy "Users manage own calendar sources" on public.calendar_sources for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

---------------------------------------------------------------------------
-- EVENTS
---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  notes text check (char_length(notes) <= 2000),
  location text check (char_length(location) <= 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  category_id uuid references public.categories(id) on delete set null,
  visibility text not null default 'friends' check (visibility in ('friends','busy','private')),
  rrule text,                                   -- repeat rule, e.g. FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR
  exdates timestamptz[] not null default '{}',  -- skipped occurrences
  source text not null default 'manual' check (source in ('manual','text','photo','import')),
  source_id uuid references public.calendar_sources(id) on delete cascade,
  external_uid text,                            -- UID from the imported .ics
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at),
  constraint events_source_uid_key unique (source_id, external_uid)
);
create index events_owner_start_idx on public.events(owner_id, starts_at);
alter table public.events enable row level security;
create policy "Users manage own events" on public.events for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

---------------------------------------------------------------------------
-- FRIENDS
---------------------------------------------------------------------------
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references public.profiles(id) on delete cascade,
  addressee uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
create unique index friendships_pair_idx on public.friendships (least(requester, addressee), greatest(requester, addressee));
alter table public.friendships enable row level security;
create policy "See own friendships" on public.friendships for select to authenticated using ((select auth.uid()) in (requester, addressee));
create policy "Accept requests sent to you" on public.friendships for update to authenticated
  using ((select auth.uid()) = addressee) with check ((select auth.uid()) = addressee and status = 'accepted');
create policy "Remove own friendships" on public.friendships for delete to authenticated using ((select auth.uid()) in (requester, addressee));
revoke insert, update on public.friendships from authenticated, anon;
grant update (status) on public.friendships to authenticated;   -- only the status column

create table public.invite_codes (
  code text primary key default encode(extensions.gen_random_bytes(9), 'hex'),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.invite_codes enable row level security;
create policy "See own invite code" on public.invite_codes for select to authenticated using ((select auth.uid()) = user_id);

create table public.feed_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  created_at timestamptz not null default now()
);
alter table public.feed_tokens enable row level security;
create policy "See own feed token" on public.feed_tokens for select to authenticated using ((select auth.uid()) = user_id);

create table public.activity (
  id bigint generated always as identity primary key,
  actor uuid not null references public.profiles(id) on delete cascade,
  verb text not null check (verb in ('added','changed','removed','synced')),
  title text,
  starts_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.activity enable row level security;
create policy "Friends see activity" on public.activity for select to authenticated using (public.is_friend(actor));

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('text','photo')),
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.ai_usage enable row level security;
create policy "See own AI usage" on public.ai_usage for select to authenticated using ((select auth.uid()) = user_id);

---------------------------------------------------------------------------
-- FUNCTIONS (security definer = run with owner rights, each checks auth.uid())
---------------------------------------------------------------------------
create function public.is_friend(other uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships f where f.status = 'accepted'
    and ((f.requester = (select auth.uid()) and f.addressee = other) or (f.addressee = (select auth.uid()) and f.requester = other)));
$$;

-- Friends' events with privacy applied: private never returned, busy shows only "Busy", notes never shared
create function public.friend_events()
returns table (id uuid, owner_id uuid, title text, location text, starts_at timestamptz, ends_at timestamptz,
               all_day boolean, visibility text, rrule text, exdates timestamptz[])
language sql stable security definer set search_path = '' as $$
  select e.id, e.owner_id,
         case when e.visibility = 'busy' then 'Busy' else e.title end,
         case when e.visibility = 'busy' then null else e.location end,
         e.starts_at, e.ends_at, e.all_day, e.visibility, e.rrule, e.exdates
  from public.events e
  join public.friendships f on f.status = 'accepted'
   and ((f.requester = (select auth.uid()) and f.addressee = e.owner_id)
     or (f.addressee = (select auth.uid()) and f.requester = e.owner_id))
  where e.visibility <> 'private';
$$;

-- Also defined (see repo migrations for full bodies):
--   send_friend_request(username)  -> 'sent' | 'accepted' | 'already_sent' | 'already_friends' | 'not_found' | 'self'
--   my_invite_code()               -> creates/returns your invite code
--   accept_invite(code)            -> instantly friends with the code's owner
--   my_feed_token(reset bool)      -> creates/returns (or resets) your subscribe link token
--   handle_new_user()  trigger on auth.users: creates profile + 5 default categories
--   log_event_activity() trigger on events: writes privacy-safe rows to activity (skips imported events)
--   touch_updated_at() trigger on profiles/events
--   check_cron_secret(s) (service_role only) + private.app_secrets for the scheduled sync

---------------------------------------------------------------------------
-- STORAGE + REALTIME + SCHEDULE
---------------------------------------------------------------------------
-- avatars bucket: public read; users can only write inside a folder named after their own id
-- alter publication supabase_realtime add table public.activity, public.friendships;
-- select cron.schedule('klander-calendar-refresh', '7 */3 * * *', 'select private.run_calendar_refresh()');
