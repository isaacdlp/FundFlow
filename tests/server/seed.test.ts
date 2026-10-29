import { describe, it, expect, vi } from "vitest";
import { resolveSeedAdminPassword } from "../../server/seed";

describe("resolveSeedAdminPassword", () => {
  it("uses SEED_ADMIN_PASSWORD when set", () => {
    const log = vi.fn();
    expect(resolveSeedAdminPassword({ SEED_ADMIN_PASSWORD: "s3cret!", NODE_ENV: "production" }, log)).toBe("s3cret!");
    expect(log).not.toHaveBeenCalled();
  });

  it("throws in production when SEED_ADMIN_PASSWORD is missing", () => {
    expect(() => resolveSeedAdminPassword({ NODE_ENV: "production" }, vi.fn())).toThrow(/SEED_ADMIN_PASSWORD/);
  });

  it("generates and logs a random password in development", () => {
    const log = vi.fn();
    const first = resolveSeedAdminPassword({ NODE_ENV: "development" }, log);
    const second = resolveSeedAdminPassword({ NODE_ENV: "development" }, vi.fn());
    expect(first).toHaveLength(16);
    expect(first).not.toBe(second);
    expect(log).toHaveBeenCalledWith(expect.stringContaining(first));
  });
});
