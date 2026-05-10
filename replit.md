# FundFlow - VC/PE Fund Management Platform

## Overview
Multi-tenant fund management platform for VC and PE investments. Users can participate in different funds managed by different organizers. Organizations have public landing pages where users can request access or accept invite links.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (TypeScript)
- **Backend**: Express.js + Drizzle ORM (TypeScript)
- **Database**: PostgreSQL (Replit-managed)
- **Workflow**: `npm run dev` starts both Express API and Vite dev server
- **Tests**: Vitest (server + client projects) + Playwright (E2E). See `tests/README.md`. Run via `scripts/test.sh` or `npx vitest run` / `npx playwright test`. Configs: `vitest.config.ts`, `playwright.config.ts`, `tests/tsconfig.json`.

## User Roles
- **Admin**: Platform administrator with full access — can create/destroy organizations
- **GP (General Partner)**: Fund manager
- **LP (Limited Partner)**: Investor in funds
- **Organizer**: Per-organization role — can manage settings for their assigned organization
- Users can have multiple roles simultaneously

## Project Structure
```
client/                   # React frontend
  src/
    components/
      app-sidebar.tsx     # Main navigation sidebar
      ui/                 # shadcn/ui components
    pages/
      dashboard.tsx       # Portfolio Summary dashboard (investments breakdown)
      accounts.tsx        # Account list (search/filter)
      account-detail.tsx  # Account detail with tabs (Personal Info, Login, Permissions)
      create-account.tsx  # New account creation form
      organizations.tsx   # Organization list with search/delete
      organization-detail.tsx  # Org detail with Settings, Organizers, Members & Invites tabs
      create-organization.tsx  # New organization creation form
      org-landing.tsx     # Public landing page at /org/:slug (no sidebar)
      spvs.tsx            # Top-level SPVs listing page with search
      create-spv.tsx      # Create new SPV form (5 sections)
      spv-detail.tsx      # SPV detail with Configuration and Members tabs
      entities.tsx        # Entities listing page with search
      create-entity.tsx   # Create new entity form (4 sections: General, Administration, Address, Disbursement)
      entity-detail.tsx   # Entity detail with Overview (editable) and Owners tabs
    lib/
      queryClient.ts      # TanStack Query configuration
server/
  index.ts                # Express entry point (seeds data on startup)
  routes.ts               # API routes for accounts, roles, organizations, members, invites, auth
  storage.ts              # DatabaseStorage class with IStorage interface
  vite.ts                 # Vite dev server setup (DO NOT MODIFY)
shared/
  schema.ts               # Drizzle ORM schema + Zod validation schemas
  types.ts                # Shared TypeScript interfaces
```

## Database Tables
- `accounts` - User accounts with personal info and address
- `roles` - Role definitions (admin, gp, lp)
- `account_roles` - Many-to-many account-role associations (with cascade delete)
- `api_tokens` - Personal API tokens (id, account_id, name, prefix, token_hash UNIQUE, last_used_at, expires_at, revoked_at, created_at). Only the SHA-256 hash is stored; plaintext is shown to the caller exactly once at creation.
- `organizations` - Organizations with unique slug for public landing pages
- `organization_organizers` - Many-to-many organization-account associations (Organizer role)
- `organization_members` - Membership requests with status (pending/approved/rejected), optional inviteId
- `organization_invites` - Single-use invite tokens with used/usedByAccountId tracking
- `spvs` - Special Purpose Vehicles with full entity details (legal, address, bank, investment)
- `spv_members` - Polymorphic SPV investor associations with per-member investment data. Stored columns: `date` (investment date, drives Portfolio Summary), `committed` (gross commitment), `managementFee`, `otherFee`, `totalCalled` (capital actually called so far), `distributed`, `currentValue` (mark / NAV), `ownershipPercent` (explicit per-investor share, used only by the "Custom" allocation method). **Derived (NOT stored, computed by UI/clients)**: `capital = committed − (managementFee + otherFee)`, `commitmentRemaining = capital − totalCalled`. Investor is either an Account (`account_id`) **or** an Entity (`entity_id`) — exactly one is non-null (enforced by `spv_member_investor_xor` CHECK constraint). **Tranches**: the same investor can have multiple rows in the same SPV — each row is an independent position (tranche) with its own values, fees, and date. Allocation math (commitment / capital invested / custom) is per-row, so an investor's total ownership in an SPV equals the sum of their tranche ownerships.
- `entities` - Entity records (LLC, Corp, Trust, etc.) with address and bank info
- `entity_owners` - Owners of entities (can be Accounts or other Entities, with ownership %)
- `entity_managers` - Managers of entities (always Accounts, unique per entity+account)

## API Endpoints
### Accounts
- `GET /api/accounts` - List all accounts with roles (supports ?search= and ?role= query params)
- `GET /api/accounts/:id` - Get single account with roles
- `POST /api/accounts` - Create new account (requires password, firstName, lastName, email)
- `PATCH /api/accounts/:id` - Update account fields and/or roles
- `DELETE /api/accounts/:id` - Delete account (cascades to account_roles)
- `GET /api/roles` - List all roles

