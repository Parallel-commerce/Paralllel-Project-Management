# Parallel — Project Task Tracker

Simple multi-project task tracking for internal teams and clients.

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind
- **Supabase** (Auth email OTP, Postgres, Row Level Security)
- Deploy on **Vercel** (recommended)

## Features

- Email OTP sign-in (6–8 digit code)
- Projects with roles: **admin**, **member** (internal), **client**
- Platform admins with a **/users** management page
- Invite people by email (sends a one-time sign-in code)
- Lists: **public** (all project members) or **private** (creator + project admins)
- Tasks with title, description, due date, status, creator, and assignee
- Kanban-style board by status: To do / In progress / Requiring feedback / Done
- Task comments
- In-app notifications (assignment, feedback requested, comments, invites)
- Optional Resend emails for those events (`RESEND_API_KEY`)
- Project activity feed
- Kanban drag-and-drop, board filters/search
- **My work** views: assigned, overdue, due this week
- List settings (rename, visibility, delete)
- First-run empty states / onboarding cues

## Setup

### 1. Install

```bash
npm install
```

### 2. Environment

Copy `.env.example` to `.env.local` and set:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-or-publishable-key>
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Optional transactional email (assignments, comments, feedback):
# RESEND_API_KEY=re_xxx
# RESEND_FROM_EMAIL=Parallel Commerce <login@parallelcommerce.co.uk>
```

A Supabase project named `parallel-project-management` was provisioned for this app. Schema lives in [`supabase/migrations`](supabase/migrations).

### 3. Auth redirect URLs (Supabase Dashboard)

In **Authentication → URL Configuration**:

- Site URL: `https://clients.parallelcommerce.co.uk` (production) or `http://localhost:3000` (local)
- Redirect URLs allow list:
  - `http://localhost:3000/**`
  - `https://clients.parallelcommerce.co.uk/**`

Enable **Email** provider. Sign-in is code-only; do not include a link in the
email templates.

### 3b. Email OTP template (required for code sign-in)

In **Authentication → Email Templates**, paste this into **Magic link**,
**Reset password**, and **Confirm signup**. Code-only — no sign-in link:

```html
<h2>Sign in to Parallel</h2>
<p>Your one-time code is:</p>
<p style="font-size:24px;letter-spacing:4px;"><strong>{{ .Token }}</strong></p>
<p>Enter this code on the Parallel sign-in page. It expires shortly and can only be used once.</p>
```

Subject: `Your Parallel sign-in code: {{ .Token }}`

Do **not** include `{{ .ConfirmationURL }}` or any `/auth/confirm` link. Those
URLs break across devices and get flagged as spam.

If you still receive a **“Confirm your email address”** email (no code), that is
the Confirm signup template — paste the same body there, or turn **Confirm
email** off under Authentication → Providers → Email.

Parallel auto-confirms new auth users so OTP emails use the Magic Link template.

Auth emails are sent by **Supabase Auth → SMTP** (e.g. Resend SMTP). That is
separate from `RESEND_API_KEY` in the app.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with your email, create a project, invite teammates/clients, and add lists/tasks.

### 5. Deploy (Vercel)

1. Push the repo and import it in Vercel
2. Set the same `NEXT_PUBLIC_SUPABASE_*` env vars
3. Add the production callback URL in Supabase Auth settings

## Roles quick reference

| Role | Lists | Tasks | People |
|------|-------|-------|--------|
| Admin | All (incl. private) | Full | Invite / remove / change roles |
| Member | Create public/private; see public + own private | Create/edit on accessible lists | View |
| Client | Public lists only | Create/edit on public lists | View |

**Platform admins** (flag on `profiles.is_platform_admin`) can open **/users** to manage every account, project memberships/roles, and other platform admins.

## Scripts

- `npm run dev` — local development
- `npm run build` — production build
- `npm run start` — run production build
- `npm run lint` — ESLint
