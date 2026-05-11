# XamXam — DokMart

Marketplace numérique de documents académiques et contenus digitaux. Les vendeurs créent un compte, soumettent une candidature, et une fois approuvés par l'admin, peuvent mettre en vente leurs produits (documents, ebooks, templates, etc.).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/dokmart run dev` — run the frontend (port 23718)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only, interactive)
- `pnpm --filter @workspace/db run push-force` — push DB schema changes (non-interactive, for automation)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — HMAC signing secret, `DIAMANOPAY_CLIENT_ID` + `DIAMANOPAY_CLIENT_SECRET` — DiamanoPay OAuth2 credentials

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 8080, path `/api`)
- Frontend: React + Vite (port 23718, path `/`)
- DB: PostgreSQL + Drizzle ORM (no FK constraints defined — delete order matters)
- Auth: Custom HMAC JWT tokens stored as httpOnly cookies (`seller_token`), scrypt password hashing
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (ESM bundle)
- File uploads: multer → local disk (`UPLOAD_DIR` env, default `./uploads`)

## Where things live

- `lib/db/src/schema/` — source of truth for DB schema (sellers, seller_applications, documents, categories, levels, orders)
- `lib/api-zod/src/generated/api.ts` — generated Zod schemas from OpenAPI spec
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `artifacts/api-server/src/routes/` — all Express route handlers
- `artifacts/api-server/src/lib/auth.ts` — HMAC token signing + scrypt password hashing
- `artifacts/dokmart/src/pages/` — frontend pages (Admin, SellerDashboard, SellerLogin, BecomeSeller, etc.)
- `scripts/render-build.sh` — Render.com build script (includes DB migration + frontend build)

## Architecture decisions

- **No FK constraints in DB schema** — deletes must follow correct order (documents → applications → sellers). This is intentional to avoid cascade complexity.
- **HMAC JWT (no jsonwebtoken)** — custom implementation using Node.js `crypto.createHmac`. Tokens stored as httpOnly cookies. Admin credentials are hardcoded in the frontend (not ideal for production).
- **passwordHash never returned by API** — all seller-application endpoints explicitly omit the `passwordHash` field before responding.
- **Auto-migration on startup** — the API server calls `pnpm --filter @workspace/db run push-force` on every start to keep the schema up to date. Non-fatal: the server still starts if migration fails.
- **Production static serving** — in production, the API server also serves the frontend from `artifacts/dokmart/dist/public`. The Render build script builds both.

## Product

- **Marketplace** — browse, search and buy documents by category/level/type
- **Seller flow** — apply → admin review → approved → login → publish products → track stats
- **Admin dashboard** — manage seller applications (approve/reject), manage active sellers (delete), create/manage documents
- **File storage** — PDF/file upload via multipart form to `/api/storage/upload`, stored in `UPLOAD_DIR`

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm --filter @workspace/db run push-force` after any schema change in `lib/db/src/schema/`
- Run `pnpm --filter @workspace/api-spec run codegen` after any OpenAPI spec change
- Admin email/password is hardcoded in `artifacts/dokmart/src/pages/Admin.tsx` — change for real production use
- `SESSION_SECRET` must be the same across restarts; changing it invalidates all existing seller sessions
- File uploads are stored locally — they are ephemeral on Render (use object storage for production persistence)
- The `dev` script rebuilds on every start (`build && start`) — expect ~5s startup time in dev

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Render deploy: set `DATABASE_URL` env var in Render dashboard, use `scripts/render-build.sh` as build command and `node artifacts/api-server/dist/index.mjs` as start command
