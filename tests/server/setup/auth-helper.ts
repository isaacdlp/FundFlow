import request from "supertest";
import type { Express } from "express";
import { hashApiToken } from "../../../server/api-tokens";

/**
 * Logs in a request agent as the given account by stubbing the storage methods
 * `login` calls and POSTing to /api/auth/login. Returns the agent with the
 * session cookie attached for follow-up requests.
 *
 * The mock storage object is shared with the test, so this also primes
 * `getAccount` to return the same account for downstream `requireAuth` checks.
 */
export async function loginAs(app: Express, mockStorage: any, account: any) {
  mockStorage.getAccountByEmail.mockResolvedValue(account);
  mockStorage.verifyPassword.mockResolvedValue(true);
  mockStorage.getAccount.mockResolvedValue(account);

  const agent = request.agent(app);
  await agent
    .post("/api/auth/login")
    .send({ email: account.email, password: "x" })
    .expect(200);
  return agent;
}

/**
 * Returns a supertest agent pre-configured to send an `Authorization: Bearer`
 * header on every request, simulating a third-party API client. Also primes
 * the mock storage so `bearerAuth` resolves the plaintext token to the given
 * account, and `getAccount` returns it for downstream `requireAdmin` checks.
 *
 * The plaintext token is the literal string a user would have copy-pasted from
 * the create-token API response.
 */
export function loginAsToken(app: Express, mockStorage: any, account: any, plaintext: string) {
  const tokenHash = hashApiToken(plaintext);
  mockStorage.getApiTokenByHash.mockImplementation(async (h: string) =>
    h === tokenHash
      ? { id: 999, accountId: account.id, name: "Test", prefix: plaintext.slice(3, 11), tokenHash, lastUsedAt: null, expiresAt: null, revokedAt: null, createdAt: new Date() }
      : null,
  );
  mockStorage.getAccount.mockResolvedValue(account);

  // Wrap supertest so every call carries the bearer header.
  const agent = request(app);
  return new Proxy(agent, {
    get(target: any, prop: string) {
      const orig = target[prop];
      if (typeof orig !== "function") return orig;
      if (!["get", "post", "put", "patch", "delete", "head"].includes(prop)) return orig.bind(target);
      return (...args: any[]) => orig.apply(target, args).set("Authorization", `Bearer ${plaintext}`);
    },
  });
}
