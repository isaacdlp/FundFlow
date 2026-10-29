import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ContractDraft, ContractInfo } from "@shared/types";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";

vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn(), queryClient: undefined }));
vi.mock("@/i18n/hooks", () => ({ useLocale: () => "en" }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { ContractsCard, contractStatusKey } = await import("@/components/contracts-card");

const contract = (overrides: Partial<ContractInfo> = {}): ContractInfo => ({
  id: 1, kind: "promoter_agreement", concordUid: "doc1", title: "Promoter Agreement for Ana",
  status: "SIGNING", signers: ["ana@example.com", "us@example.com"], promoterId: 3, createdByAccountId: 1,
  statusCheckedAt: null, signedAt: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
  url: "https://secure.concordnow.com/#/organizations/42/agreements/doc1",
  ...overrides,
});

const draft = (overrides: Partial<ContractDraft> = {}): ContractDraft => ({
  ready: true, title: "Promoter Agreement for Ana", signers: ["ana@example.com"], variables: {}, subject: "", message: "", ...overrides,
});

function renderCard(contracts: ContractInfo[], d: ContractDraft) {
  const data: Record<string, unknown> = { "/list": contracts, "/draft": d };
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: async ({ queryKey }) => data[queryKey[0] as string] } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<ContractsCard listUrl="/list" draftUrl="/draft" createUrl="/create" />, { wrapper });
}

describe("ContractsCard", () => {
  it("lists contracts with their status, signers and Concord link", async () => {
    renderCard([contract(), contract({ id: 2, status: "SIGNED", signedAt: "2026-10-05T00:00:00Z" })], draft());

    const row = await screen.findByTestId("row-contract-1");
    expect(row).toHaveTextContent("Promoter Agreement for Ana");
    expect(row).toHaveTextContent("contracts.statuses.SIGNING");
    expect(row).toHaveTextContent("ana@example.com, us@example.com");
    expect(screen.getByTestId("link-contract-1")).toHaveAttribute("href", contract().url);
    expect(screen.getByTestId("button-delete-contract-1")).toBeEnabled();
    // Signed contracts can't be deleted.
    expect(screen.getByTestId("button-delete-contract-2")).toBeDisabled();
    expect(screen.getByTestId("row-contract-2")).toHaveTextContent("contracts.signedOn");
  });

  it("can't send until Concord is configured", async () => {
    renderCard([], draft({ ready: false }));
    expect(await screen.findByTestId("text-contracts-not-configured")).toBeInTheDocument();
    expect(screen.getByTestId("button-send-contract")).toBeDisabled();
    expect(screen.getByText("contracts.none")).toBeInTheDocument();
  });

  it("enables sending when ready", async () => {
    renderCard([], draft());
    await screen.findByText("contracts.none");
    await vi.waitFor(() => expect(screen.getByTestId("button-send-contract")).toBeEnabled());
  });

  it("labels unknown Concord statuses generically", () => {
    expect(contractStatusKey("SIGNED")).toBe("contracts.statuses.SIGNED");
    expect(contractStatusKey("SOMETHING_NEW")).toBe("contracts.statuses.other");
  });
});

describe("contract translations", () => {
  const keys = (obj: object, prefix = ""): string[] =>
    Object.entries(obj).flatMap(([k, v]) => typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]);

  it("has every contract string in es and fr", () => {
    const expected = keys(en.contracts).sort();
    expect(keys(es.contracts).sort()).toEqual(expected);
    expect(keys(fr.contracts).sort()).toEqual(expected);
  });
});
