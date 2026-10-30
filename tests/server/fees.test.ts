import { describe, it, expect } from "vitest";
import { investorFeeDefaults, managementFeeAmount } from "@shared/fees";

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
