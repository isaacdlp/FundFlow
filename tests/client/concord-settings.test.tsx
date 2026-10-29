import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ConcordSettingsInfo } from "@shared/types";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";

const apiRequest = vi.fn();
vi.mock("@/lib/queryClient", () => ({ apiRequest, queryClient: { invalidateQueries: vi.fn() } }));
vi.mock("@/i18n/hooks", () => ({ useLocale: () => "en", useLocaleFullPath: () => () => "#" }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  Trans: () => null,
}));

const { ConcordSettingsSection } = await import("@/pages/settings");

const settings = (overrides: Partial<ConcordSettingsInfo> = {}): ConcordSettingsInfo => ({
  orgId: "42", apiUrl: "", appUrl: "", signerEmail: "", promoterTemplateId: "tpl", promoterFolderId: "",
  apiKeySet: true,
  defaultApiUrl: "https://api.concordnow.com/api/rest/1",
  defaultAppUrl: "https://secure.concordnow.com/#",
  ...overrides,
});

function renderSection(data: ConcordSettingsInfo) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => data } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<ConcordSettingsSection />, { wrapper });
}

describe("ConcordSettingsSection", () => {
  beforeEach(() => apiRequest.mockReset().mockResolvedValue({}));

  it("shows the stored values, with the default URLs as placeholders", async () => {
    renderSection(settings());
    await waitFor(() => expect(screen.getByTestId("input-concord-orgId")).toHaveValue("42"));
    expect(screen.getByTestId("input-concord-promoterTemplateId")).toHaveValue("tpl");
    expect(screen.getByTestId("input-concord-apiUrl")).toHaveAttribute("placeholder", "https://api.concordnow.com/api/rest/1");
    expect(screen.queryByTestId("alert-concord-key-missing")).not.toBeInTheDocument();
  });

  it("warns when the server has no API key", async () => {
    renderSection(settings({ apiKeySet: false }));
    expect(await screen.findByTestId("alert-concord-key-missing")).toBeInTheDocument();
  });

  it("saves every field", async () => {
    renderSection(settings());
    const signer = screen.getByTestId("input-concord-signerEmail");
    await waitFor(() => expect(screen.getByTestId("input-concord-orgId")).toHaveValue("42"));
    await userEvent.type(signer, "legal@example.com");
    await userEvent.click(screen.getByTestId("button-save-concord"));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("PATCH", "/api/settings/concord", {
      orgId: "42", apiUrl: "", appUrl: "", signerEmail: "legal@example.com", promoterTemplateId: "tpl", promoterFolderId: "",
    }));
  });

  it("has every string in all three catalogs", () => {
    const keys = ["tabContracts", "concordTitle", "concordDescription", "concordApiKeyMissing"];
    const fields = ["orgId", "apiUrl", "appUrl", "signerEmail", "promoterTemplateId", "promoterFolderId"];
    for (const catalog of [en, es, fr] as any[]) {
      for (const key of keys) expect(catalog.settings[key]).toBeTruthy();
      for (const field of fields) {
        expect(catalog.settings.concordFields[field]).toBeTruthy();
        expect(catalog.settings.concordHints[field]).toBeTruthy();
      }
    }
  });
});
