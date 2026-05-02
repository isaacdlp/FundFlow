import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/hooks/use-auth";

const mockApiRequest = vi.fn();
const mockGetQueryFn = vi.fn();

vi.mock("@/lib/queryClient", async () => {
  const real = await vi.importActual<any>("@/lib/queryClient");
  const qc = real.queryClient;
  return {
    ...real,
    apiRequest: (...args: any[]) => mockApiRequest(...args),
    getQueryFn: (...args: any[]) => mockGetQueryFn(...args),
    queryClient: qc,
  };
});

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe("useAuth", () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
    mockGetQueryFn.mockReset();
  });

  it("returns null user when /me fetch returns null", async () => {
    mockGetQueryFn.mockReturnValue(async () => null);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.isAdmin).toBe(false);
  });

  it("isAdmin is true when /me returns an admin role", async () => {
    mockGetQueryFn.mockReturnValue(async () => ({
      id: 1,
      email: "a",
      firstName: "A",
      lastName: "B",
      roles: [{ id: 1, name: "admin", description: "" }],
    }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.user).not.toBeNull());
    expect(result.current.isAdmin).toBe(true);
  });

  it("isAdmin is false when user has no admin role", async () => {
    mockGetQueryFn.mockReturnValue(async () => ({
      id: 2,
      email: "m",
      firstName: "M",
      lastName: "M",
      roles: [{ id: 2, name: "lp", description: "" }],
    }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.user).not.toBeNull());
    expect(result.current.isAdmin).toBe(false);
  });

  it("login mutation calls apiRequest with credentials", async () => {
    mockGetQueryFn.mockReturnValue(async () => null);
    mockApiRequest.mockResolvedValue({
      json: async () => ({
        id: 1,
        email: "a",
        firstName: "A",
        lastName: "B",
        roles: [{ id: 1, name: "admin", description: "" }],
      }),
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await result.current.loginMutation.mutateAsync({
        email: "a@b",
        password: "secret",
      });
    });

    expect(mockApiRequest).toHaveBeenCalledWith("POST", "/api/auth/login", {
      email: "a@b",
      password: "secret",
    });
  });

  it("logout mutation calls apiRequest", async () => {
    mockGetQueryFn.mockReturnValue(async () => null);
    mockApiRequest.mockResolvedValue({ json: async () => ({}) });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await result.current.logoutMutation.mutateAsync();
    });

    expect(mockApiRequest).toHaveBeenCalledWith("POST", "/api/auth/logout");
  });

  it("throws when used outside an AuthProvider", () => {
    // React logs the error to console.error via its error boundary; silence it
    // for this one test so the output stays clean.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const qc = new QueryClient();
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      );
      expect(() => renderHook(() => useAuth(), { wrapper })).toThrow(
        /AuthProvider/i,
      );
    } finally {
      errSpy.mockRestore();
    }
  });
});