### Auth
- `POST /api/auth/login` - Email/password login, returns account data (no passwordHash)
- `POST /api/auth/logout` - Destroys the session
- `GET /api/auth/me` - Returns the currently-authenticated account (works with both session cookie and bearer token)
- `POST /api/auth/change-password` - Change password (requires current password)
- `POST /api/auth/forgot-password` / `POST /api/auth/reset-password` - Reset flow

### API Tokens (programmatic access) — admin-only
All token CRUD requires admin role + a real session cookie (no bearer auth, even from an admin token).
- `GET /api/auth/tokens` - List the caller's tokens (no plaintext, no hashes)
- `POST /api/auth/tokens` - Create a new token (body: `{name, expiresInDays?}`). Returns the plaintext token **once** as `token` in the response — never retrievable again.
- `DELETE /api/auth/tokens/:id` - Revoke a token. Scoped to caller's `accountId`. Non-admins receive 403; bearer-authenticated callers receive 401.
- UI: `/settings/api-tokens` (sidebar link visible only to admins).
- Tokens are formatted as `ff_<48 hex chars>`. Only the SHA-256 hash is stored. Send via `Authorization: Bearer ff_...` on any `/api/*` request to authenticate. Bearer-authenticated requests inherit the token owner's account roles and permissions exactly (admin tokens hit admin routes; member tokens hit member routes). Revoked or expired tokens fall through to 401.

### Organizations
- `GET /api/organizations` - List all organizations with organizers
- `GET /api/organizations/:id` - Get single organization with organizers
- `GET /api/organizations/by-slug/:slug` - Public org data by slug (no organizers)
- `POST /api/organizations` - Create new organization (auto-generates slug from name)
- `PATCH /api/organizations/:id` - Update organization settings
- `DELETE /api/organizations/:id` - Delete organization (cascades)
- `POST /api/organizations/:id/organizers` - Add organizer (body: {accountId})
- `DELETE /api/organizations/:id/organizers/:accountId` - Remove organizer

### Members
- `GET /api/organizations/:id/members` - List members with account info
- `POST /api/organizations/:id/members/request` - Request access (body: {accountId}), creates pending membership
- `PATCH /api/organizations/:id/members/:accountId` - Approve/reject (body: {status})
- `DELETE /api/organizations/:id/members/:accountId` - Remove member

### Invites
- `GET /api/organizations/:id/invites` - List invites with used-by info
- `POST /api/organizations/:id/invites` - Generate new single-use invite link
- `GET /api/invites/:token` - Validate invite token, returns org info
- `POST /api/invites/:token/accept` - Accept invite (body: {accountId} or {email, password, firstName, lastName} for new account), auto-approves membership

### SPVs
- `GET /api/spvs` - List all SPVs across organizations (with org info)
- `GET /api/organizations/:id/spvs` - List SPVs for an organization
- `GET /api/spvs/:id` - Get single SPV with manager/signatory info and member count
- `POST /api/organizations/:id/spvs` - Create SPV
- `PATCH /api/spvs/:id` - Update SPV
- `DELETE /api/spvs/:id` - Delete SPV
- `GET /api/spvs/:id/members` - List SPV members (one row per tranche); each row includes `investorType` plus either an `account` or `entity` block
- `POST /api/spvs/:id/members` - Add an investor position to SPV (body: exactly one of `{accountId}` or `{entityId}`, plus optional investment fields). Accounts must be approved members of the SPV's organization. Calling this multiple times for the same investor creates additional tranches (independent positions); duplicates are intentional and allowed.
- `PATCH /api/spvs/:id/members/:memberId` - Update investment fields for a specific tranche (date, committed, managementFee, otherFee, totalCalled, distributed, currentValue, ownershipPercent)
- **SPV allocation methods** (stored on `spvs.allocation_method`, drives the per-member "Ownership %" computed in the SPV Members tab):
  - `"By Commitment"` (default) — ownership = member's `committed` ÷ sum of all members' `committed`. Fees do not affect ownership.
  - `"By Capital Invested"` — ownership = `capital` ÷ sum of `capital`, where `capital = committed − managementFee − otherFee`. Fees vary per investor, so equal commitments can yield different ownership.
  - `"Custom"` — ownership = each member's explicit `ownershipPercent` (0–100, set per row).
- `DELETE /api/spvs/:id/members/:memberId` - Remove a specific tranche from SPV
- `GET /api/portfolio` - Portfolio investments. Optional query params:
  - `?accountId=<id>` — investments owned directly by that account **plus** investments held by entities the account owns (via `entity_owners`, recursively). Non-admins may only request their own accountId
  - `?entityId=<id>` — investments held directly by that entity. Non-admins must own or manage the entity
  - No params: admin sees all; non-admin sees own + owned entities

