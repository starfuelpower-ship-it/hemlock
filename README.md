# Hemlock (v1 foundation) — Downloadable starter

Working **Vite + React + TypeScript + Tailwind** project that implements:
- Hemlock **homepage shell** (dark gothic purple UI)
- Gold + Vigor (offline mode works without Supabase)
- Action queue (Hunt / Stalk / Breach) that generates Chronicle-style reports
- Report inbox page
- World chat panel (offline log; realtime if Supabase configured)

## Run
```bash
npm install
npm run dev
```

## Optional Supabase
Create `.env` at repo root:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Then run `supabase/schema.sql` in Supabase SQL editor.

If env vars are missing, the app runs in **Offline Mode** (localStorage) so you can preview instantly.
