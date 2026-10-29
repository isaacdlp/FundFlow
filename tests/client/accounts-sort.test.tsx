import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { AccountWithRoles } from "@shared/types";

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: 1 }, isAdmin: true }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn(), queryClient: undefined }));
vi.mock("@/i18n/hooks", () => ({ useLocalePath: () => (key: string, p?: { id: number }) => `/${key}/${p?.id ?? ""}` }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));

const { default: Accounts } = await import("@/pages/accounts");

const account = (id: number, firstName: string, lastName: string, email: string, admin = false) =>
  ({ id, firstName, lastName, email, roles: admin ? [{ id: 1, name: "admin" }] : [] }) as unknown as AccountWithRoles;

const data = [
  account(1, "Carla", "Ruiz", "a@example.com", true),
  account(2, "Álvaro", "Gil", "c@example.com"),
  account(3, "Bea", "Mora", "b@example.com"),
];

function renderPage(accounts: AccountWithRoles[] = data) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => accounts } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<Accounts />, { wrapper });
}

const rowIds = () => screen.getAllByTestId(/^row-account-/).map((r) => r.dataset.testid!.replace("row-account-", ""));

describe("Accounts list sorting", () => {
  it("starts sorted by the first column (name, accent-insensitive) ascending", async () => {
    renderPage();
    await screen.findByTestId("row-account-1");
    expect(rowIds()).toEqual(["2", "3", "1"]);
    expect(screen.getByTestId("sort-name").closest("th")).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByTestId("sort-email").closest("th")).toHaveAttribute("aria-sort", "none");
  });

  it("flips to desc when the active header is clicked, and back", async () => {
    renderPage();
    await screen.findByTestId("row-account-1");
    fireEvent.click(screen.getByTestId("sort-name"));
    expect(rowIds()).toEqual(["1", "3", "2"]);
    expect(screen.getByTestId("sort-name").closest("th")).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(screen.getByTestId("sort-name"));
    expect(rowIds()).toEqual(["2", "3", "1"]);
  });

  it("switches to another column ascending", async () => {
    renderPage();
    await screen.findByTestId("row-account-1");
    fireEvent.click(screen.getByTestId("sort-email"));
    expect(rowIds()).toEqual(["1", "3", "2"]);
    expect(screen.getByTestId("sort-name").closest("th")).toHaveAttribute("aria-sort", "none");
  });
});

describe("Accounts list pagination", () => {
  // Zero-padded so name order matches numeric order
  const many = Array.from({ length: 120 }, (_, i) =>
    account(i + 1, "User", String(i + 1).padStart(3, "0"), `u${i + 1}@example.com`));

  it("hides the pagination bar when everything fits in the smallest page", async () => {
    renderPage();
    await screen.findByTestId("row-account-1");
    expect(screen.queryByTestId("list-pagination")).not.toBeInTheDocument();
  });

  it("shows 50 rows by default and pages through the rest", async () => {
    renderPage(many);
    await screen.findByTestId("row-account-1");
    expect(rowIds()).toHaveLength(50);
    expect(rowIds()[0]).toBe("1");
    expect(screen.getByTestId("button-page-size-50")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("button-page-previous")).toBeDisabled();

    fireEvent.click(screen.getByTestId("button-page-next"));
    fireEvent.click(screen.getByTestId("button-page-next"));
    expect(rowIds()).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 101)));
    expect(screen.getByTestId("button-page-next")).toBeDisabled();
  });

  it("switches to 25, 100 or all rows per page", async () => {
    renderPage(many);
    await screen.findByTestId("row-account-1");
    fireEvent.click(screen.getByTestId("button-page-size-25"));
    expect(rowIds()).toHaveLength(25);
    fireEvent.click(screen.getByTestId("button-page-size-100"));
    expect(rowIds()).toHaveLength(100);
    fireEvent.click(screen.getByTestId("button-page-size-all"));
    expect(rowIds()).toHaveLength(120);
    expect(screen.queryByTestId("button-page-next")).not.toBeInTheDocument();
  });

  it("goes back to the first page when the sort changes", async () => {
    renderPage(many);
    await screen.findByTestId("row-account-1");
    fireEvent.click(screen.getByTestId("button-page-next"));
    expect(rowIds()[0]).toBe("51");
    fireEvent.click(screen.getByTestId("sort-name"));
    expect(rowIds()[0]).toBe("120");
  });
});
