import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useOrgPermissions } from "@/hooks/use-org-permissions";

const mockUseAuth = vi.fn();
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
  queryClient: undefined,
  getQueryFn: () => async () => null,
}));

function makeWrapper(orgsResponse: any) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async () => orgsResponse,
      },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("useOrgPermissions", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it("returns canManageOrg=false and isAdmin=false when no user", () => {
    mockUseAuth.mockReturnValue({ user: null, isAdmin: false });
    const wrapper = makeWrapper([]);
    const { result } = renderHook(() => useOrgPermissions(), { wrapper });

    expect(result.current.isAdmin).toBe(false);
    expect(result.current.canManageOrg(1)).toBe(false);
    expect(result.current.canManageOrg(null)).toBe(false);
  });

  it("returns true for any orgId when user is admin", () => {
    mockUseAuth.mockReturnValue({
      user: { id: 99, email: "a@b" },
      isAdmin: true,
    });
    const wrapper = makeWrapper([]);
    const { result } = renderHook(() => useOrgPermissions(), { wrapper });

    expect(result.current.canManageOrg(1)).toBe(true);
    expect(result.current.canManageOrg(123)).toBe(true);
    expect(result.current.canManageOrg(null)).toBe(true);
  });

  it("returns true only for orgs where the user is listed as an organizer", async () => {
    const user = { id: 7, email: "u@b" };
    mockUseAuth.mockReturnValue({ user, isAdmin: false });

    const orgs = [
      { id: 10, organizers: [{ accountId: 7 }] },
      { id: 11, organizers: [{ accountId: 8 }] },
      { id: 12, organizers: [] },
    ];
    const wrapper = makeWrapper(orgs);
    const { result } = renderHook(() => useOrgPermissions(), { wrapper });

    await waitFor(() => {
      expect(result.current.canManageOrg(10)).toBe(true);
    });
    expect(result.current.canManageOrg(11)).toBe(false);
    expect(result.current.canManageOrg(12)).toBe(false);
    expect(result.current.canManageOrg(999)).toBe(false);
  });
});
