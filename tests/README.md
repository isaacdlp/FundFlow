# FundFlow Test Framework

Three layers of automated tests, all runnable from the command line.

## Layout

```
tests/
  server/                 # Backend integration tests (Vitest + Supertest)
    setup/
      test-app.ts         # Builds an isolated Express app for each test
      mock-storage.ts     # Mock IStorage factory + shared fixtures
      auth-helper.ts      # `loginAs(...)` (session) and `loginAsToken(...)` (bearer) helpers
    auth.test.ts          # /api/auth/login, /logout, /me
    accounts.test.ts      # CRUD + role/permission gating + search
    roles.test.ts         # GET /api/roles
    organizations.test.ts # CRUD, by-slug (public), member/admin gating
    organizers.test.ts    # add/remove organizers
    members.test.ts       # request (public), list, approve/reject, remove
    invites.test.ts       # public GET/accept + authenticated list/create
    spvs.test.ts          # CRUD, list-all vs by-org, member-vs-admin scope
    spv-members.test.ts   # add/edit/remove account- and entity-investors
    portfolio.test.ts     # admin/owner/manager scoping + filter validation
    entities.test.ts      # CRUD + manager/owner gating
    entity-owners.test.ts # owner add/remove + payload validation
    entity-managers.test.ts # manager add/remove
    password-reset.test.ts # forgot/reset + change-password
    api-tokens.test.ts    # generator/hash/parser primitives + admin-only token CRUD (non-admin → 403, bearer → 401) + bearer auth on protected routes
    documents.test.ts     # multipart upload, list visibility (admin vs non-admin), download/delete gating, /api/settings/documents-path admin gating, folderPath traversal sanitization
  client/                 # Frontend tests (Vitest + jsdom + RTL)
    setup.ts              # jest-dom matchers + cleanup
    use-org-permissions.test.tsx
    use-auth.test.tsx     # login/logout mutations + isAdmin derivation
    permission-gating.test.tsx
    queryClient.test.ts   # apiRequest + getQueryFn (401 behavior, key joining)
    utils.test.ts         # cn() helper
  e2e/                    # End-to-end browser tests (Playwright)
    auth.spec.ts          # login success/failure, forgot-password reachability
    permissions.spec.ts   # admin vs member visibility on /accounts, /organizations
```

Configs live at the repo root: `vitest.config.ts` (with `test.projects` for server + client), `playwright.config.ts`, `tests/tsconfig.json`.

## Coverage at a glance

- **Backend**: every route in `server/routes.ts` (~50 endpoints) has at least one happy-path and one negative-path test, including auth gating (401), role gating (403 for non-admin where required), validation errors (400), missing-resource handling (404), conflict handling (409 for unique-key violations), and gone-status (410 for used invites). Permission helpers (`isAdmin`, `requireAdmin`, `canManageSpv`, `getOrganizationIdsForAccount`, `getEntityIdsForAccount`, `getSpvIdsForAccount`, `getEntityIdsOwnedByAccount`) are exercised through real route invocations rather than direct unit tests so behavior is verified end-to-end through the Express middleware chain.
- **Frontend**: hooks (`useAuth`, `useOrgPermissions`), library helpers (`apiRequest`, `getQueryFn`, `cn`), and at least one component-level gating test. Add component tests by following the `permission-gating.test.tsx` pattern.
- **E2E**: real-stack happy paths only (login, role-based UI visibility). Heavy data flows are covered at the integration layer instead of E2E to keep the browser suite fast and deterministic.

## Running tests

```bash
npm test              # all unit + integration (server + client)
npm run test:server   # backend only
npm run test:client   # frontend only
npm run test:watch    # vitest watch mode
npm run test:ui       # interactive vitest UI
npm run test:e2e      # Playwright (requires `npx playwright install chromium`)
npm run test:all      # vitest + playwright

# or directly:
npx vitest run --project server
npx vitest --ui
npx playwright test --headed
```

`scripts/test.sh` wraps the same commands for environments that don't have npm scripts available.

## How the layers fit together

### Backend (`tests/server`)

