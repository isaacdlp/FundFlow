import { describe, it, expect } from "vitest";
import { accounts, vehicles, generateAccountCode, generateVehicleCode, generatePositionCode, insertVehicleSchema, ACCOUNT_CODE_PATTERN, VEHICLE_CODE_PATTERN, POSITION_CODE_PATTERN } from "../../shared/schema";

describe("generatePositionCode", () => {
  it("is the Vehicle's code, a hyphen and 4 characters from A-Z and 0-9", () => {
    for (let i = 0; i < 1000; i++) {
      const code = generatePositionCode("AJNN");
      expect(code).toMatch(POSITION_CODE_PATTERN);
      expect(code!.startsWith("AJNN-")).toBe(true);
    }
  });

  it("is null while the Vehicle has no code", () => {
    expect(generatePositionCode(null)).toBeNull();
  });
});

describe("generateVehicleCode", () => {
  it("produces 4 characters from A-Z and 0-9", () => {
    for (let i = 0; i < 1000; i++) {
      expect(generateVehicleCode()).toMatch(VEHICLE_CODE_PATTERN);
    }
  });

  it("is the column default, so every inserted Vehicle gets one", () => {
    expect(vehicles.code.defaultFn?.()).toMatch(VEHICLE_CODE_PATTERN);
  });

  it("can't be supplied on creation", () => {
    const data = insertVehicleSchema.parse({ organizationId: 1, legalName: "X", displayName: "X", dateEstablished: "2026-01-01", code: "ZQP7" });
    expect(data).not.toHaveProperty("code");
  });
});

describe("generateAccountCode", () => {
  it("produces 8 characters from A-Z and 0-9", () => {
    for (let i = 0; i < 1000; i++) {
      expect(generateAccountCode()).toMatch(ACCOUNT_CODE_PATTERN);
    }
  });

  it("can use every character of the alphabet", () => {
    const seen = new Set(Array.from({ length: 1000 }, generateAccountCode).join(""));
    expect(seen.size).toBe(36);
  });

  it("is the column default, so every inserted account gets one", () => {
    expect(accounts.code.defaultFn?.()).toMatch(ACCOUNT_CODE_PATTERN);
  });
});
