# Parallel — Project Task Tracker

Simple multi-project task tracking for internal teams and clients.

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind
- **Supabase** (Auth email OTP + magic links, Postgres, Row Level Security)
- Deploy on **Vercel** (recommended)

## Features

- Email OTP sign-in (6-digit code; magic link still included in the same email)
- Projects with roles: **admin**, **member** (internal), **client**
- Platform admins with a **/users** management page
- Invite people by email (sends a Supabase magic-link sign-in email)
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
# RESEND_FROM_EMAIL=Parallel <onboarding@resend.dev>
```

A Supabase project named `parallel-project-management` was provisioned for this app. Schema lives in [`supabase/migrations`](supabase/migrations).

### 3. Auth redirect URLs (Supabase Dashboard)

In **Authentication → URL Configuration**:

- Site URL: `https://clients.parallelcommerce.co.uk` (production) or `http://localhost:3000` (local)
- Redirect URLs allow list:
  - `http://localhost:3000/auth/callback`
  - `https://clients.parallelcommerce.co.uk/auth/callback`
  - `https://<your-vercel-domain>/auth/callback`

Enable **Email** provider. Magic links and email OTP both use the **Magic Link** email template.

### 3b. Email OTP template (required for code sign-in)

In **Authentication → Email Templates → Magic link**, include `{{ .Token }}` so the 6-digit code appears. Example:

```html
<h2>Sign in to Parallel</h2>
<p>Your one-time code is:</p>
<p style="font-size:24px;letter-spacing:4px;"><strong>{{ .Token }}</strong></p>
<p>Or use this magic link on the same device:</p>
<p><a href="{{ .ConfirmationURL }}">Sign in</a></p>
<p>This code expires shortly and can only be used once.</p>
```

Auth emails (codes + magic links) are sent by **Supabase Auth → SMTP** (e.g. Resend SMTP). That is separate from `RESEND_API_KEY` in the app, which is only for in-app notifications/reports.

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
