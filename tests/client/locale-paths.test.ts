import { describe, it, expect } from "vitest";
import { localizeBarePath } from "@/i18n/routes";

describe("localizeBarePath", () => {
  it("keeps English paths and the query string", () => {
    expect(localizeBarePath("/org/acme?invite=abc", "en")).toBe("/en/org/acme?invite=abc");
  });

  it("translates bare invite links into the target locale's route", () => {
    expect(localizeBarePath("/org/acme?invite=abc", "es")).toBe("/es/organizacion/acme?invite=abc");
    expect(localizeBarePath("/org/acme?invite=abc", "fr")).toBe("/fr/organisation/acme?invite=abc");
  });

  it("maps the root to the locale root", () => {
    expect(localizeBarePath("/", "es")).toBe("/es");
    expect(localizeBarePath("/?x=1", "fr")).toBe("/fr?x=1");
  });

  it("only swaps the prefix on unknown paths", () => {
    expect(localizeBarePath("/nowhere/here", "es")).toBe("/es/nowhere/here");
  });
});
