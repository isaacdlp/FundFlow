import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SearchPicker, filterSearchOptions, SEARCH_PICKER_MAX_RESULTS, type SearchPickerOption,
} from "@/components/search-picker";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, opts?: { count?: number }) => opts?.count !== undefined ? `${key}:${opts.count}` : key }),
}));

beforeAll(() => {
  // cmdk / Radix rely on browser APIs jsdom lacks.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
  Element.prototype.scrollIntoView ??= () => {};
});

const options: SearchPickerOption[] = [
  { value: "account-1", label: "José Pérez", detail: "jose@example.com", group: "Account" },
  { value: "account-2", label: "Ana Smith", detail: "ana@acme.io", group: "Account" },
  { value: "entity-1", label: "Acme Holdings LLC", detail: "LLC", group: "Entity" },
];

describe("filterSearchOptions", () => {
  it("returns everything for an empty search", () => {
    expect(filterSearchOptions(options, "  ")).toEqual(options);
  });

  it("matches label and detail, ignoring accents and case", () => {
    expect(filterSearchOptions(options, "jose").map(o => o.value)).toEqual(["account-1"]);
    expect(filterSearchOptions(options, "PEREZ").map(o => o.value)).toEqual(["account-1"]);
    expect(filterSearchOptions(options, "acme").map(o => o.value)).toEqual(["account-2", "entity-1"]);
  });

  it("requires every word to match", () => {
    expect(filterSearchOptions(options, "acme llc").map(o => o.value)).toEqual(["entity-1"]);
  });
});

describe("SearchPicker", () => {
  it("searches across groups and reports the picked value", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<SearchPicker options={options} onSelect={onSelect} placeholder="Add…" data-testid="picker" />);

    await user.click(screen.getByTestId("picker"));
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("Entity")).toBeInTheDocument();

    await user.type(screen.getByTestId("picker-search"), "holdings");
    expect(screen.queryByTestId("picker-option-account-1")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("picker-option-entity-1"));

    expect(onSelect).toHaveBeenCalledWith("entity-1");
    expect(screen.queryByTestId("picker-search")).not.toBeInTheDocument();
  });

  it("caps rendered rows and tells how many more match", async () => {
    const many = Array.from({ length: SEARCH_PICKER_MAX_RESULTS + 7 }, (_, i) => (
      { value: `account-${i}`, label: `Person ${i}` }));
    const user = userEvent.setup();
    render(<SearchPicker options={many} onSelect={() => {}} placeholder="Add…" data-testid="picker" />);

    await user.click(screen.getByTestId("picker"));
    expect(screen.getAllByRole("option")).toHaveLength(SEARCH_PICKER_MAX_RESULTS);
    expect(screen.getByText("common.moreResults:7")).toBeInTheDocument();
  });
});
