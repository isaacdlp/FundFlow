import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { PromoterInfo } from "@shared/types";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";

const mockUseAuth = vi.fn();
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => mockUseAuth() }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn(), queryClient: undefined }));
vi.mock("@/i18n/hooks", () => ({ useLocalePath: () => (key: string, p?: { id: number }) => `/${key}/${p?.id ?? ""}` }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));

const { default: Promoters } = await import("@/pages/promoters");

const promoter = (overrides: Partial<PromoterInfo> = {}): PromoterInfo => ({
  id: 1, accountId: 5, active: true, contractDate: "2026-10-01", notes: "", createdAt: "", updatedAt: "",
  account: { id: 5, email: "ana@example.com", firstName: "Ana", lastName: "Pérez" },
  incentives: [
    { id: 1, promoterId: 1, type: "management_fee", percent: "20.00", notes: "", createdAt: "" },
    { id: 2, promoterId: 1, type: "success_fee", percent: "12.50", notes: "", createdAt: "" },
  ],
  introductionCount: 3,
  hasSignedContract: true,
  ...overrides,
});

function renderPage(data: PromoterInfo[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => data } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<Promoters />, { wrapper });
}

describe("Promoters page", () => {
  beforeEach(() => mockUseAuth.mockReset());

  it("is hidden from non-admins", () => {
    mockUseAuth.mockReturnValue({ user: { id: 2 }, isAdmin: false });
    renderPage([promoter()]);
    expect(screen.getByText("notFound.title")).toBeInTheDocument();
    expect(screen.queryByTestId("button-add-promoter")).not.toBeInTheDocument();
  });

  it("lists promoters with their incentives and introduction count", async () => {
    mockUseAuth.mockReturnValue({ user: { id: 1 }, isAdmin: true });
    renderPage([promoter(), promoter({ id: 2, accountId: 6, active: false, incentives: [],
      account: { id: 6, email: "bo@example.com", firstName: "Bo", lastName: "Li" } })]);

    const row = await screen.findByTestId("promoter-row-1");
    expect(row).toHaveTextContent("Ana Pérez");
    expect(row).toHaveTextContent("promoters.incentiveTypesShort.management_fee 20%");
    expect(row).toHaveTextContent("promoters.incentiveTypesShort.success_fee 12.5%");
    expect(row).toHaveTextContent("3");
    expect(screen.getByTestId("promoter-row-2")).toHaveTextContent("promoters.inactive");
    expect(screen.getByTestId("promoter-row-2")).toHaveTextContent("promoters.noIncentives");
  });
});

describe("promoter translations", () => {
  const keys = (obj: object, prefix = ""): string[] =>
    Object.entries(obj).flatMap(([k, v]) => typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]);

  it("has every promoter string in es and fr", () => {
    const expected = keys(en.promoters).sort();
    expect(keys(es.promoters).sort()).toEqual(expected);
    expect(keys(fr.promoters).sort()).toEqual(expected);
    expect(es.nav.promoters && fr.nav.promoters).toBeTruthy();
  });
});
