# FundFlow - VC/PE Fund Management Platform

## Overview
Multi-tenant fund management platform for VC and PE investments. Users can participate in different funds managed by different organizers.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (TypeScript)
- **Backend**: Express.js + Drizzle ORM (TypeScript)
- **Database**: PostgreSQL (Replit-managed)
- **Workflow**: `npm run dev` starts both Express API and Vite dev server

## User Roles
- **Admin**: Platform administrator with full access
- **GP (General Partner)**: Fund manager
- **LP (Limited Partner)**: Investor in funds
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
    lib/
      queryClient.ts      # TanStack Query configuration
server/
  index.ts                # Express entry point (seeds data on startup)
  routes.ts               # API routes for accounts and roles
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

## API Endpoints
- `GET /api/accounts` - List all accounts with roles (supports ?search= and ?role= query params)
- `GET /api/accounts/:id` - Get single account with roles
- `POST /api/accounts` - Create new account (requires password, firstName, lastName, email)
- `PATCH /api/accounts/:id` - Update account fields and/or roles
- `DELETE /api/accounts/:id` - Delete account (cascades to account_roles)
- `GET /api/roles` - List all roles

## Environment
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session secret

## Key Implementation Details
- Password hashing uses bcrypt (hash stored in `password_hash` column)
- `passwordHash` is stripped from all API responses
- Seed data: 5 sample accounts with varied role assignments
- Frontend uses TanStack Query v5 for data fetching
- Frontend uses wouter for routing
