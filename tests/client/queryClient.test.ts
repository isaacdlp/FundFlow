import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { apiRequest, getQueryFn } from "@/lib/queryClient";

const originalFetch = globalThis.fetch;

function mockJsonResponse(status: number, body: any) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "test",
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response;
}

describe("apiRequest", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as any;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends GET without body or content-type header", async () => {
    (globalThis.fetch as any).mockResolvedValue(mockJsonResponse(200, { ok: true }));
    const res = await apiRequest("GET", "/api/test");
    expect(res.ok).toBe(true);
    const init = (globalThis.fetch as any).mock.calls[0][1];
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe("include");
    expect(init.headers).toEqual({});
  });

  it("sends POST with JSON body and content-type header", async () => {
    (globalThis.fetch as any).mockResolvedValue(mockJsonResponse(201, { id: 1 }));
    const res = await apiRequest("POST", "/api/test", { foo: "bar" });
    expect(res.ok).toBe(true);
    const init = (globalThis.fetch as any).mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ foo: "bar" }));
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("throws with status + message on non-2xx response", async () => {
    (globalThis.fetch as any).mockResolvedValue(mockJsonResponse(500, "boom"));
    await expect(apiRequest("GET", "/api/test")).rejects.toThrow(/500: /);
  });
});

describe("getQueryFn", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as any;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns parsed JSON on success", async () => {
    (globalThis.fetch as any).mockResolvedValue(mockJsonResponse(200, { id: 7 }));
    const fn = getQueryFn<{ id: number }>({ on401: "throw" });
    const out = await fn({ queryKey: ["/api/x"] } as any);
    expect(out).toEqual({ id: 7 });
  });

  it("returns null on 401 when on401='returnNull'", async () => {
    (globalThis.fetch as any).mockResolvedValue(mockJsonResponse(401, "nope"));
    const fn = getQueryFn({ on401: "returnNull" });
    const out = await fn({ queryKey: ["/api/x"] } as any);
    expect(out).toBeNull();
  });

  it("throws on 401 when on401='throw'", async () => {
    (globalThis.fetch as any).mockResolvedValue(mockJsonResponse(401, "nope"));
    const fn = getQueryFn({ on401: "throw" });
    await expect(fn({ queryKey: ["/api/x"] } as any)).rejects.toThrow(/401: /);
  });

  it("joins hierarchical query keys with '/' as the URL", async () => {
    (globalThis.fetch as any).mockResolvedValue(mockJsonResponse(200, []));
    const fn = getQueryFn({ on401: "throw" });
    await fn({ queryKey: ["/api/orgs", 5, "members"] } as any);
    expect((globalThis.fetch as any).mock.calls[0][0]).toBe("/api/orgs/5/members");
  });
});
