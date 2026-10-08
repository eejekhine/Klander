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

-- ============================================================
-- Phase 6: themes & birthdays
-- ============================================================
-- Theme settings (cosmetic, fine for signed-in users to read so friends can "try your theme")
alter table public.profiles add column theme_config jsonb not null default '{}'::jsonb;
alter table public.profiles add constraint profiles_theme_config_size check (pg_column_size(theme_config) < 4000);

-- Birthdays live in their own owner-only table (profiles are readable by every signed-in user)
create table public.birthdays (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  birthday date not null check (birthday > date '1900-01-01' and birthday <= current_date),
  show_year boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.birthdays enable row level security;
create policy "Users manage own birthday" on public.birthdays for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Friends' birthdays: day + month always, year only if that friend chose to show it
create or replace function public.friend_birthdays()
returns table (user_id uuid, month int, day int, year int)
language sql stable security definer set search_path = '' as $$
  select b.user_id, extract(month from b.birthday)::int, extract(day from b.birthday)::int,
         case when b.show_year then extract(year from b.birthday)::int end
  from public.birthdays b
  where public.is_friend(b.user_id);
$$;
revoke execute on function public.friend_birthdays() from public, anon;
grant execute on function public.friend_birthdays() to authenticated;

-- Smart add gains a "theme" mode
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('text','photo','theme'));

-- ============================================================
-- Phase 7: plans, invites, free time, "up for something"
-- ============================================================
alter table public.events add column hidden_from uuid[] not null default '{}';  -- surprise plans

-- friend_events() now also skips events hidden from the caller:
--   ... where e.visibility <> 'private' and not ((select auth.uid()) = any(e.hidden_from));
-- log_event_activity() now leaves the title out for busy-only events AND for surprise events (hidden_from not empty).

-- Free/busy for the free-time finder: times only, never titles. Private events count as busy too.
create or replace function public.friend_busy()
returns table (owner_id uuid, starts_at timestamptz, ends_at timestamptz, all_day boolean, rrule text, exdates timestamptz[])
language sql stable security definer set search_path = '' as $$
  select e.owner_id, e.starts_at, e.ends_at, e.all_day, e.rrule, e.exdates
  from public.events e
  where public.is_friend(e.owner_id)
    and (e.rrule is not null or e.ends_at > now() - interval '1 day');
$$;
revoke execute on function public.friend_busy() from public, anon;
grant execute on function public.friend_busy() to authenticated;

create table public.event_invites (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited','going','maybe','declined')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.event_invites enable row level security;
create policy "Owner and guest see invite" on public.event_invites for select to authenticated
  using (user_id = (select auth.uid())
     or exists (select 1 from public.events e where e.id = event_id and e.owner_id = (select auth.uid())));
create policy "Owner invites friends" on public.event_invites for insert to authenticated
  with check (status = 'invited' and public.is_friend(user_id)
     and exists (select 1 from public.events e where e.id = event_id and e.owner_id = (select auth.uid())
                 and not (user_id = any(e.hidden_from))));
create policy "Owner removes invite" on public.event_invites for delete to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = (select auth.uid())));
create policy "Guest answers" on public.event_invites for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.event_invites from authenticated, anon;
grant update (status, responded_at) on public.event_invites to authenticated;   -- guests can only change their answer

create or replace function public.my_invites()
returns table (id uuid, owner_id uuid, title text, location text, notes text, starts_at timestamptz, ends_at timestamptz,
               all_day boolean, rrule text, exdates timestamptz[], my_status text, guests jsonb)
language sql stable security definer set search_path = '' as $$
  select e.id, e.owner_id, e.title, e.location, e.notes, e.starts_at, e.ends_at, e.all_day, e.rrule, e.exdates, i.status,
         (select coalesce(jsonb_agg(jsonb_build_object('user_id', g.user_id, 'status', g.status)), '[]'::jsonb)
            from public.event_invites g where g.event_id = e.id)
  from public.event_invites i
  join public.events e on e.id = i.event_id
  where i.user_id = (select auth.uid())
    and public.is_friend(e.owner_id)
    and (e.rrule is not null or e.ends_at > now() - interval '7 days');
$$;
revoke execute on function public.my_invites() from public, anon;
grant execute on function public.my_invites() to authenticated;

