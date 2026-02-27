# FundFlow - VC/PE Fund Management Platform

## Overview
Multi-tenant fund management platform for VC and PE investments. Users can participate in different funds managed by different organizers.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (TypeScript)
- **Backend**: Python Flask (API server on port 8000)
- **Proxy**: Express.js proxies `/api/*` requests to Flask backend
- **Database**: PostgreSQL (Replit-managed)
- **Workflow**: `bash start.sh` starts both Flask and Node.js/Vite

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
      accounts.tsx        # User accounts list
      account-detail.tsx  # User profile detail/edit
      create-account.tsx  # New account creation form
    lib/
      queryClient.ts      # TanStack Query configuration
server/
  python/
    app.py                # Flask API backend
  index.ts                # Express entry point
  routes.ts               # API proxy to Flask
  vite.ts                 # Vite dev server setup (DO NOT MODIFY)
shared/
  schema.ts               # TypeScript interfaces
start.sh                  # Startup script for both servers
```

## Database Tables
- `users` - User accounts with personal info and address
- `roles` - Role definitions (admin, gp, lp)
- `user_roles` - Many-to-many user-role associations

## API Endpoints
- `GET /api/users` - List all users with roles
- `GET /api/users/:id` - Get single user with roles
- `POST /api/users` - Create new user
- `PATCH /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user
- `GET /api/roles` - List all roles

## Environment
- `DATABASE_URL` - PostgreSQL connection string
- `FLASK_PORT` - Flask server port (default: 8000)
- `SESSION_SECRET` - Session secret
