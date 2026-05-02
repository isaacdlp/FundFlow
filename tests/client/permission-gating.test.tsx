import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useOrgPermissions } from "@/hooks/use-org-permissions";
import { Button } from "@/components/ui/button";

const mockUseAuth = vi.fn();
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
  queryClient: undefined,
  getQueryFn: () => async () => null,
}));

/**
 * Component-level test that wires the REAL `useOrgPermissions` hook to a small
 * gated UI. This proves the actual gating pattern used across pages
 * ({canManageOrg(id) && <ActionButton />}) reacts correctly to admin status,
 * organizer membership, and outsider status — without being a tautological
 * test of `{cond && <Button>}`.
 */
function OrgActions({ orgId }: { orgId: number }) {
  const { canManageOrg } = useOrgPermissions();
  return (
    <div>
      <span data-testid="text-org-id">org {orgId}</span>
      {canManageOrg(orgId) && (
        <Button data-testid="button-manage">Manage</Button>
      )}
    </div>
  );
}

function renderWithOrgs(orgsResponse: unknown) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, queryFn: async () => orgsResponse },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<OrgActions orgId={10} />, { wrapper });
}

describe("permission-gated component (useOrgPermissions integration)", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it("admins always see the manage action", async () => {
    mockUseAuth.mockReturnValue({ user: { id: 1 }, isAdmin: true });
    renderWithOrgs([]);
    expect(await screen.findByTestId("button-manage")).toBeInTheDocument();
  });

  it("organizers of the org see the manage action", async () => {
    mockUseAuth.mockReturnValue({ user: { id: 7 }, isAdmin: false });
    renderWithOrgs([{ id: 10, organizers: [{ accountId: 7 }] }]);
    await waitFor(() => {
      expect(screen.getByTestId("button-manage")).toBeInTheDocument();
    });
  });

  it("plain members of the org do NOT see the manage action", async () => {
    mockUseAuth.mockReturnValue({ user: { id: 8 }, isAdmin: false });
    renderWithOrgs([{ id: 10, organizers: [{ accountId: 7 }] }]);
    // Wait for the query to settle, then assert the button never appeared.
    await waitFor(() => {
      expect(screen.getByTestId("text-org-id")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("button-manage")).not.toBeInTheDocument();
  });

  it("logged-out users do NOT see the manage action", () => {
    mockUseAuth.mockReturnValue({ user: null, isAdmin: false });
    renderWithOrgs([]);
    expect(screen.queryByTestId("button-manage")).not.toBeInTheDocument();
  });
});
