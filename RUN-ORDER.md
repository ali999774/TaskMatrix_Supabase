# RUN-ORDER — TaskMatrix Phase 1 & 2
## Agent Sequence
```
[SETUP] You → Supabase Dashboard (5 min manual steps, see below)
    ↓
[01] Marcus — Supabase Integration (Sonnet 4.6)
    → Input:  Taskmatrix.html + SOPHIA-SPEC.md + FINAL-01-MARCUS.md
    → Output: Taskmatrix-v2.html
    ↓
[02] Jordan — UX Improvements (Sonnet 4.6)
    → Input:  Taskmatrix-v2.html + SOPHIA-SPEC.md + FINAL-02-JORDAN.md
    → Output: Taskmatrix-v3.html
    ↓
[DEPLOY] You → Add Supabase keys → rename to index.html → push to GitHub
    ↓
[VERIFY] You → Test on 2 devices
    ↓
[AUDIT] Antigravity → Paste audit prompt → confirm all checks pass
```
---
## Pre-Flight Checklist (Before Running Marcus)
### 1. Create Supabase Project
- Go to https://supabase.com → New Project
- Name: taskmatrix
- Region: US East
- Save your database password
### 2. Run the SQL Migration
- Supabase Dashboard → SQL Editor → New Query
- Paste contents of SUPABASE-MIGRATION.sql → Run
- Verify both tables appear in Table Editor
### 3. Enable Google OAuth
- Supabase Dashboard → Authentication → Providers → Google → Toggle ON
- Go to https://console.cloud.google.com
- Create project → APIs & Services → Credentials
- Create OAuth 2.0 Client ID → Web Application
- Authorized redirect URIs:
  https://[your-project-ref].supabase.co/auth/v1/callback
  https://[your-github-username].github.io/[your-repo-name]
- Copy Client ID and Client Secret → paste into Supabase Google provider → Save
### 4. Configure Supabase Auth URLs
- Supabase Dashboard → Authentication → URL Configuration
- Site URL: https://[your-github-username].github.io/[your-repo-name]
- Redirect URLs: same URL + http://localhost:3000
### 5. Get Your Supabase Keys
- Supabase Dashboard → Project Settings → API
- Copy: Project URL and anon public key
- Paste into top of Taskmatrix-v3.html before deploying
---
## Deploy to GitHub Pages
```bash
cp Taskmatrix-v3.html index.html
git add .
git commit -m "TaskMatrix v3 - Supabase sync + UX improvements"
git push origin main
```
If GitHub Pages not yet enabled:
Repo → Settings → Pages → Source: Deploy from branch → main → / (root) → Save
---
## STATUS
| Step | Owner | Status |
|------|-------|--------|
| Supabase project created | Ali | ⬜ |
| SQL migration run | Ali | ⬜ |
| Google OAuth configured | Ali | ⬜ |
| Auth URLs configured | Ali | ⬜ |
| Marcus — Taskmatrix-v2.html | Marcus | ⬜ |
| Jordan — Taskmatrix-v3.html | Jordan | ⬜ |
| Supabase keys added to file | Ali | ⬜ |
| Deployed to GitHub Pages | Ali | ⬜ |
| Tested on 2 devices | Ali | ⬜ |
| Audit passed | Ali | ⬜ |
---
## Phase 2 Backlog (after Phase 1 stable)
| Feature | Agent | Notes |
|---------|-------|-------|
| Real-time sync | Marcus | Supabase Realtime subscriptions |
| Offline queue | Marcus | Service worker + sync on reconnect |
| Mobile responsive | Jordan | Collapse quadrant grid on small screens |
| Archive completed tasks | Jordan | Clean matrix without losing history |
| Notion/CSV export | Jordan | Dump task log into knowledge OS |
