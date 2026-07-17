# Nexus Center — Merchant Dashboard

A multi-tenant merchant dashboard for global e-commerce operators. Manage a localized product catalog (EN/AR/ES/FR/ZH), trigger async 3D AR model conversions, sync products from Shopify or Salla, and generate embeddable `<model-viewer>` AR snippets.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/merchant-dashboard run dev` — run the frontend (port 19445)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Clerk Express middleware (JWT auth, JIT merchant provisioning)
- DB: PostgreSQL + Drizzle ORM (tables: merchants, products, conversion_jobs)
- Auth: Clerk (Replit-managed, multi-tenant by clerk_id)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)
- Frontend: React + Vite, Tailwind v4, shadcn/ui, Wouter routing, TanStack Query
- Charts: Recharts (monthly conversions bar chart)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle table definitions (merchants, products, conversionJobs)
- `artifacts/api-server/src/routes/` — Express route handlers (me, dashboard, products, import)
- `artifacts/api-server/src/middlewares/requireAuth.ts` — Clerk auth + JIT merchant provisioning
- `artifacts/merchant-dashboard/src/` — React frontend (pages, components)

## Architecture decisions

- **Multi-tenancy via clerk_id**: every DB query is scoped to `merchant_id` resolved from the Clerk session. No merchant can access another's data.
- **Mock 3D converter**: `POST /api/products/:id/convert` marks status `pending`, spawns a 10-second `setTimeout`, writes placeholder `.glb`/`.usdz` files to `public/models/<id>/`, then marks `completed`. Swap the mock for a real provider (Meshy etc.) by replacing the setTimeout block.
- **Strategy Pattern for importers**: `GET /api/import/preview?source=shopify|salla` returns mock data from separate in-memory arrays. Add real API calls by replacing those arrays with live fetches.
- **Localized text as JSONB**: product `name` and `description` are stored as `{ en, ar, es, fr, zh }` JSON objects. The backend expects and returns `LocalizedText` objects; the frontend renders the active locale.
- **Embed code**: `GET /api/products/:id/embed-code` generates a `<model-viewer>` HTML snippet pointing to the product's public `.glb`/`.usdz` URLs.

## Product

- Landing page with sign-up/sign-in CTAs (Clerk-powered auth)
- Dashboard: 4 KPI widgets + monthly conversions bar chart
- Product list: search, filter by conversion status and source, paginated
- Product create: tabbed localized fields (EN/AR/ES/FR/ZH), price, currency, image URL
- Product detail: AR 3D viewer (`<model-viewer>`) + embed code modal with copy-to-clipboard
- Import modal: Shopify/Salla mock product import with checkbox selection
- Settings: display name + locale selector (5 languages, RTL support for Arabic)

## User preferences

_Populate as you build._

## Gotchas

- After any OpenAPI spec change, run codegen before touching routes or the frontend
- `CreateProductBody`, `UpdateProductBody`, `ImportProductsBody` are the Zod schema names (not `CreateProductInput` etc.)
- The 3D mock conversion uses `setTimeout` inside the route handler — it is not persisted across server restarts
- Arabic locale should trigger `dir="rtl"` on the root layout element
- Clerk dev keys warn in the console — this is expected and harmless in development

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `clerk-auth` skill for auth configuration and troubleshooting
