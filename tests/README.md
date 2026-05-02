# FundFlow Test Framework

Three layers of automated tests, all runnable from the command line.

## Layout

```
tests/
  server/                 # Backend integration tests (Vitest + Supertest)
    setup/
      test-app.ts         # Builds an isolated Express app for each test
      mock-storage.ts     # Mock IStorage factory + shared fixtures
    auth.test.ts
    organizations-permissions.test.ts
  client/                 # Frontend tests (Vitest + jsdom + React Testing Library)
    setup.ts              # jest-dom matchers + cleanup
    use-org-permissions.test.tsx
    permission-gating.test.tsx
  e2e/                    # End-to-end browser tests (Playwright)
    permissions.spec.ts
```

Configs live at the repo root: `vitest.config.ts` (with `test.projects` for server + client), `playwright.config.ts`, `tests/tsconfig.json`.

## Running tests

A helper script wraps the most common commands:

```bash
scripts/test.sh             # unit + integration (server + client)
scripts/test.sh server      # backend only
scripts/test.sh client      # frontend only
scripts/test.sh watch       # vitest watch mode
scripts/test.sh e2e         # Playwright (browsers must be installed first)
scripts/test.sh all         # everything, including e2e
```

Or call the runners directly:

```bash
npx vitest run                          # all unit/integration
npx vitest run --project server         # one project
npx vitest                              # watch mode
npx vitest --ui                         # interactive UI

npx playwright install chromium         # one-time browser download
npx playwright test                     # E2E suite
npx playwright test --headed            # see the browser
npx playwright show-report              # open the last HTML report
```

## How the layers fit together

### Backend (`tests/server`)

- Each test file mocks `server/storage` with `vi.mock(...)` so that route handlers
  can be tested in isolation without a real database.
- `createTestApp()` returns a fresh Express app with an in-memory session store,
  the same routes as production, and no Vite/static layer.
- Use `request.agent(app)` from Supertest to persist the session cookie across
  multiple calls (e.g. login then GET /api/auth/me).
- Override storage behavior per test with `mockStorage.someMethod.mockResolvedValue(...)`.

### Frontend (`tests/client`)

- Runs under jsdom; matchers come from `@testing-library/jest-dom`.
- Hooks are exercised with `renderHook` from React Testing Library and a
  manually-constructed `QueryClient` so React Query calls resolve deterministically.
- Use the path aliases `@/...` and `@shared/...` exactly as in the app source.

### E2E (`tests/e2e`)

- Playwright launches Chromium against the running dev server (auto-started by
  the `webServer` config) and exercises the real React + Express stack.
- **Required env vars** (no hard-coded fallbacks — tests fail fast if missing):
  - `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` — an account with the `admin` role
  - `E2E_MEMBER_EMAIL`, `E2E_MEMBER_PASSWORD` — a non-admin account that is a
    member (not an organizer) of at least one organization
- Set `E2E_BASE_URL=https://...` to test a deployed environment instead of the
  local dev server.

#### Data seeding for E2E

E2E tests assume the target database already has the two accounts above and at
least one organization the member account belongs to. Two ways to satisfy this:

1. **Local dev DB** — the existing `storage.seedData()` call in `server/index.ts`
   runs at startup. Create the test accounts once via the UI or `psql`, grant
   membership through the admin UI, then export the credentials before running.
2. **Per-suite setup** — extend `tests/e2e/` with a Playwright global setup
   (`globalSetup` in `playwright.config.ts`) that POSTs to `/api/accounts`,
   `/api/organizations`, and `/api/organizations/:id/members/request` to create
   fixtures, and a global teardown that removes them. This is the recommended
   path for CI to keep tests deterministic.

A starter `globalSetup` is intentionally not included — pick the seeding
strategy that matches your environment (local dev DB vs. ephemeral CI DB).

## Writing new tests

**Backend** — copy an existing file in `tests/server/`. Keep storage mocks
narrow: only stub the methods the route under test calls. Use `beforeEach` to
reset the mock state with `Object.assign(mockStorage, makeMockStorage())`.

**Frontend** — for components that fetch data, wrap them in a `QueryClientProvider`
with a test `QueryClient` whose default `queryFn` returns canned data. For
components that use `wouter`, wrap them with `<Router base="">` from `wouter`
or just stub `useLocation`/`Link` if needed.

**E2E** — prefer `data-testid` selectors over text or CSS, and make assertions
on visibility/count rather than DOM structure. Each test should own its setup
(login, navigation) so it can run in isolation.

## CI considerations

- `scripts/test.sh` exits non-zero on failure, so it can be wired into any CI runner.
- For e2e in CI, install browsers ahead of time with
  `npx playwright install --with-deps chromium` and set `CI=1` so the config
  enables retries and `forbidOnly`.
