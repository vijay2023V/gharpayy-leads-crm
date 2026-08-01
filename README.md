# Gharpayy Leads CRM — MVP

A lead-management CRM for PG/rental operators: Kanban pipeline, search + filters,
timestamped notes, one-click WhatsApp outreach, and an automated HOT/WARM/COLD
intent score. React + Vite + TypeScript on the frontend, Supabase (Postgres) as
the backend.

I built and type-checked this locally (`tsc --noEmit` and `npm run build` both
pass), but **I cannot create your Supabase project or deploy to Vercel/Netlify
myself** — those steps need your accounts and credentials. Everything below is
copy-pasteable; it should take close to the 15/45/40/20-minute blueprint you laid out.

## 1. Backend — Supabase (~15 min)

1. Go to [supabase.com](https://supabase.com) → New project.
2. Once it's up, open **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](./supabase/schema.sql), and run it. This creates the
   `leads` table (with a `status` check constraint, notes as `jsonb`, an
   auto-updating `last_activity_at` trigger for the intent score, RLS policies,
   realtime enabled, and 5 seed rows).
3. Go to **Project Settings → API** and copy the **Project URL** and
   **anon public key**.

## 2. Frontend — run it locally

```bash
cd gharpayy-crm
npm install
cp .env.example .env
# paste your Supabase URL + anon key into .env
npm run dev
```

Open the printed localhost URL. If `.env` isn't set, the app still renders with
a clear "Supabase isn't connected yet" banner instead of a blank screen.

## 3. What's implemented

**Core (from the blueprint's step 2):**
- **Kanban pipeline** — `New → Contacted → Visit Scheduled → Booked → Lost`,
  click any status chip in a lead's detail view to move it; writes straight to
  Supabase and re-syncs via realtime so every open tab stays in sync.
- **Search & multi-filter** — top search by name/phone, plus status and
  preferred-location dropdown filters, all client-side over the live dataset.
- **Notes & call logs** — every lead has a notes thread (`jsonb` array),
  each entry timestamped, rendered newest-first in the detail modal.

**Growth features (step 3):**
- **One-click WhatsApp** — every card and the detail modal have a
  `wa.me/<phone>?text=<prefilled message>` link using the exact template you
  specified (`src/lib/scoring.ts` → `whatsappMessage`).
- **HOT 🔥 / WARM ⚡ / COLD ❄️ intent score** — computed live in
  `src/lib/scoring.ts` from budget, move-in date, visit status, and days since
  last activity, exactly per your rules. It's derived on the client from live
  data rather than stored, so it's always current — no separate write path
  that can drift out of sync.

## 4. Deploy (~20 min) — steps that need your accounts

I can't push to your GitHub or click through Vercel/Netlify's UI for you, but here's
the exact path:

1. `git init && git add -A && git commit -m "Gharpayy leads CRM MVP"` in this
   folder, then push it to a new GitHub repo (or add it as a directory in your
   existing `techblr-gharpayy` repo if you'd rather keep one codebase).
2. Go to [vercel.com](https://vercel.com) (or Netlify) → **New Project** →
   import that repo. Framework preset: **Vite**.
3. In the project's **Environment Variables** settings, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. Vercel/Netlify give you a live `https://...vercel.app` (or
   `.netlify.app`) URL immediately, plus a preview URL on every future push.
5. Open that URL on your phone to confirm it loads and the WhatsApp buttons
   deep-link correctly on mobile.

## 5. Security note (read before real leads touch this)

`supabase/schema.sql` uses permissive RLS policies (`using (true)`) so the MVP
works immediately with just the anon key — anyone with the anon key can read
and write all leads. That's fine for a demo/internal MVP behind a private URL,
but before real customer data goes in, add Supabase Auth and scope the
policies to authenticated operators (e.g. `using (auth.role() = 'authenticated')`,
or per-agent row ownership if you want to restrict who sees what).

## 6. Where this can grow next

- Swap the intent-score thresholds for something tuned on real conversion data.
- Add an `agents` table + assignment, mirroring the `assignedAgentName` field
  already present in your existing `referral-app` mock schema.
- Pull this straight into `techblr-gharpayy`'s existing TanStack Start /
  Cloudflare Worker setup instead of a separate Vite app, and point
  `referral-app/api/index.ts`'s `useAdminGetLeads` at these same Supabase
  tables so the existing UI (admin/leads.tsx, LeadModal.tsx) works unmodified.
