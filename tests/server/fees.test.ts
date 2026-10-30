import { describe, it, expect } from "vitest";
import { entityFeeDefaults, investorFeeDefaults, managementFeeAmount } from "@shared/fees";

const terms = (managementFeePercent: string | null, successFeePercent: string | null) => ({ managementFeePercent, successFeePercent });

describe("investorFeeDefaults", () => {
  it("takes a member's own defaults", () => {
    expect(investorFeeDefaults([terms("5.00", "20.00")])).toEqual({ managementFeePercent: 5, successFeePercent: 20 });
  });

  it("has none without memberships or values", () => {
    expect(investorFeeDefaults([])).toEqual({ managementFeePercent: null, successFeePercent: null });
    expect(investorFeeDefaults([terms(null, null)])).toEqual({ managementFeePercent: null, successFeePercent: null });
  });

  it("takes the lowest of an entity's managers' defaults, fee by fee", () => {
    expect(investorFeeDefaults([terms("5.00", "20.00"), terms("7", "10.00")]))
      .toEqual({ managementFeePercent: 5, successFeePercent: 10 });
    // A manager without a default doesn't count as 0.
    expect(investorFeeDefaults([terms("5.00", null), terms(null, "20.00")]))
      .toEqual({ managementFeePercent: 5, successFeePercent: 20 });
  });
});

describe("managementFeeAmount", () => {
  it("is the percent of the commitment, to the cent", () => {
    expect(managementFeeAmount(100000, 5)).toBe("5000.00");
    expect(managementFeeAmount(12345.67, 4.76)).toBe("587.65");
    expect(managementFeeAmount(0, 5)).toBe("0.00");
  });
});

describe("entityFeeDefaults", () => {
  const terms = (managementFeePercent: string | null, successFeePercent: string | null) => ({ managementFeePercent, successFeePercent });

  it("prefers the entity's own terms, fee by fee, over its managers' lowest", () => {
    expect(entityFeeDefaults(terms("3.00", null), [terms("5.00", "20.00"), terms("7.00", "10.00")]))
      .toEqual({ managementFeePercent: 3, successFeePercent: 10 });
  });

  it("keeps an entity's own 0%", () => {
    expect(entityFeeDefaults(terms("0.00", "0.00"), [terms("5.00", "20.00")]))
      .toEqual({ managementFeePercent: 0, successFeePercent: 0 });
  });

  it("uses the managers' without a membership", () => {
    expect(entityFeeDefaults(undefined, [terms("5.00", "20.00")]))
      .toEqual({ managementFeePercent: 5, successFeePercent: 20 });
  });
});
