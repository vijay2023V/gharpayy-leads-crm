Gharpayy Leads CRM

A lightweight, production-style Lead Management CRM built for PG/rental property operators — track every enquiry from first click to booked tenant, with a live Kanban pipeline, smart lead scoring, and one-tap WhatsApp outreach.

Live app: https://gharpayy-crm-assignment.vercel.app

Features
Core CRM
Kanban Pipeline — move leads through New → Contacted → Visit Scheduled → Booked → Lost. Every status change writes straight to the database and syncs in real time across every open tab/device.
Search & Multi-Filter — instantly find leads by name or phone, and narrow the pipeline by status or preferred location.
Interaction Notes & Call Logs — every lead has a timestamped activity thread, so nothing said on a call or visit gets lost.
Growth Features
Automated Lead Intent Scoring — leads are automatically tagged HOT / WARM / COLD based on budget, move-in urgency, visit status, and recency of activity — so operators always know who to call first.
One-Click WhatsApp Outreach — every lead card has a pre-filled WhatsApp message ready to send in one tap, cutting response time from minutes to seconds.
Tech Stack
Layer	Technology
Frontend	React + TypeScript + Vite
Backend / Database	Supabase (Postgres)
Realtime sync	Supabase Realtime
Hosting	Vercel
Styling	Custom CSS (design tokens, no framework)
Architecture
┌─────────────┐      ┌──────────────────┐      ┌────────────────┐
│   Browser   │◄────►│  React + Vite app │◄────►│ Supabase (DB)  │
│  (any user) │      │   (Vercel-hosted) │      │  Postgres +    │
└─────────────┘      └──────────────────┘      │  Realtime +    │
                                                 │  Row-Level Sec │
                                                 └────────────────┘

Leads live in a single Postgres table (leads) with a jsonb notes column for activity history. Row Level Security is enabled so auth can be layered in later without a schema change. Realtime subscriptions push any change (status update, new note, new lead) to every connected client instantly.

Getting Started
1. Clone and install
bash
git clone https://github.com/vijay2023V/gharpayy-leads-crm.git
cd gharpayy-leads-crm
npm install
2. Set up the database
Create a project at supabase.com
Open SQL Editor → paste in supabase/schema.sql → Run
Copy your Project URL and anon public key from Project Settings → API
3. Configure environment variables
bash
cp .env.example .env
env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
4. Run it
bash
npm run dev

Open the printed localhost URL.

Deployment

Deployed on Vercel with automatic redeploys on every push to main:

Import the repo at vercel.com → framework preset Vite
Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY under Environment Variables
Deploy
Security Notes

The current schema uses permissive Row Level Security policies so the MVP works out of the box with just the public anon key. Before real customer data goes live long-term, the next step is adding Supabase Auth and scoping RLS policies to authenticated operators (and optionally per-agent row ownership).

Roadmap
 Operator authentication + role-based access
 Agent assignment & ownership per lead
 Tunable intent-scoring weights based on real conversion data
 Notification/reminder system for stale leads
 Analytics dashboard (conversion funnel by area/source)
