import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { AccountDelegationsInfo, RelationshipInfo } from "@shared/types";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";

vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn(), queryClient: { invalidateQueries: vi.fn() } }));
vi.mock("@/i18n/hooks", () => ({ useLocale: () => "en", useLocalePath: () => () => "#" }));
// Keys plus their interpolated values, so tests can see what a sentence is built from.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, o?: Record<string, string>) => (o ? `${key}(${Object.values(o).join("|")})` : key) }),
}));

const { AccountRelationships } = await import("@/components/account-relationships");
const { AccountDelegations, EntityDelegations } = await import("@/components/account-delegations");

const john = { id: 3, email: "john@example.com", firstName: "John", lastName: "Smith" };
const jane = { id: 2, email: "jane@example.com", firstName: "Jane", lastName: "Doe" };
const ana = { id: 4, email: "ana@example.com", firstName: "Ana", lastName: "Pérez" };

/** Serves each query from `data` by the last segment of its key (delegations, relationships, …). */
function renderWith(ui: ReactNode, data: Record<string, unknown>) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: async ({ queryKey }) => data[String(queryKey[queryKey.length - 1])] ?? [] } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("Relationships", () => {
  const rel = (id: number, from: typeof john, to: typeof john, description: string): RelationshipInfo => ({
    id, fromAccountId: from.id, toAccountId: to.id, description, createdAt: "", fromAccount: from, toAccount: to,
  });

  it("names the other account and reads the same in both directions", async () => {
    renderWith(<AccountRelationships account={john} />, {
      relationships: [rel(1, jane, john, "wife"), rel(2, john, ana, "father")],
    });
    const wife = await screen.findByTestId("row-relationship-1");
    expect(within(wife).getByRole("link")).toHaveTextContent("Jane Doe");
    expect(wife).toHaveTextContent("relationships.statement(Jane Doe|wife|John Smith)");
    const father = screen.getByTestId("row-relationship-2");
    expect(within(father).getByRole("link")).toHaveTextContent("Ana Pérez");
    expect(father).toHaveTextContent("relationships.statement(John Smith|father|Ana Pérez)");
  });

  it("says when there are none", async () => {
    renderWith(<AccountRelationships account={john} />, { relationships: [] });
    expect(await screen.findByText("relationships.none")).toBeInTheDocument();
  });
});

describe("Delegation", () => {
  const delegation = (id: number, principal: typeof john, delegate: typeof john, level: "observer" | "manager") => ({
    id, principalAccountId: principal.id, principalEntityId: null, delegateAccountId: delegate.id, level, notes: "", createdAt: "", updatedAt: "",
    principal, principalEntity: null, delegate,
  });

  it("lists who the account acts for and who acts for it, with their level", async () => {
    const data: AccountDelegationsInfo = {
      delegatedIn: [delegation(1, ana, john, "manager")],
      delegatedOut: [delegation(2, john, jane, "observer")],
    };
    renderWith(<AccountDelegations accountId={john.id} />, { delegations: data });
    const actsFor = await screen.findByTestId("row-delegation-in-1");
    expect(actsFor).toHaveTextContent("Ana Pérez");
    expect(actsFor).toHaveTextContent("delegations.levels.manager");
    const delegate = screen.getByTestId("row-delegation-out-2");
    expect(delegate).toHaveTextContent("Jane Doe");
    expect(delegate).toHaveTextContent("delegations.levels.observer");
  });
});

describe("Entity delegation", () => {
  const entityDelegation = (id: number, delegate: typeof john, level: "observer" | "manager") => ({
    id, principalAccountId: null, principalEntityId: 70, delegateAccountId: delegate.id, level, notes: "", createdAt: "", updatedAt: "",
    principal: null, principalEntity: { id: 70, name: "Family Trust", entityType: "Trust" }, delegate,
  });

  it("shows on the delegate's page among the principals it acts for", async () => {
    renderWith(<AccountDelegations accountId={john.id} />, { delegations: { delegatedIn: [entityDelegation(1, john, "manager")], delegatedOut: [] } });
    const row = await screen.findByTestId("row-delegation-in-1");
    expect(row).toHaveTextContent("Family Trust");
    expect(row).toHaveTextContent("introductions.entity");
  });

  it("warns when the entity has no manager", async () => {
    renderWith(<EntityDelegations entityId={70} canEdit />, { delegations: [entityDelegation(1, jane, "observer")] });
    expect(await screen.findByTestId("warning-delegations-entity")).toHaveTextContent("delegations.entityNeedsManager");
  });

  it("is read-only for observers", async () => {
    renderWith(<EntityDelegations entityId={70} canEdit={false} />, { delegations: [entityDelegation(1, jane, "manager")] });
    await screen.findByTestId("row-delegation-entity-1");
    expect(screen.queryByTestId("warning-delegations-entity")).toBeNull();
    expect(screen.queryByTestId("button-remove-delegation-1")).toBeNull();
    expect(screen.queryByTestId("select-add-entity-delegate")).toBeNull();
  });
});

describe("Connections catalogs", () => {
  it("have every delegation and relationship string in all three languages", () => {
    const keysOf = (o: object, prefix = ""): string[] => Object.entries(o).flatMap(([k, v]) =>
      typeof v === "object" ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
    for (const ns of ["delegations", "relationships"] as const) {
      const expected = keysOf((en as any)[ns]).sort();
      expect(keysOf((es as any)[ns]).sort()).toEqual(expected);
      expect(keysOf((fr as any)[ns]).sort()).toEqual(expected);
    }
  });
});
