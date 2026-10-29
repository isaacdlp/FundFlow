import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { PromoterInfo } from "@shared/types";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: 1 }, isAdmin: true }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn(), queryClient: { invalidateQueries: vi.fn() } }));
vi.mock("@/i18n/hooks", () => ({ useLocale: () => "en", useLocalePath: () => () => "#" }));
vi.mock("wouter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wouter")>()),
  useRoute: () => [true, { id: "1" }],
}));
vi.mock("@/components/contracts-card", () => ({ ContractsCard: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));

const { default: PromoterDetail } = await import("@/pages/promoter-detail");

const promoter = (overrides: Partial<PromoterInfo> = {}): PromoterInfo => ({
  id: 1, accountId: 5, active: false, contractDate: null, notes: "", createdAt: "", updatedAt: "",
  account: { id: 5, email: "ana@example.com", firstName: "Ana", lastName: "Pérez" },
  incentives: [],
  introductionCount: 0,
  hasSignedContract: false,
  ...overrides,
});

function renderPage(data: PromoterInfo) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => data } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<PromoterDetail />, { wrapper });
}

describe("Promoter detail", () => {
  it("can't be switched on until the promoter agreement is signed", async () => {
    renderPage(promoter());
    const toggle = await screen.findByTestId("switch-promoter-active");
    expect(toggle).toBeDisabled();
    expect(screen.getByTestId("text-promoter-active-hint")).toHaveTextContent("promoters.activeNeedsContract");
  });

  it("can be switched on again once the agreement is signed", async () => {
    renderPage(promoter({ hasSignedContract: true }));
    const toggle = await screen.findByTestId("switch-promoter-active");
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(screen.getByTestId("text-promoter-active-hint")).toHaveTextContent("promoters.activeHint");
  });

  it("can always be switched off", async () => {
    // e.g. activated before this rule existed
    renderPage(promoter({ active: true, hasSignedContract: false }));
    const toggle = await screen.findByTestId("switch-promoter-active");
    await waitFor(() => expect(toggle).toBeChecked());
    expect(toggle).toBeEnabled();
  });

  it("has the activation hint in all three catalogs", () => {
    for (const catalog of [en, es, fr] as any[]) expect(catalog.promoters.activeNeedsContract).toBeTruthy();
  });
});
