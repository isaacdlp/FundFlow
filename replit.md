# FundFlow - VC/PE Fund Management Platform

## Overview
Multi-tenant fund management platform for VC and PE investments. Users can participate in different funds managed by different organizers. Organizations have public landing pages where users can request access or accept invite links.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (TypeScript)
- **Backend**: Express.js + Drizzle ORM (TypeScript)
- **Database**: PostgreSQL (Replit-managed)
- **Workflow**: `npm run dev` starts both Express API and Vite dev server

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
      dashboard.tsx       # Dashboard with stats overview
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
- `organizations` - Organizations with unique slug for public landing pages
- `organization_organizers` - Many-to-many organization-account associations (Organizer role)
- `organization_members` - Membership requests with status (pending/approved/rejected), optional inviteId
- `organization_invites` - Single-use invite tokens with used/usedByAccountId tracking
- `spvs` - Special Purpose Vehicles with full entity details (legal, address, bank, investment)
- `spv_members` - Many-to-many SPV-account associations

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
- `GET /api/spvs/:id/members` - List SPV members with account info
- `POST /api/spvs/:id/members` - Add member to SPV (body: {accountId})
- `DELETE /api/spvs/:id/members/:accountId` - Remove member from SPV

## Public Landing Page
- Route: `/org/:slug` — standalone page (no sidebar layout)
- Shows org info (name, description, website, location)
- Two flows: "New User" (create account + request access) or "Existing User" (sign in + request access)
- Invite flow: `/org/:slug?invite=TOKEN` — pre-approves membership on acceptance
- Success state shows "Access Granted" (invite) or "Request Submitted" (regular)

## Environment
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session secret

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
