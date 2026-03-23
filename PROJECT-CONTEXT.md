---
## Status: LIVE ✅
Live URL: https://ali999774.github.io/TaskMatrix_Supabase
Last deployed: 2026-03-22
Phase 1 (Supabase sync): Complete
Phase 2 (UX improvements): Complete
---
# TaskMatrix — Project Context
## Project
Personal Eisenhower Matrix task manager, single HTML file.
GitHub repo: https://github.com/[your-username]/taskmatrix
Live URL: https://[your-username].github.io/taskmatrix
## Stack
Vanilla HTML/CSS/JS, Supabase (Postgres + Auth), Google OAuth, GitHub Pages
## Current Phase
Phase 1 (Marcus) — Supabase wiring → outputs Taskmatrix-v2.html
Phase 2 (Jordan) — UX improvements → outputs Taskmatrix-v3.html
Final file renamed to index.html and pushed to GitHub Pages
## Key Decisions Made
- Google OAuth, single user, persistent session
- RLS on tasks and sticky_notes tables (user_id = auth.uid())
- Anon key safe to commit, RLS is the security layer
- No offline queue in Phase 1, deferred to later
- GitHub Pages for hosting (free, https, stable URL)
- index.html is the live file, versioned files kept for reference
## Supabase
- Migration script already run: SUPABASE-MIGRATION.sql
- Tables: tasks, sticky_notes
- Auth: Google OAuth
- Project URL: https://xulnxwwwjpvgsaqnsllo.supabase.co
- Project ref: xulnxwwwjpvgsaqnsllo
- Google OAuth: configured
- GCP Project: taskmatrix
- Test user added: draliabbas@gmail.com
- OAuth status: External / Testing (not yet published)
## Files in this folder
- index.html — live app (rename from Taskmatrix-v3.html when done)
- Taskmatrix-v2.html — Marcus output
- Taskmatrix-v3.html — Jordan output
- SOPHIA-SPEC.md — master project spec
- FINAL-01-MARCUS.md — Marcus agent brief
- FINAL-02-JORDAN.md — Jordan agent brief
- SUPABASE-MIGRATION.sql — already run, kept for reference
- RUN-ORDER.md — build sequencing guide
- PROJECT-CONTEXT.md — this file
## Tool Division of Labor (learned from build)
- Browser extension → diagnose only: read console errors, fill forms,
  navigate dashboards, check deployment status. NEVER edit source files.
- Antigravity → all code fixes and feature work
- Cowork → file operations, updating docs, git commits
- Terminal → git push (requires local credentials)
## Credentials (local only — do not commit)
- Supabase DB Password: KbFMGWoeo3lSVp5Y
---
