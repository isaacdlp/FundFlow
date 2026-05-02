import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn (classname helper)", () => {
  it("joins simple class strings", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("ignores falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("supports conditional class objects", () => {
    expect(cn("base", { active: true, disabled: false })).toBe("base active");
  });

  it("flattens arrays", () => {
    expect(cn(["a", "b"], "c")).toBe("a b c");
  });

  it("merges conflicting tailwind classes (later wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });
});
