# CRM-PIPE — SOURCE DE VÉRITÉ (à lire avant toute modif)

## 1) But
Ce fichier est LA référence unique.
- Toute nouvelle feature = on met à jour ici (routes, env, DB, scripts).
- Si quelque chose casse = on revient au commit backup.

## 2) Tech stack
- Next.js 16.x (App Router) + TypeScript
- Supabase (Auth + DB)
- Projet local: C:\Users\NABIL BAHHAR\Work\crm-pipe

## 3) Arborescence (résumé)
- src/app/
  - dashboard/page.tsx
  - dashboard-v2/page.tsx
  - pipeline/page.tsx
  - opportunities/page.tsx
  - accounts/page.tsx
  - kpi/page.tsx
  - inside/page.tsx
  - login/page.tsx
  - api/analytics/
    - summary/route.ts            => /api/analytics/summary?year=YYYY
    - dashboard/route.ts          => /api/analytics/dashboard?year=YYYY
    - kpi/summary/route.ts        => /api/analytics/kpi/summary?year=YYYY
- src/components/
  - NavBar.tsx
  - AppShell.tsx
  - charts/Gauge.tsx
- src/lib/
  - supabaseClient.ts (client)
  - supabaseServer.ts (server)
  - analytics.ts
  - csv.ts
- scripts/
  - daily_backup.ps1

## 4) Variables d’environnement (.env.local) — NE PAS COMMIT
Client (browser):
- NEXT_PUBLIC_SUPABASE_URL=...
- NEXT_PUBLIC_SUPABASE_ANON_KEY=...

Server (API routes):
- SUPABASE_SERVICE_ROLE_KEY=...   (UNIQUEMENT côté serveur / API routes)

Note: .env.local est ignoré par git.

## 5) Démarrage local
```bash
cd "/c/Users/NABIL BAHHAR/Work/crm-pipe"
npm install
npm run dev
