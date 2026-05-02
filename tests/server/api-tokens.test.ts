import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs, loginAsToken } from "./setup/auth-helper";

const mockStorage = makeMockStorage();

vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");
const { generateApiToken, hashApiToken, parseBearerToken } = await import("../../server/api-tokens");

describe("API tokens", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  // ─── Generator / hash / parser primitives ──────────────────────────────────
  describe("generateApiToken / hashApiToken / parseBearerToken", () => {
    it("emits the documented `ff_<48hex>` format with an 8-char prefix", () => {
      const { plaintext, prefix, hash } = generateApiToken();
      expect(plaintext).toMatch(/^ff_[0-9a-f]{48}$/);
      expect(prefix).toHaveLength(8);
      expect(plaintext.startsWith(`ff_${prefix}`)).toBe(true);
      expect(hash).toHaveLength(64); // sha256 hex
    });

    it("produces a unique token + hash on every call", () => {
      const a = generateApiToken();
      const b = generateApiToken();
      expect(a.plaintext).not.toBe(b.plaintext);
      expect(a.hash).not.toBe(b.hash);
    });

    it("hashApiToken is deterministic for the same input", () => {
      const t = "ff_" + "a".repeat(48);
      expect(hashApiToken(t)).toBe(hashApiToken(t));
    });

    it("parseBearerToken returns the token for a well-formed header", () => {
      const tok = "ff_" + "1".repeat(48);
      expect(parseBearerToken(`Bearer ${tok}`)).toBe(tok);
      expect(parseBearerToken(`bearer ${tok}`)).toBe(tok); // case-insensitive
    });

    it("parseBearerToken returns null for missing / malformed headers", () => {
      expect(parseBearerToken(undefined)).toBeNull();
      expect(parseBearerToken("")).toBeNull();
      expect(parseBearerToken("Basic abc")).toBeNull();
      expect(parseBearerToken("Bearer ")).toBeNull();
      expect(parseBearerToken("Bearer notourprefix_abcdef")).toBeNull();
      expect(parseBearerToken("Bearer ff_short")).toBeNull(); // too short
    });
  });

  // ─── GET /api/auth/tokens ─────────────────────────────────────────────────
  describe("GET /api/auth/tokens", () => {
    it("requires authentication", async () => {
      const res = await request(app).get("/api/auth/tokens");
      expect(res.status).toBe(401);
    });

    it("lists tokens for the authenticated account (without hashes)", async () => {
      // The real DatabaseStorage.listApiTokensForAccount strips tokenHash before
      // returning, so the route trusts whatever storage hands back. We mirror
      // that contract here by stripping the hash from the fixtures.
      const tokens = [
        fixtures.apiToken({ id: 1, name: "Laptop", prefix: "aaaabbbb" }),
        fixtures.apiToken({ id: 2, name: "CI", prefix: "ccccdddd" }),
      ].map(({ tokenHash: _h, ...rest }) => rest);
      mockStorage.listApiTokensForAccount.mockResolvedValue(tokens);

      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent.get("/api/auth/tokens");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).not.toHaveProperty("tokenHash");
      expect(mockStorage.listApiTokensForAccount).toHaveBeenCalledWith(fixtures.memberAccount.id);
    });

    it("works for bearer-authenticated callers (lists their own tokens)", async () => {
      mockStorage.listApiTokensForAccount.mockResolvedValue([]);
      const plaintext = "ff_" + "1".repeat(48);
      const agent = loginAsToken(app, mockStorage, fixtures.memberAccount, plaintext);

      const res = await agent.get("/api/auth/tokens");

      expect(res.status).toBe(200);
      expect(mockStorage.listApiTokensForAccount).toHaveBeenCalledWith(fixtures.memberAccount.id);
    });
  });

  // ─── POST /api/auth/tokens ────────────────────────────────────────────────
  describe("POST /api/auth/tokens", () => {
    it("requires authentication", async () => {
      const res = await request(app).post("/api/auth/tokens").send({ name: "x" });
      expect(res.status).toBe(401);
    });

    it("rejects an empty name", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent.post("/api/auth/tokens").send({ name: "" });
      expect(res.status).toBe(400);
    });

    it("rejects a non-positive expiresInDays", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent.post("/api/auth/tokens").send({ name: "x", expiresInDays: 0 });
      expect(res.status).toBe(400);
    });

    it("creates a token, returns the plaintext exactly once, and persists only the hash", async () => {
      // Real DatabaseStorage.createApiToken strips tokenHash from its return
      // value (PublicApiToken type) — mirror that contract in the mock.
      mockStorage.createApiToken.mockImplementation(
        async (accountId: number, name: string, prefix: string, _hash: string, expiresAt: Date | null) => {
          const { tokenHash: _h, ...rest } = fixtures.apiToken({ accountId, name, prefix, expiresAt });
          return rest;
        },
      );

      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent.post("/api/auth/tokens").send({ name: "Laptop" });

      expect(res.status).toBe(201);
      expect(res.body.token).toMatch(/^ff_[0-9a-f]{48}$/);
      expect(res.body.name).toBe("Laptop");
      expect(res.body).not.toHaveProperty("tokenHash");

      // Verify storage received the SHA-256 hash, never the plaintext
      const [accountId, name, prefix, hash, expiresAt] = mockStorage.createApiToken.mock.calls[0];
      expect(accountId).toBe(fixtures.memberAccount.id);
      expect(name).toBe("Laptop");
      expect(prefix).toBe(res.body.token.slice(3, 11));
      expect(hash).toBe(hashApiToken(res.body.token));
      expect(hash).not.toBe(res.body.token);
      expect(expiresAt).toBeNull();
    });

    it("computes expiresAt from expiresInDays (~ N days in the future)", async () => {
      mockStorage.createApiToken.mockImplementation(
        async (_a: number, name: string, prefix: string, _h: string, expiresAt: Date | null) =>
          fixtures.apiToken({ name, prefix, expiresAt }),
      );

      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const before = Date.now();
      const res = await agent.post("/api/auth/tokens").send({ name: "30d", expiresInDays: 30 });
      const after = Date.now();

      expect(res.status).toBe(201);
      const expiresAt = mockStorage.createApiToken.mock.calls[0][4] as Date;
      const target = 30 * 24 * 60 * 60 * 1000;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + target - 100);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + target + 100);
    });

    it("blocks bearer-authenticated callers from minting more tokens", async () => {
      const plaintext = "ff_" + "2".repeat(48);
      const agent = loginAsToken(app, mockStorage, fixtures.memberAccount, plaintext);

      const res = await agent.post("/api/auth/tokens").send({ name: "Sneaky" });

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/session/i);
      expect(mockStorage.createApiToken).not.toHaveBeenCalled();
    });
  });

  // ─── DELETE /api/auth/tokens/:id ──────────────────────────────────────────
  describe("DELETE /api/auth/tokens/:id", () => {
    it("requires authentication", async () => {
      const res = await request(app).delete("/api/auth/tokens/1");
      expect(res.status).toBe(401);
    });

    it("rejects a non-numeric id", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent.delete("/api/auth/tokens/abc");
      expect(res.status).toBe(400);
    });

    it("returns 404 if storage reports no row was revoked", async () => {
      mockStorage.revokeApiToken.mockResolvedValue(false);
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);

      const res = await agent.delete("/api/auth/tokens/42");

      expect(res.status).toBe(404);
      expect(mockStorage.revokeApiToken).toHaveBeenCalledWith(42, fixtures.memberAccount.id);
    });

    it("revokes a token owned by the caller", async () => {
      mockStorage.revokeApiToken.mockResolvedValue(true);
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);

      const res = await agent.delete("/api/auth/tokens/7");

      expect(res.status).toBe(200);
      expect(mockStorage.revokeApiToken).toHaveBeenCalledWith(7, fixtures.memberAccount.id);
    });

    it("scopes revocation to the caller's accountId (cannot revoke other users' tokens)", async () => {
      mockStorage.revokeApiToken.mockResolvedValue(false);
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);

      const res = await agent.delete("/api/auth/tokens/999");

      expect(res.status).toBe(404);
      // Storage was asked with the caller's accountId — DB-level WHERE prevents cross-tenant revocation
      expect(mockStorage.revokeApiToken).toHaveBeenCalledWith(999, fixtures.memberAccount.id);
    });

    it("blocks bearer-authenticated callers from revoking tokens", async () => {
      const plaintext = "ff_" + "3".repeat(48);
      const agent = loginAsToken(app, mockStorage, fixtures.memberAccount, plaintext);

      const res = await agent.delete("/api/auth/tokens/1");

      expect(res.status).toBe(401);
      expect(mockStorage.revokeApiToken).not.toHaveBeenCalled();
    });
  });

  // ─── Bearer-auth integration with arbitrary protected endpoints ───────────
  describe("bearer auth on protected endpoints", () => {
    it("authenticates a request to /api/auth/me with a valid bearer token", async () => {
      const plaintext = "ff_" + "4".repeat(48);
      const agent = loginAsToken(app, mockStorage, fixtures.memberAccount, plaintext);

      const res = await agent.get("/api/auth/me");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(fixtures.memberAccount.id);
      expect(res.body).not.toHaveProperty("passwordHash");
    });

    it("inherits admin role via the token (can hit admin-only routes)", async () => {
      // DELETE /api/accounts/:id is gated by `requireAdmin`, so an admin-owned
      // token must be allowed through. We mock deleteAccount(true) so the
      // route returns 200 once the admin gate passes.
      const plaintext = "ff_" + "5".repeat(48);
      mockStorage.deleteAccount.mockResolvedValue(true);
      const agent = loginAsToken(app, mockStorage, fixtures.adminAccount, plaintext);

      const res = await agent.delete("/api/accounts/123");

      expect(res.status).toBe(200);
      expect(mockStorage.deleteAccount).toHaveBeenCalledWith(123);
    });

    it("non-admin token cannot reach admin-only routes (403, not 401)", async () => {
      const plaintext = "ff_" + "6".repeat(48);
      const agent = loginAsToken(app, mockStorage, fixtures.memberAccount, plaintext);

      const res = await agent.delete("/api/accounts/123");

      expect(res.status).toBe(403);
      expect(mockStorage.deleteAccount).not.toHaveBeenCalled();
    });

    it("rejects an unknown bearer token (falls through to 401)", async () => {
      mockStorage.getApiTokenByHash.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer ff_" + "7".repeat(48));

      expect(res.status).toBe(401);
    });

    it("rejects a revoked token", async () => {
      const plaintext = "ff_" + "8".repeat(48);
      const tokenHash = hashApiToken(plaintext);
      mockStorage.getApiTokenByHash.mockResolvedValue({
        id: 1,
        accountId: fixtures.memberAccount.id,
        name: "Revoked",
        prefix: "deadbeef",
        tokenHash,
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: new Date(),
        createdAt: new Date(),
      });

      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${plaintext}`);

      expect(res.status).toBe(401);
    });

    it("rejects an expired token", async () => {
      const plaintext = "ff_" + "9".repeat(48);
      const tokenHash = hashApiToken(plaintext);
      mockStorage.getApiTokenByHash.mockResolvedValue({
        id: 1,
        accountId: fixtures.memberAccount.id,
        name: "Expired",
        prefix: "feedface",
        tokenHash,
        lastUsedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        createdAt: new Date(),
      });

      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${plaintext}`);

      expect(res.status).toBe(401);
    });

    it("touches lastUsedAt on a successful bearer request (fire-and-forget)", async () => {
      const plaintext = "ff_" + "a".repeat(48);
      const agent = loginAsToken(app, mockStorage, fixtures.memberAccount, plaintext);

      await agent.get("/api/auth/me");

      // Allow the fire-and-forget promise to run
      await new Promise((r) => setImmediate(r));
      expect(mockStorage.touchApiTokenLastUsed).toHaveBeenCalledWith(999);
    });

    it("ignores a malformed Authorization header silently (still 401, no DB lookup)", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "NotBearer foo");

      expect(res.status).toBe(401);
      expect(mockStorage.getApiTokenByHash).not.toHaveBeenCalled();
    });

    it("rejects a token whose underlying account no longer exists", async () => {
      // Token row exists and is valid, but getAccount returns null (deleted).
      const plaintext = "ff_" + "b".repeat(48);
      const tokenHash = hashApiToken(plaintext);
      mockStorage.getApiTokenByHash.mockResolvedValue({
        id: 1,
        accountId: 9999,
        name: "Orphan",
        prefix: "deadbeef",
        tokenHash,
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
        createdAt: new Date(),
      });
      mockStorage.getAccount.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${plaintext}`);

      expect(res.status).toBe(401);
      expect(mockStorage.touchApiTokenLastUsed).not.toHaveBeenCalled();
    });

    it("blocks bearer-authenticated callers from changing the account password", async () => {
      // Critical: a leaked API token must not be able to lock the user out
      // by changing their password. Only session-authenticated callers can
      // hit /api/auth/change-password.
      const plaintext = "ff_" + "c".repeat(48);
      const agent = loginAsToken(app, mockStorage, fixtures.memberAccount, plaintext);

      const res = await agent
        .post("/api/auth/change-password")
        .send({ currentPassword: "old", newPassword: "newpass" });

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/session/i);
      expect(mockStorage.updatePassword).not.toHaveBeenCalled();
    });
  });
});
