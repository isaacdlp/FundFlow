import request from "supertest";
import type { Express } from "express";

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