### Entities
- `GET /api/entities` - List all entities with managers and owner count (supports ?search=)
- `GET /api/entities/:id` - Get single entity with managers and owner count
- `POST /api/entities` - Create new entity
- `PATCH /api/entities/:id` - Update entity
- `DELETE /api/entities/:id` - Delete entity (cascades owners/managers)
- `GET /api/entities/:id/owners` - List entity owners with account/entity info
- `POST /api/entities/:id/owners` - Add owner (body: ownerType, ownerAccountId/ownerEntityId, ownershipPercent, date)
- `DELETE /api/entities/:id/owners/:ownerId` - Remove owner
- `GET /api/entities/:id/managers` - List entity managers with account info
- `POST /api/entities/:id/managers` - Add manager (body: {accountId})
- `DELETE /api/entities/:id/managers/:accountId` - Remove manager

## Public Landing Page
- Route: `/org/:slug` — standalone page (no sidebar layout)
- Shows org info (name, description, website, location)
- Two flows: "New User" (create account + request access) or "Existing User" (sign in + request access)
- Invite flow: `/org/:slug?invite=TOKEN` — pre-approves membership on acceptance
- Success state shows "Access Granted" (invite) or "Request Submitted" (regular)

## Environment
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session secret

## Authentication & Authorization
- Session-based auth using express-session with connect-pg-simple store
- **Bearer token auth** for programmatic API clients — see "API Tokens" above. The `bearerAuth` middleware runs before all routes; if a valid `Authorization: Bearer ff_...` header is present, the request is treated as the token-owning account for the rest of the pipeline (including `requireAuth` and `requireAdmin`). Session cookies always win if both are present. Token CRUD (`GET/POST/DELETE /api/auth/tokens`) and `POST /api/auth/change-password` require a real session cookie — bearer tokens are rejected with 401, and token CRUD additionally requires the admin role (`requireSessionAdmin`).
- **OpenAPI spec** lives at `docs/openapi.yaml` and documents every REST endpoint, both auth methods, all schemas, and the admin/permission rules. Served at runtime as:
  - `GET /api/openapi.yaml` — raw YAML (source of truth)
  - `GET /api/openapi.json` — parsed JSON (best for LLM agents, SDK generators, Postman/Insomnia imports)
  - `GET /docs` — Redoc HTML viewer for humans
  All three are public (no auth) so external clients can discover the API before logging in.
- Login page at root when unauthenticated; session stored in PostgreSQL
- Auth endpoints: POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
- Public routes (no auth required): /api/auth/login, /api/auth/me, /api/organizations/by-slug/:slug, /api/invites/:token, /api/invites/:token/accept, /api/organizations/:id/members/request, POST /api/accounts
- All other /api routes require authentication (401 if not logged in)
- Only role: "admin" (GP and LP roles removed; fund manager/investor relationships determined by org/SPV/entity membership)
- **Admin** (role: "admin"): Full access to all resources, can create organizations
- **Non-admin**: Can only see own account, entities they manage, organizations they are member/organizer of, SPVs they are members of
- Admin-only actions: create/delete organizations, delete accounts, delete SPVs/entities
- Frontend: AuthProvider wraps app, useAuth() hook provides user/isAdmin/loginMutation/logoutMutation
- Sidebar hides admin-only items (Accounts) for non-admin users
- Header shows logged-in user name and Sign Out button
- Login page: client/src/pages/login.tsx
- Auth hook: client/src/hooks/use-auth.tsx

## Password Management
- **Forgot Password**: POST /api/auth/forgot-password (email) -- generates token, sends reset email via SMTP
- **Reset Password**: POST /api/auth/reset-password (token, password) -- validates token, updates password
- **Change Password**: POST /api/auth/change-password (currentPassword, newPassword) -- requires auth
- Reset tokens expire after 1 hour, single-use
- Email sent via nodemailer to SMTP server (smtp.ionos.com:465 SSL, from app@valantum.com)
- Frontend pages: /forgot-password, /reset-password?token=...
- Login page has "Forgot your password?" link
- DB table: password_reset_tokens (id, accountId, token, expiresAt, used, createdAt)
- Env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_FROM, SMTP_PASSWORD (secret)

## Key Implementation Details
- Password hashing uses bcrypt (hash stored in `password_hash` column)
- `passwordHash` is stripped from all API responses
- Seed data: 6 accounts (incl. isaac@conexo.vc as admin) with varied role assignments
- Frontend uses TanStack Query v5 for data fetching
- Frontend uses wouter for routing
- Organizations auto-generate slugs on creation (from name, URL-friendly)
- Organization detail has 5 tabs: Settings, Organizers, SPVs, Members, Invites
- Members tab shows pending/approved/rejected with approve/reject/remove actions
- Invites tab shows landing page URL, generate/copy invite links
- Only Admin can create/destroy organizations; both Admin and Organizer can manage org settings