- Each test file mocks `server/storage` (and `server/email`) with `vi.mock(...)` so route handlers can be tested in isolation without a real database or SMTP server.
- A handful of routes (currently `documents.ts`) reach past `IStorage` and use the raw Drizzle `db` client and the filesystem directly. Those tests extend the same `vi.mock("../../server/storage", ...)` to also export a chainable `db` mock (`queueSelect([...])` / `queueInsertReturning([...])`) and stub `fs`/`fs/promises` so multipart uploads never touch disk. See `tests/server/documents.test.ts` for the pattern.
- `createTestApp()` returns a fresh Express app with an in-memory session store, the same routes as production, and no Vite/static layer.
- `loginAs(app, mockStorage, account)` returns a Supertest agent with the session cookie attached. It primes `getAccountByEmail`, `verifyPassword`, and `getAccount` so the subsequent `requireAuth` lookups succeed.
- Override storage behavior per test with `mockStorage.someMethod.mockResolvedValue(...)`. When you need different return values for the same method based on input (e.g. `getAccount` returning the logged-in admin for one ID and a different account for another), use `.mockImplementation(async (id) => ...)`.
- Use `beforeEach(() => Object.assign(mockStorage, makeMockStorage()))` to reset all mocks between tests.

### Frontend (`tests/client`)

- Runs under jsdom; matchers come from `@testing-library/jest-dom`.
- Hooks are exercised with `renderHook` from React Testing Library and a manually-constructed `QueryClient` so React Query calls resolve deterministically.
- Mock `@/lib/queryClient` to control what `apiRequest` and `getQueryFn` return without hitting the network.
- Use the path aliases `@/...` and `@shared/...` exactly as in the app source.

### E2E (`tests/e2e`)

- Playwright launches Chromium against the running dev server (auto-started by the `webServer` config) and exercises the real React + Express stack.
- **Required env vars** (no hard-coded fallbacks — tests fail fast if missing):
  - `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` — an account with the `admin` role
  - `E2E_MEMBER_EMAIL`, `E2E_MEMBER_PASSWORD` — a non-admin account that is a member (not an organizer) of at least one organization
- Set `E2E_BASE_URL=https://...` to test a deployed environment instead of the local dev server.

#### Data seeding for E2E

E2E tests assume the target database already has the two accounts above and at least one organization the member account belongs to. Two ways to satisfy this:

1. **Local dev DB** — the existing `storage.seedData()` call in `server/index.ts` runs at startup. Create the test accounts once via the UI or `psql`, grant membership through the admin UI, then export the credentials before running.
2. **Per-suite setup** — extend `tests/e2e/` with a Playwright global setup (`globalSetup` in `playwright.config.ts`) that POSTs to `/api/accounts`, `/api/organizations`, and `/api/organizations/:id/members/request` to create fixtures, and a global teardown that removes them. This is the recommended path for CI to keep tests deterministic.

A starter `globalSetup` is intentionally not included — pick the seeding strategy that matches your environment (local dev DB vs. ephemeral CI DB).

## Writing new tests

**Backend** — copy an existing file in `tests/server/`. Keep storage mocks narrow: only stub the methods the route under test calls. Use `beforeEach` to reset the mock state with `Object.assign(mockStorage, makeMockStorage())`. Use `loginAs` for authenticated routes; for public routes, call Supertest directly without the agent.

**Frontend** — for components that fetch data, wrap them in a `QueryClientProvider` with a test `QueryClient` whose default `queryFn` returns canned data. For components that use `wouter`, wrap them with `<Router base="">` from `wouter` or just stub `useLocation`/`Link` if needed.

**E2E** — prefer `data-testid` selectors over text or CSS, and make assertions on visibility/count rather than DOM structure. Each test should own its setup (login, navigation) so it can run in isolation.

## Known noise

When the `useAuth` test verifies that the hook throws outside a provider, React 18's error-boundary path writes the error to `console.error` from inside the renderer. This bypasses `vi.spyOn`-style suppression in some cases, so you may see two `Error: useAuth must be used within an AuthProvider` stack traces in the output even when all tests pass. They're cosmetic.

## CI considerations

- `npm test` and `scripts/test.sh` exit non-zero on failure, so they can be wired into any CI runner.
- For e2e in CI, install browsers ahead of time with `npx playwright install --with-deps chromium` and set `CI=1` so the config enables retries and `forbidOnly`.
