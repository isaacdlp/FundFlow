# FundFlow - VC/PE Fund Management Platform

Multi-tenant fund management platform for VC and PE investments. Organizations have public landing pages where users can request access or accept invite links.

## Tech Stack
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (TypeScript)
- **Backend**: Express.js + Drizzle ORM (TypeScript)
- **Database**: PostgreSQL
- **Routing**: wouter
- **Data fetching**: TanStack Query v5

## Commands
- `npm run dev` — development server (Express API + Vite, reads `.env` via `--env-file`)
- `npm run build` — production build → `dist/index.cjs`
- `npm run check` — TypeScript type check
- `npm run db:push` — push schema changes to DB
- `npm run test` — Vitest (server + client)
- `npm run test:e2e` — Playwright E2E tests

## Project Structure
```
client/src/
  components/app-sidebar.tsx   # Main navigation sidebar
  components/ui/               # shadcn/ui components
  pages/                       # One file per page/route
  i18n/
    config.ts                  # i18next setup
    hooks.ts                   # useLocalePath, useLocaleFullPath, useSwitchLanguage
    routes.ts                  # LOCALES, ROUTE_PATTERNS (locale-aware URL map)
    locales/{en,es,fr}.json    # Translation catalogs
server/
  index.ts                     # Express entry point
  routes.ts                    # All API routes
  storage.ts                   # DatabaseStorage class (IStorage interface)
  email.ts                     # Nodemailer — sendPasswordResetEmail
  documents.ts                 # Document upload/download/delete routes
  vite.ts                      # Vite dev integration (DO NOT MODIFY)
shared/
  schema.ts                    # Drizzle schema + Zod validation
  types.ts                     # Shared TypeScript interfaces
docs/openapi.yaml              # API spec (source of truth for all endpoints)
```

## Environment Variables
| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | express-session secret |
| `APP_URL` | Public base URL (e.g. `https://portal.rapidscale.vc`) — used in email links |
| `SMTP_HOST` | SMTP server host |
| `SMTP_PORT` | SMTP port (587 = STARTTLS — port 465 is blocked on this server) |
| `SMTP_USER` | SMTP username |
| `SMTP_FROM` | Sender address |
| `SMTP_PASSWORD` | SMTP password |

## Internationalization (i18n)
- **Languages**: English (default), Spanish, French
- **URL strategy**: every page lives under `/<lang>/...`. `LocalePrefixGuard` (in `App.tsx`) redirects bare URLs using this priority: `fundflow:lang` cookie → logged-in user's `account.language` → `navigator.language` → `en`.
- **Language cookie**: `fundflow:lang` — set by the language switcher UI (1-year expiry). Helpers in `client/src/i18n/config.ts`: `getLangCookie`, `setLangCookie`, `expireLangCookie`. i18next does **not** auto-cache; the cookie is managed manually.
- **Account language**: stored as `accounts.language` (enum: `en`/`es`/`fr`, default `en`). When a user saves a new language on their own account, the cookie is expired and the UI navigates to the new locale immediately.
- **Building links**: always use `useLocalePath()` or `useLocaleFullPath()` — never hardcode paths like `"/accounts"`.
- **Route keys**: defined in `client/src/i18n/routes.ts` (`accounts`, `accountDetail`, `organizations`, `spvDetail`, `entities`, `documents`, `settings`, `forgotPassword`, `resetPassword`, `orgLanding`, …).
- **Strings**: `react-i18next`, namespaced JSON catalogs. Server API errors stay in English.
- **Adding a language**: add locale code to `LOCALES` in `routes.ts`, fill in path patterns, add `locales/<lang>.json`.

## Authentication & Authorization
- Session-based auth via express-session + connect-pg-simple
- **Bearer token auth**: `Authorization: Bearer ff_<48 hex chars>`. Only SHA-256 hash stored. Tokens inherit owner's roles. Token CRUD and password change require a real session cookie.
- **Admin**: full platform access — create/delete organizations, manage all resources
- **Non-admin**: sees only own account, entities they manage/own, orgs they belong to, SPVs they're members of
- Public routes (no auth): `/api/auth/login`, `/api/auth/me`, `/api/organizations/by-slug/:slug`, `/api/invites/:token`, `/api/invites/:token/accept`, `POST /api/accounts`
- API spec served at `/docs` (Redoc), `/api/openapi.yaml`, `/api/openapi.json` (all public)

## Database Schema Overview
- `accounts` — users with personal info; `passwordHash` never returned in API responses; `language` field stores preferred locale (`en`/`es`/`fr`, default `en`)
- `roles` / `account_roles` — role assignments (admin only; GP/LP removed)
- `api_tokens` — personal API tokens (hash only stored, plaintext shown once)
- `organizations` — fund organizations with auto-generated URL slugs
- `organization_organizers` / `organization_members` / `organization_invites` — org access control
- `spvs` — Special Purpose Vehicles; `autoDeploy` flag auto-calls net capital on new investments
- `spv_members` — investor positions (tranches); multiple rows per investor allowed. Derived fields: `capital`, `commitmentRemaining`, `currentValue`. `date` is required on creation.
- `spv_assets` — portfolio holdings; at most one `isDefault` per SPV (receives autoDeploy capital)
- `spv_asset_valuations` — time-series marks; latest drives `currentValue`
- `entities` — LLC/Corp/Trust/etc. records
- `entity_owners` / `entity_managers` — entity access control
- `documents` — file metadata; files stored at `<storage_path>/{account|entity}/<id>/<folderPath>/`
- `app_settings` — key/value config (e.g. `documents_storage_path`)
- `password_reset_tokens` — single-use, 1-hour expiry

## Key Implementation Details
- Password hashing: bcrypt
- SPV `currentValue` = `cash + assetValue` (derived, never stored)
- SPV allocation methods: `"By Commitment"` (default), `"By Capital Invested"`, `"Custom"`
- SPV creation requires `dateEstablished`; SPV member/tranche creation requires `date` — enforced in Zod schema and server validation
- Document uploads: multipart, admin-only, ≤100 MB (multer limit); nginx `client_max_body_size 100M`
- Document storage path configurable via `PATCH /api/settings/documents-path`
- Documents folder tree is collapsed by default (only root node is open)
- Organizations auto-generate slugs from name on creation
- Non-admin users can update their own account profile; `roles` field is silently stripped (not rejected) for non-admins on `PATCH /api/accounts/:id`
- Seed account: `isaac@conexo.vc` (admin)

## Production Deployment (this server)
- Runs as systemd service `fundflow` on port 3000
- nginx reverse proxies `https://portal.rapidscale.vc` → port 3000, handles SSL (Let's Encrypt, auto-renews)
- To deploy an update: `git pull && npm install && npm run build && systemctl restart fundflow`