create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 1 and 140),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '7 days')
);
alter table public.broadcasts enable row level security;
create policy "Own or friends' broadcasts" on public.broadcasts for select to authenticated
  using (user_id = (select auth.uid()) or public.is_friend(user_id));
create policy "Post own broadcast" on public.broadcasts for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Edit own broadcast" on public.broadcasts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Delete own broadcast" on public.broadcasts for delete to authenticated using (user_id = (select auth.uid()));

create table public.broadcast_replies (
  broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  reply text not null default 'in' check (reply in ('in','maybe')),
  created_at timestamptz not null default now(),
  primary key (broadcast_id, user_id)
);
alter table public.broadcast_replies enable row level security;
create policy "See replies" on public.broadcast_replies for select to authenticated
  using (user_id = (select auth.uid()) or public.is_friend(user_id)
      or exists (select 1 from public.broadcasts b where b.id = broadcast_id and b.user_id = (select auth.uid())));
create policy "Reply to friends' broadcasts" on public.broadcast_replies for insert to authenticated
  with check (user_id = (select auth.uid())
     and exists (select 1 from public.broadcasts b where b.id = broadcast_id and public.is_friend(b.user_id) and b.ends_at > now()));
create policy "Change own reply" on public.broadcast_replies for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Remove own reply" on public.broadcast_replies for delete to authenticated using (user_id = (select auth.uid()));

alter table public.profiles add column status_text text check (char_length(status_text) <= 60);
alter table public.profiles add column status_until timestamptz;
-- alter publication supabase_realtime add table public.event_invites, public.broadcasts, public.broadcast_replies;

-- ============================================================
-- Phase 10 (part 1): push notifications
-- ============================================================
-- app_secret(n) / set_app_secret(n, v): service_role only. The push function creates its VAPID key pair
-- on first run and keeps it in private.app_secrets (vapid_public, vapid_private), so the private key never
-- leaves the server. vapid_public_key() returns the public half to signed-in users.

create table public.push_subscriptions (           -- one row per phone/browser that allowed notifications
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%'),
  p256dh text not null, auth text not null, device text,
  created_at timestamptz not null default now(), last_ok_at timestamptz
);                                                  -- RLS: owner only

create table public.notify_settings (               -- RLS: owner only
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  friend_events boolean not null default true, plans boolean not null default true,
  broadcasts boolean not null default true, requests boolean not null default true,
  reminders boolean not null default true,
  default_reminder int,                             -- minutes before; null = off
  quiet_start time, quiet_end time,                 -- friend alerts held during these hours
  muted uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.events add column remind_minutes int;  -- null = use default, -1 = none

create table public.notifications (                 -- inbox + push queue
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('friend_event','invite','rsvp','broadcast','broadcast_reply','request','accepted','reminder','test')),
  actor uuid references public.profiles(id) on delete cascade,
  title text not null, body text, url text, ref text,
  count int not null default 1,
  created_at timestamptz not null default now(),
  send_after timestamptz not null default now(),    -- friend_event waits 3 min so changes are batched
  sent_at timestamptz, pushed boolean, read_at timestamptz
);
-- RLS: owner can read and delete; can only UPDATE read_at (column grant). Rows are only written by triggers.
-- unique (user_id, ref) where kind = 'reminder'  -> each reminder fires once

-- Triggers (SECURITY DEFINER, in schema private), all respecting notify_settings + muted friends:
--   notify_on_activity        friend added/changed an event -> each friend (batched per friend for 3 minutes)
--   notify_on_invite          invite -> guest; Going/Maybe/Can't -> host
--   notify_on_broadcast       "up for something" -> each friend
--   notify_on_broadcast_reply "I'm in" -> poster
--   notify_on_friendship      request -> addressee; accepted -> requester
-- cron 'klander-push' every minute: private.run_push() -> Edge Function push
--   makes due reminders (rrule-aware, time-zone safe), sends Web Push with VAPID, skips quiet hours,
--   drops dead subscriptions (404/410), deletes notifications older than 30 days.

-- ============================================================
-- Phase 7 (part 2): close friends, groups, countdowns, time polls
-- ============================================================
create table public.close_friends (                 -- your private list; RLS owner only, friend must be a friend
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);
-- is_close_to_me(owner) -> am I on their list?  events.visibility now allows 'close':
-- friend_events() shows close events in full to close friends and as 'Busy' to everyone else;
-- log_event_activity() never puts a close event's title in the shared activity feed.

