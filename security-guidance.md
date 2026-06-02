# Security Guidance — TaskMatrix

> Auto-enforced by the `requesting-code-review` skill pre-commit pipeline.
> Rules here are checked alongside built-in patterns on every `git commit`.

## Banned imports and APIs
- never use: `eval()`, `exec()` with any non-literal input
- never use: `innerHTML = userInput` — always use `textContent`
- never use: unsanitized user input in `window.open()`, `location.href`
- never use: `JSON.parse()` on untrusted input without try/catch

## Supabase / database safety
- required: all Supabase queries use `.eq()`, `.in()`, `.match()` — never raw string concatenation
- required: Row Level Security (RLS) policies reviewed for every new table
- required: service_role key never used in client-side code (only in serverless functions)

## Auth and sessions
- required: auth state verified server-side, never trust client-side claims alone
- required: session tokens `HttpOnly`, `Secure`, `SameSite=Strict`
- required: password reset tokens single-use with expiration

## Form handling
- required: all form inputs validated client-side AND server-side
- required: CSRF protection on all state-changing requests
- required: file uploads (if any) restricted by type and scanned

## LocalStorage safety
- required: no sensitive tokens or keys in localStorage (use httpOnly cookies)
- required: localStorage data treated as untrusted on read (user can modify)

## Third-party scripts
- required: all external scripts loaded with SRI hashes
- required: no inline event handlers (`onclick=` attributes) — use addEventListener
