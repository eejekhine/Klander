# Klander

A shared calendar for friend groups. You get your own account, can see your friends' weeks, and (coming soon) can turn a photo or a sentence into an event. Klander is a Progressive Web App: it installs to the iPhone home screen and opens full-screen like a native app.

Built with React + Vite, Supabase (Postgres, Auth, Storage, Row Level Security) and vite-plugin-pwa.

## What works (v0.1, roadmap phases 1–2)

- Email/password accounts, password reset, Google sign-in (once you switch it on)
- Profile: username, display name, colour, photo, light/dark theme
- Day, week, month and list views with a "now" line
- Create, edit and delete events: all-day, location, notes, category, visibility
- Repeating events (daily, weekdays, weekly, fortnightly, monthly, yearly, with an optional end date). Overnight shifts work and stay at the right time across clock changes.
- Delete one occurrence of a repeating event, or the whole series
- Categories you can rename, recolour, add and delete
- Works offline with your last-loaded calendar; installable as an app

## Run it locally

You need Node.js 20+ (`node -v` to check; get it from nodejs.org if missing).

```bash
cd ~/Sites/klander
npm install
npm run dev
```

Then open the "Local" address it prints (usually http://localhost:5173).
To try it on your iPhone on the same Wi-Fi, open the "Network" address instead.

## Supabase project

- Project: `klander` (London, eu-west-2)
- Tables: `profiles`, `categories`, `events`, plus the `avatars` storage bucket
- Every table has Row Level Security: you can only read and write your own rows.
- `.env` holds the project URL and the publishable key. Both are safe to ship in a web app. Never put the `service_role` key in this project.

## Deploy (free) with Vercel

1. Push this folder to a new GitHub repo.
2. On vercel.com, choose **Add New → Project**, pick the repo, and keep the Vite defaults.
3. Add the two `VITE_SUPABASE_*` values from `.env` as Environment Variables.
4. Deploy. You'll get a `https://klander-xxxx.vercel.app` address.
5. In Supabase go to **Authentication → URL Configuration**. Set **Site URL** to that address and add it, plus `http://localhost:5173`, to **Redirect URLs**.

## Install on iPhone

Open the deployed address in Safari, tap **Share**, then **Add to Home Screen**.

## Next up (roadmap phase 3)

Import & sync: paste calendar links (uni timetable), Google and Outlook two-way sync, and a Klander feed out.