create table public.friend_groups (                 -- your own groups of friends; RLS owner only
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null, members uuid[] not null default '{}', sort int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.events add column countdown boolean not null default false;

create table public.polls (id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null, location text, note text, closes_at timestamptz,
  decided_option uuid, event_id uuid references public.events(id) on delete set null,
  created_at timestamptz not null default now());
create table public.poll_options (id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null, check (ends_at > starts_at));
create table public.poll_invitees (poll_id uuid not null references public.polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, primary key (poll_id, user_id));
create table public.poll_votes (option_id uuid not null references public.poll_options(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  vote text not null check (vote in ('yes','maybe','no')), updated_at timestamptz not null default now(),
  primary key (option_id, user_id));
-- RLS: can_see_poll(p) = owner or invitee. Only the owner adds options/invitees (friends only).
-- Invitees vote only for themselves, and only until the owner picks a time (decided_option).
-- Triggers: notify_on_poll_invite -> invitee; notify_on_poll_vote -> owner (one per voter, held 2 min).

-- ============================================================
-- Phase 8: chat
-- ============================================================
-- conversations (kind dm | group | event; dm_key "a:b" makes each pair have one DM; event_id makes one chat per plan)
-- conversation_members (last_read_at for unread counts + "Seen", muted)
-- messages (text | image | event card | system; reply_to; soft delete via deleted_at; edits only to body)
-- message_reactions (8 fixed emoji), blocks (owner only), reports (insert only, read in the dashboard)
-- Storage bucket 'chat' (private, 5 MB, images only): path <conversation_id>/<uuid>.jpg, readable/uploadable by members only.
-- RPCs (SECURITY DEFINER): start_dm(other) friends only, not blocked; create_group(title, members) friends only, max 30;
--   event_thread(event) host + guests only; my_conversations() list with last message + unread count.
-- RLS: is_member(conversation) gates everything. You can only send as yourself, never 'system' messages,
--   and not into a DM with someone who blocked you (or you blocked). Anyone in a group can add their own friends.
-- Trigger notify_on_message: one notification per chat per person, updated with a running count while unsent;
--   respects muted chats, the 'chat' setting, muted friends and blocks.

-- Chat photo cleanup (daily, cron 'klander-cleanup' 03:17 UTC -> Edge Function cleanup):
-- messages.image_removed_at; chat_photos_to_remove(lim) + mark_photos_removed(ids) are service_role only.
-- Removes photos from deleted messages, photos older than 6 months, and uploads never sent (older than a day).

-- ============================================================
-- Phase 9: memories + My Week
-- ============================================================
-- event_photos (event_id, user_id, path '<event_id>/<uuid>.jpg', caption, taken_at); storage bucket 'memories' (private, 3 MB, jpeg/webp)
-- can_view_event(ev): host, invited (not declined), or a friend who can see the event's details (friends / close, not hidden_from)
-- can_add_event_photo(ev): host, or a guest who said Going/Maybe
-- can_view_photo(id): your own, or you can see the event, or it's in a friend's posted My Week you're allowed to see
-- week_recaps (user_id, week_start, slides jsonb, caption, visibility friends|close, posted_at) unique per user+week;
--   hidden slides are saved WITHOUT photo_id/path so nobody can load a photo you hid.
-- week_reactions (one emoji per person per week). Triggers: notify_on_week (friends), notify_on_week_reaction (owner).
-- cron 'klander-week-ready' Sundays 17:45 UTC: "Your week is ready" for anyone with photos or 3+ events that week.
-- memory_orphans(): cleanup removes memory files whose photo row/event was deleted.

-- ============================================================
-- Phase 10 (part 2): family link, shifts & sleep, morning brief
-- ============================================================
-- family_feed_tokens (user_id pk, token, active): my_family_token(reset), stop_family_link(), family_link_on().
--   The feed function serves these as: Friends events normally, Close/Busy-only as "Busy", Private never, no notes.
-- categories.is_shift + categories.default_reminder; profiles.sleep_hours (default 7).
--   A sleep block follows each shift; friend_busy_v2() also returns is_shift + sleep_hours so the finder respects friends' sleep.
-- notify_settings.morning_brief, brief_time, quiet_follow_sleep.
-- notifications.dedupe_key (unique) so reminders and briefs are only made once
--   (the earlier partial unique index couldn't be used by ON CONFLICT, so reminders were silently not being created).
