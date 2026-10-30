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
- `npm run db:push` — push schema changes to DB. First runs `predb:push` (`script/db-renames.ts` → `server/db-renames.ts`), which idempotently renames tables/columns/constraints that drizzle-kit would otherwise drop and recreate (currently SPV → Vehicle, and `entity_managers` → `delegations`), and runs data backfills drizzle-kit can't do (currently: a default share class per Vehicle, `planVehicleClassesBackfill` — it also creates the class constraints itself, since drizzle-kit would otherwise stop to offer truncating `vehicle_classes`)
- `npm run dev-data:export` — snapshot an org + selected vehicles (with their investors, entities, assets, valuations) from a FundFlow instance via the API into `dev-data/dataset.json` (gitignored — real people's data). Needs `FUNDFLOW_TOKEN` (admin `ff_…` token); optional `FUNDFLOW_URL` (default production), `DEV_DATA_ORG` (default `rapid-scale`), `DEV_DATA_VEHICLES` (comma-separated name fragments, default `Kapital,Kushki,Modelia`). Tax IDs and bank account/routing numbers are blanked
- `npm run dev-data:seed` — load that snapshot into the local DB (refuses in production; no-op if the org slug already exists). Accounts reuse existing ones by email; new ones get `DEV_SEED_PASSWORD` (default `password123`). Logic in `server/dev-data.ts`, CLI in `script/dev-data.ts`
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
  concord.ts                   # ConcordNow e-signature client (create from template, status, delete)
  contracts.ts                 # Per-kind contract templates (env), drafts, serialization
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
| `CONCORD_API_KEY` | ConcordNow API key (sent as `X-API-KEY`). Contracts are disabled (503) without it. The only Concord env var — the rest of the Concord config lives in Settings → Contracts (see `app_settings`) |
| `SEED_ADMIN_PASSWORD` | Password for the seed admin (`isaac@conexo.vc`), used only when the DB has no accounts. Required in production then; in dev, a random one is generated and logged if unset |

## Internationalization (i18n)
- **Languages**: English (default), Spanish, French
- **URL strategy**: every page lives under `/<lang>/...`. `LocalePrefixGuard` (in `App.tsx`) redirects bare URLs using this priority: `fundflow:lang` cookie → logged-in user's `account.language` → `navigator.language` → `en`.
- **Language cookie**: `fundflow:lang` — set by the language switcher UI (1-year expiry). Helpers in `client/src/i18n/config.ts`: `getLangCookie`, `setLangCookie`, `expireLangCookie`. i18next does **not** auto-cache; the cookie is managed manually.
- **Account language**: stored as `accounts.language` (enum: `en`/`es`/`fr`, default `en`). When a user saves a new language on their own account, the cookie is expired and the UI navigates to the new locale immediately.
- **Building links**: always use `useLocalePath()` or `useLocaleFullPath()` — never hardcode paths like `"/accounts"`.
- **Route keys**: defined in `client/src/i18n/routes.ts` (`accounts`, `accountDetail`, `organizations`, `vehicleDetail`, `entities`, `promoters`, `promoterDetail`, `documents`, `settings`, `forgotPassword`, `resetPassword`, `orgLanding`, …).
- **Strings**: `react-i18next`, namespaced JSON catalogs. Server API errors stay in English.
- **Adding a language**: add locale code to `LOCALES` in `routes.ts`, fill in path patterns, add `locales/<lang>.json`.

## Authentication & Authorization
- Session-based auth via express-session + connect-pg-simple
- **Bearer token auth**: `Authorization: Bearer ff_<48 hex chars>`. Only SHA-256 hash stored. Tokens inherit owner's roles. Token CRUD and password change require a real session cookie.
- **Admin**: full platform access — create/delete organizations, manage all resources
- **Non-admin**: sees only own account, entities they manage/own, orgs they belong to, vehicles they're members of
- **Delegates**: a non-admin also acts for every account and entity that delegated to them (`delegations`): `observer` reads the principal's data (an account's profile, portfolio, entities, vehicle positions, documents; an entity's details, owners, delegates, portfolio, documents); `manager` can also change what the principal can (an account's profile — never roles/password — and the entities it manages; an entity's details, owners and delegations). An account delegate reaches its principal's entities at the lower of the two levels; otherwise not transitive, and never covers the principal's admin role or organizer powers. Resolve access through `server/access.ts` (`actingAccountIds(me, "read" | "write")`, `accessToAccount`, `accessToEntity`, `delegatedEntityIdsOf`) instead of `me.id` when checking personal data
- **Organizers vs members**: managing an org (edit it, organizers, member list/approve/remove, invites, create vehicles) requires admin or organizer of that org (`canManageOrg` in `server/routes.ts`). Approved membership only grants read access to the org — never use `getOrganizationIdsForAccount` (members + organizers) for write checks; use `getOrganizationIdsAsOrganizer`.
- Public routes (no auth): `/api/auth/login`, `/api/auth/me`, `/api/organizations/by-slug/:slug`, `/api/invites/:token`, `/api/invites/:token/accept` (creates a new account from body fields, or accepts for the logged-in caller — never a client-supplied `accountId`). `POST /api/accounts` is admin-only (no self-signup — new users come from admin creation or invite links) and sends a welcome email unless `welcome_email: false`. `password` is optional: with one the email contains the credentials; without one it contains a 7-day link to create a password (no password + `welcome_email: false` → 400). The 201 response includes `welcomeEmail: "sent" | "failed" | "skipped"`; a failed send doesn't roll back the account and the UI warns the admin. Same for an admin setting a password via `PATCH /api/accounts/:id` (`welcomeEmail` is only present in that response when `password` was sent). `POST /api/organizations/:id/members/request` requires auth: without `accountId` it creates a pending request for the caller; with another `accountId` only admins/organizers of that org may call it and the membership is created approved
- API spec served at `/docs` (Redoc), `/api/openapi.yaml`, `/api/openapi.json` (all public)

## Naming: Vehicles
Investment vehicles (SPVs, funds, etc.) are called **Vehicles** everywhere — code, API (`/api/vehicles`), URLs, DB tables (`vehicles`, `vehicle_*`), UI (es: *vehículo*, fr: *véhicule*). They used to be called SPVs; don't reintroduce the term. Old `/<lang>/spvs[/:id]` links redirect to the vehicle pages (`App.tsx`).

## Database Schema Overview
- `accounts` — users with personal info; `code` is the user-facing "Account ID" (8 random A-Z/0-9 characters, generated on every insert by `generateAccountCode`; null on older accounts; **not unique yet**; visible on the Login tab, editable only by admins, silently stripped for others on `PATCH /api/accounts/:id`); `passwordHash` never returned in API responses; `language` field stores preferred locale (`en`/`es`/`fr`, default `en`); `nationality` is a country name (from `CountrySelect`), used for contracts
- `roles` / `account_roles` — role assignments (admin only; GP/LP removed)
- `api_tokens` — personal API tokens (hash only stored, plaintext shown once)
- `organizations` — fund organizations with auto-generated URL slugs
- `organization_organizers` / `organization_members` / `organization_invites` — org access control
- `organization_members.management_fee_percent` / `success_fee_percent` — a member's default terms in that org (null = none), edited from the org's Members tab (`PATCH /api/organizations/:id/members/:accountId`). `POST /api/vehicles/:id/members` fills an omitted `managementFee` (= committed × %) / `carry` from them; entity investors take the lowest of their managers' in the org, fee by fee. Rules in `shared/fees.ts`, shared with the investment form, which pre-fills them
- `vehicles` — Investment vehicles (SPVs, funds, etc.); `code` is the user-facing Vehicle code (4 random A-Z/0-9 characters, generated on every insert by `generateVehicleCode`; null on older Vehicles; **not unique yet**; shown on the Configuration tab, editable only by admins, silently stripped for organizers on `PATCH /api/vehicles/:id`); `autoDeploy` flag auto-calls net capital on new investments
- `vehicle_classes` — share classes: "sub-vehicles" with segregated investors and assets. **Every Vehicle has at least one** (`createVehicle` adds "Class A", `DEFAULT_CLASS_NAME`; the last one can't be deleted, 409), and every position and asset belongs to one (`vehicle_members.class_id` / `vehicle_assets.class_id`, NOT NULL). **With a single class the UI shows no classes at all** (`showsClasses(count)` = count > 1) — no picker, badge, filter or class column; only the Share Classes tab (for organizers) to add a second one. Each class is its own pool — cash, asset value, ownership shares, `currentValue` and the autoDeploy default asset are computed per class (pure rules in `shared/vehicle-classes.ts`, shared with the client). `classId` on positions/assets: required with several classes, defaults to the only one; that it's a class of the same Vehicle is checked by the API (`resolveClassId`), not the DB — a composite FK made drizzle-kit drop/re-add it on every push. A class can only be deleted when empty (409). Investors only see the classes (and those classes' assets/valuations) they hold positions in. API: `/api/vehicles/:id/classes[/:classId]` (writes: admin/organizer)
- `vehicle_members` — investor positions (tranches); multiple rows per investor allowed. `code` = the Vehicle's code + `-` + 4 random A-Z/0-9 characters (`generatePositionCode`, set by `addVehicleMember`; null on older positions or when the Vehicle has no code; **not unique yet**; read-only in the API; `updateVehicle` rewrites the prefix when the Vehicle's code changes). Derived fields: `capital`, `commitmentRemaining`, `currentValue`. `date` is required on creation.
- `vehicle_assets` — portfolio holdings; at most one `isDefault` per share class (receives that class's autoDeploy capital)
- `vehicle_asset_valuations` — time-series marks; latest drives `currentValue`
- `entities` — LLC/Corp/Trust/etc. records
- `entity_owners` — who owns an entity (accounts or other entities, with %). Who acts for it is in `delegations`
- `introductions` — who introduced whom (for network tracking / referral fees). One row per introducer → target, target is an account *or* an entity; an account can have several introducers. Rows with `via_account_id` are inherited entity credit (X introduced manager M ⇒ X introduced M's entities), kept in sync by `syncInheritedIntroductions` in `server/storage.ts` whenever introductions, entity delegations or accounts change (only `manager`-level entity delegations pass credit on) — never written directly. Loop rules (no cycles A→B→C→A; can't introduce an entity managed by yourself or anyone upstream of you) live in `server/introductions.ts` (pure, unit-tested). Admin-only API; edited from the account page's Introductions tab
- `delegations` — principal (an account *or* an entity: `principal_account_id` / `principal_entity_id`, exactly one) → delegate account (attorney, accountant, family…) with `level` (`observer`/`manager`, `DELEGATION_LEVELS` in `shared/schema.ts`) and `notes`. One row per pair, no self-delegation. Replaced `entity_managers` (migrated in place by `planEntityDelegationsMerge` in `server/db-renames.ts`; old managers are `manager` rows). **Entities can't act by themselves**: `POST /api/entities` requires `managerAccountIds` (≥1; non-admins must include themselves) and the API refuses (409) removing/downgrading an entity's last manager. API: `/api/delegations` (account principals admin-only; entity principals also the entity's managers), `GET /api/accounts/:id/delegations` (admin), `GET /api/entities/:id/delegations` (anyone who can read the entity); grants access as described under Authorization
- `relationships` — informational personal ties between two accounts, read as "`from` is the `description` of `to`" (free text, e.g. "wife"). One row per direction. Admin-only API (`/api/relationships`, `GET /api/accounts/:id/relationships`); grants no access
- The account page's **Connections** tab (admin-only) has three sections: Delegation (acts on behalf of / delegates), Introductions, Relationships. The entity page's Connections tab has Delegation (delegates only — entities never act for others), Owners and Introductions (admin-only); observers see it read-only
- `promoters` — vetted introducers under contract who earn commissions on what their introductions pay us. One row per account (`active`, `contract_date`, `notes`). Created inactive; only activatable with a signed promoter agreement (`hasSignedContract`, 409 otherwise) and auto-activated when `POST /api/contracts/:id/refresh` first sees the agreement signed. Deactivating is always allowed and a later refresh doesn't undo it. Admin-only API under `/api/promoters` and the Promoters section in the sidebar
- `promoter_incentives` — a promoter's commission terms: `type` (`management_fee` = % of the management fee the introduced pay us, `success_fee` = % of the success fee we earn from them; `INCENTIVE_TYPES` in `shared/schema.ts`) and `percent` (0 < p ≤ 100). At most one per type and promoter. Only the terms are stored — commissions aren't computed yet
- `contracts` — contracts sent for e-signature through ConcordNow. Generic: `kind` (`CONTRACT_KINDS` in `shared/schema.ts`; only `promoter_agreement` so far) plus one nullable FK per subject (`promoter_id` now; add a column per new use — investments, tax forms…). `status` caches Concord's summary status (`UNKNOWN_CONTRACT` → `SIGNED`, `DELETED` when gone from Concord) and is only refreshed on demand (`POST /api/contracts/:id/refresh`); `concord_uid` follows the signed copy. Signed contracts can't be deleted. Concord calls live in `server/concord.ts` (`getConcordClient(config)`); its config is `CONCORD_API_KEY` plus the `concord_*` keys in `app_settings` (org id, URL overrides, our signer, per-kind template/folder), read and written by `server/contracts.ts` and edited in Settings → Contracts (`GET/PATCH /api/settings/concord`); the client UI is the reusable `ContractsCard` component (list/check/delete + review-and-send from a `…/contracts/draft` endpoint). Admin-only API. Adding a kind: add it to `CONTRACT_KINDS`/`ContractKind`, its template/folder settings in `server/contracts.ts` (+ the settings schema, Settings form and catalogs), a draft + create route for its subject
- `documents` — file metadata; files stored at `<storage_path>/{account|entity}/<id>/<folderPath>/`
- `app_settings` — key/value config (e.g. `documents_storage_path`, `concord_org_id`, `concord_promoter_template_id`)
- `password_reset_tokens` — single-use; 1-hour expiry for "forgot password", 7 days for account-setup links (`PASSWORD_RESET_TTL_MS` / `ACCOUNT_SETUP_TTL_MS` in `shared/schema.ts`)

## Key Implementation Details
- Password hashing: bcrypt
- Vehicle `currentValue` = `cash + assetValue` (derived, never stored; the sum of its share classes' pools)
- Vehicle allocation methods: `"By Commitment"` (default), `"By Capital Invested"`, `"Custom"`
- Vehicle creation requires `dateEstablished`; Vehicle member/tranche creation requires `date` — enforced in Zod schema and server validation
- Document uploads: multipart, admin-only, ≤100 MB (multer limit); nginx `client_max_body_size 100M`
- Document storage path configurable via `PATCH /api/settings/documents-path`
- Documents folder tree is collapsed by default (only root node is open)
- Organizations auto-generate slugs from name on creation
- Non-admin users can update their own account profile; `roles` field is silently stripped (not rejected) for non-admins on `PATCH /api/accounts/:id`
- Seed account: `isaac@conexo.vc` (admin, password from `SEED_ADMIN_PASSWORD`; see `server/seed.ts`)

## Change Checklist (every change)
- **Tests**: add or update tests for any behaviour you change, and fix any test you break — never leave the suite red. Run `npm run test` and make sure it passes (all files load, 0 failures) before finishing a change.
- **API docs**: any change to an endpoint's auth, request body, response shape or status codes must be reflected in `docs/openapi.yaml` in the same change (it is the source of truth, served at `/docs`). Check it still parses with `js-yaml`.
- **i18n**: user-facing strings go in all three catalogs (`en`, `es`, `fr`).

## Production Deployment (this server)
- Runs as systemd service `fundflow` on port 3000
- nginx reverse proxies `https://portal.rapidscale.vc` → port 3000, handles SSL (Let's Encrypt, auto-renews)
- To deploy an update: `git pull && npm install && npm run test && npm run build && npm run db:push && systemctl restart fundflow` — **do not deploy if `npm run test` fails**; fix the tests (or the code) first.
- `db:push` runs before the restart so the new code never starts against a missing table/column. Read its prompts: answer **create** (not rename) for genuinely new tables, and never accept a data-loss statement you didn't expect — abort and investigate instead. The connect-pg-simple `session` table is excluded via `tablesFilter` in `drizzle.config.ts`.
