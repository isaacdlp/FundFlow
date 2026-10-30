import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { MemberInfo } from "@shared/types";

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: 1 }, isAdmin: true }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn(), queryClient: { invalidateQueries: vi.fn() } }));
vi.mock("@/i18n/hooks", () => ({ useLocale: () => "en", useLocalePath: () => (key: string, p?: { id: number }) => `/${key}/${p?.id ?? ""}` }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const { MembersTab } = await import("@/pages/organization-detail");

const member = (accountId: number, firstName: string, email: string, managementFeePercent: string | null, successFeePercent: string | null, status = "approved"): MemberInfo => ({
  id: accountId, organizationId: 10, accountId, status, inviteId: null, createdAt: "",
  managementFeePercent, successFeePercent,
  account: { id: accountId, email, firstName, lastName: "X" },
});

function renderTab(members: MemberInfo[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async ({ queryKey }) => (queryKey[0] === "/api/organizations" && queryKey[2] === "members" ? members : []) } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return render(<MembersTab orgId="10" canEdit />, { wrapper });
}

const rowIds = () => screen.getAllByTestId(/^member-approved-/).map(r => r.dataset.testid!.replace("member-approved-", ""));

describe("Organization members", () => {
  const data = [
    member(1, "Carla", "c@example.com", "5.00", "20.00"),
    member(2, "Ana", "z@example.com", null, "10.00"),
    member(3, "Bea", "a@example.com", "7.00", null),
    member(4, "Dan", "d@example.com", null, null, "pending"),
  ];

  it("lists approved members by name with their default fees", async () => {
    renderTab(data);
    await screen.findByTestId("member-approved-1");
    expect(rowIds()).toEqual(["2", "3", "1"]);
    expect(screen.getByTestId("text-member-management-fee-1")).toHaveTextContent("5%");
    expect(screen.getByTestId("text-member-success-fee-1")).toHaveTextContent("20%");
    expect(screen.getByTestId("text-member-management-fee-2")).toHaveTextContent("—");
    expect(screen.getByTestId("member-pending-4")).toBeInTheDocument();
  });

  it("sorts by email and by fee", async () => {
    renderTab(data);
    await screen.findByTestId("member-approved-1");
    fireEvent.click(screen.getByTestId("sort-email"));
    expect(rowIds()).toEqual(["3", "1", "2"]);
    fireEvent.click(screen.getByTestId("sort-managementFee"));
    expect(rowIds()[0]).toBe("1"); // 5% before 7%; members without a default go last
    expect(rowIds()).toEqual(["1", "3", "2"]);
  });

  it("paginates long lists", async () => {
    renderTab(Array.from({ length: 60 }, (_, i) => member(i + 1, `M${String(i).padStart(2, "0")}`, `m${i}@x.com`, null, null)));
    await screen.findByTestId("member-approved-1");
    expect(rowIds()).toHaveLength(50);
  });
});

describe("Organization members: mailing and join date", () => {
  it("shows who is active, and an entity members section for organizers", async () => {
    renderTab([{ ...member(1, "Carla", "c@example.com", null, null), active: false, memberSince: "2024-03-01" }]);
    expect(await screen.findByTestId("text-member-active-1")).toHaveTextContent("organizationDetail.activeNo");
    expect(screen.getByText("2024-03-01")).toBeInTheDocument();
    expect(screen.getByTestId("section-entity-members")).toBeInTheDocument();
  });
});
