import { describe, it, expect } from "vitest";
import { fmtMoney } from "@/lib/format";

// fr-FR uses a narrow no-break space (U+202F) as its thousands separator.
const NNBSP = " ";

describe("fmtMoney", () => {
  it("always shows the thousands separator, including 4-digit amounts in Spanish", () => {
    // es-ES omits grouping below 10,000 by default ("8075,00"); we force it.
    expect(fmtMoney(8075, "es")).toBe("8.075,00");
    expect(fmtMoney(18075, "es")).toBe("18.075,00");
  });

  it("formats English and French with their own separators", () => {
    expect(fmtMoney(8075, "en")).toBe("8,075.00");
    expect(fmtMoney(8075, "fr")).toBe(`8${NNBSP}075,00`);
  });

  it("does not add a separator below 1,000", () => {
    expect(fmtMoney(807.5, "es")).toBe("807,50");
    expect(fmtMoney(807.5, "en")).toBe("807.50");
  });

  it("keeps two decimals", () => {
    expect(fmtMoney(1234567.891, "en")).toBe("1,234,567.89");
    expect(fmtMoney(0, "es")).toBe("0,00");
  });
});
