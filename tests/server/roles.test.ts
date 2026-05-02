import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

describe("GET /api/roles", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/roles");
    expect(res.status).toBe(401);
  });

  it("returns the role list to any authenticated user", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
    mockStorage.getRoles.mockResolvedValue([
      { id: 1, name: "admin", description: "Administrator" },
      { id: 2, name: "gp", description: "General Partner" },
      { id: 3, name: "lp", description: "Limited Partner" },
    ]);
    const res = await agent.get("/api/roles");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });
});
