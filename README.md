# Klander

**A shared calendar for friend groups.** Everyone has their own account and calendar, can see their friends' weeks with privacy they control event by event, and can add plans by typing a sentence or taking a photo. Klander is a Progressive Web App: it installs to the iPhone Home Screen from Safari and opens full-screen like a native app, with no App Store and no cost.

**Live app:** [klander.vercel.app](https://klander.vercel.app) · **Full write-up:** [Project report (PDF)](docs/Klander_Project_Report.pdf) · [How Klander works (PDF)](docs/How_Klander_Works.pdf)

Built with React + Vite, Supabase (Postgres, Auth, Row Level Security, Realtime, Storage, Edge Functions, pg_cron), Google Gemini and Vercel. It runs entirely on free tiers (£0 a month for my friend group).

## Why it exists

Google and Apple Calendar can share calendars, but only one calendar and one person at a time, and nobody does it. Poll tools like When2meet start from scratch every time. Plans end up lost in group chats. Klander is a real personal calendar first, with friends layered on top: see everyone's week at a glance, find a time that works, and add plans from the messages, posters and screenshots they actually come from.

## What it does

**Your calendar**
- Day, week, month and list views with a "now" line; swipe between weeks
- Create, edit and delete events: all-day, location, notes, categories (renamable and recolourable) and a visibility setting per event
- Repeating events (daily, weekdays, weekly, fortnightly, monthly, yearly, with an end date). Overnight shifts stay at the right local time across clock changes.
- Delete one occurrence or the whole series; undo after deleting; clash warnings before saving
- Change an event by typing, e.g. "move gym to 7", with the change shown before it is applied

**Friends and privacy**
- Add friends by username or invite link, see their events in their colour, live
- Per-event privacy: **Friends** (full details), **Busy only**, or **Private**. Enforced by the database with Row Level Security, not just hidden in the interface.
- Close friends, friend groups, surprise plans, and an activity feed

**Plans**
- *Find a time*: pick friends and a length, and Klander suggests times when everyone (or everyone but one) is free, without revealing anyone's event details
- Invites with Going / Maybe / Can't RSVPs, time polls, countdowns, "Up for something?" posts, and catch-up nudges
- A People view showing everyone side by side for one day

**Smart add**
- Turn a typed sentence, a photo or a screenshot into events using Gemini. Nothing is saved until you review it.
- Tap a chat message such as "ball at 7 thursday" to make an event from it

**Import and sync**
- Import calendar links (.ics / webcal), such as a uni timetable. They refresh automatically.
- Publish your own calendar link that Apple, Google and Outlook can subscribe to, plus a family link that shows Close/Busy events as "Busy" and never includes Private ones

**Chat and memories**
- Direct messages, group chats and one chat per plan, with replies, reactions, photos, event cards and read receipts; mute, leave, block and report
- Photos on events, and **My Week**: a story built from your week's photos and plans that you can save as an image
- Chat photos are deleted after 6 months by a nightly cleanup job

**Notifications**
- Lock-screen push notifications (grouped, so five quick changes make one alert), an in-app inbox, quiet hours, per-type settings, muting a friend, reminders and an optional morning brief

**Shifts and sleep**
- Mark a category as shifts and Klander adds a sleep block after each one. The free-time finder treats sleep as busy, and notifications can wait until you're awake.

**Insights (private to you)**
- Hours by category, busiest day and week, streaks ("Sport, 6 weeks running"), who you made plans with, and **Klander Wrapped**, an end-of-term story

**Look and feel**
- Nine built-in themes, a custom theme builder, a theme made from a photo, and an AI "describe a vibe" theme. A contrast guard keeps text readable whatever colours a theme uses.
- Birthdays (age shown only if you allow it), UK bank holidays and a welcome tour with searchable Help & tips
- Installs to the Home Screen, with a step-by-step guide for iPhone, Android and desktop, and works offline (read-only) with your last-loaded calendar

## How it's built

```
React + Vite PWA  ->  Supabase (Postgres + Auth + Realtime + Storage)
                       |- Row Level Security on every table
                       |- Edge Functions: smart-add, import-ics, feed, push, cleanup
                       '- pg_cron: calendar refresh, push delivery, nightly cleanup
Gemini API (called from the smart-add function only)      Hosted on Vercel
```

- `src/` is the React app (`components/`, `views/`, and `lib/` for the logic: dates and repeating events, free-time finder, sleep, insights, themes and so on)
- `supabase/schema.sql` is the full consolidated database schema, including policies, functions and scheduled jobs
- `supabase/functions/` holds the Edge Functions
- `docs/` holds the project report and the How Klander works guide

## Security and privacy

- Every table has Row Level Security. Privacy levels are applied inside database functions, so a friend's "Busy" event never sends its title to your device, and Private events never leave the owner's account.
- `.env` holds only the project URL and the **publishable** key, which are safe to ship in a web app. The `service_role` key and the Gemini key exist only inside Edge Functions as server-side secrets and must never be added to the front end.
- Shared theme codes are sanitised (known keys and valid colours only, with a size limit).

## Testing

The project report records the tests in detail. In short: 67 recorded tests for phases 1–5, then for phases 6–11 34 live database privacy checks (run while impersonating different signed-in users), 269 automated logic checks and 12 interface journeys, all passing. The interface journeys ran against a simulated backend, so a full end-to-end suite against a test Supabase project is still to do. Testing on a real phone also found bugs that mocks missed, and they are written up in the report.

## Run it locally

You need Node.js 20+ (`node -v` to check; get it from nodejs.org if missing).

```bash
git clone https://github.com/eejekhine/Klander.git
cd Klander
cp .env.example .env     # then fill in your Supabase URL and publishable key
npm install
npm run dev
```

Open the "Local" address it prints (usually http://localhost:5173). To try it on your iPhone on the same Wi-Fi, open the "Network" address instead.

## Set up your own backend

1. Create a free Supabase project and run `supabase/schema.sql` in the SQL editor (it creates the tables, policies, functions, the `avatars` and photo buckets and the scheduled jobs). Several jobs are commented in the file and need a secret or your project URL filled in.
2. Deploy the functions in `supabase/functions/` with the Supabase CLI.
3. Set the function secrets: `GEMINI_API_KEY` (required for smart add), and optionally `GEMINI_MODEL` and `SMART_ADD_DAILY_LIMIT` (the live app limits each person to 30 smart-add requests a day). `SUPABASE_URL` and the service role key are supplied to Edge Functions by Supabase.
4. Put the project URL and publishable key in `.env`.

## Deploy (free) with Vercel

1. Push this folder to a GitHub repo.
2. On vercel.com choose **Add New → Project**, pick the repo and keep the Vite defaults.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as Environment Variables.
4. Deploy. You'll get a `https://your-project.vercel.app` address.
5. In Supabase go to **Authentication → URL Configuration**. Set **Site URL** to that address and add it, plus `http://localhost:5173`, to **Redirect URLs**.

## Install on iPhone

Open the deployed address in Safari, tap **Share**, then **Add to Home Screen**. Push notifications on iPhone only work once Klander is installed this way (iOS 16.4 or later). The app also has an in-app guide with pictures for iPhone, Android and computers.

## Status and roadmap

Eleven of twelve roadmap phases are built and live:

| Phase | What |
| --- | --- |
| 1–2 | Setup, accounts, your calendar, repeating events, offline and install |
| 3 | Calendar link import and sync, a published feed |
| 4 | Friends, privacy levels, live updates |
| 5 | Smart add from text or a photo |
| 6 | Themes and birthdays |
| 7 | Plans, RSVPs, polls and free-time finder |
| 8 | Chat |
| 9 | Photo memories and My Week |
| 10 | Notifications, shifts and sleep, family link, smarter editing |
| 11 | Insights, streaks and Wrapped |

**Next (phase 12, launch and portfolio):** privacy page, "download my data" and "delete my account" (UK GDPR), landing page, a demo mode with fake friends, an accessibility and speed pass, the paid Gemini tier, and a case study.
**Deferred:** travel time ("leave by 18:20"), a Training Hub link, My Week as video, offline editing.
**Skipped on purpose:** two-way Apple Calendar sync, because it would need an Apple app-specific password that can read every iCloud calendar. The family link covers the main need.

## Known limitations

- Offline mode is read-only
- Smart add currently uses Gemini's free tier, where Google may use inputs to improve its models, so I plan to move to the paid tier before strangers use it
- Supabase free projects pause after a week with no use
- iPhone notifications need the Home Screen app
- Chat and live updates have been tested with a small group, not at scale

## About

Klander is a solo portfolio project by Ethan Jekhine. The idea, requirements, product decisions, service setup, deployment and real-world testing are mine. I built it with Claude as an AI development assistant, which wrote most of the code while I directed each stage and checked and tested the result. The project report explains the decisions, the problems hit and how they were fixed.
