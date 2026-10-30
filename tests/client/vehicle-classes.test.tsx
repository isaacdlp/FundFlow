import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { VehicleClassInfo } from "@shared/types";

const apiRequest = vi.fn();
vi.mock("@/lib/queryClient", () => ({ apiRequest, queryClient: { invalidateQueries: vi.fn() } }));
vi.mock("@/i18n/hooks", () => ({ useLocale: () => "en" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const { VehicleClassesTab } = await import("@/components/vehicle-classes");

const cls = (id: number, name: string, extra: Partial<VehicleClassInfo> = {}): VehicleClassInfo => ({
  id, vehicleId: 100, name, notes: "", createdAt: "", memberCount: 2, assetCount: 1,
  committed: "1000.00", totalCalled: "1000.00", cash: "200.00", assetValue: "1200.00", currentValue: "1400.00", ...extra,
});

function renderTab(classes: VehicleClassInfo[], canEdit: boolean) {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return render(<VehicleClassesTab vehicleId="100" classes={classes} isLoading={false} canEdit={canEdit} currencySymbol="$" />, { wrapper });
}

describe("Vehicle share classes tab", () => {
  beforeEach(() => apiRequest.mockReset().mockResolvedValue({ json: async () => ({}) }));

  it("explains that a single class isn't shown, and never offers to delete it", () => {
    renderTab([cls(1, "Class A")], true);
    expect(screen.getByTestId("text-class-help")).toHaveTextContent("vehicleDetail.singleClassHelp");
    expect(screen.getByTestId("button-edit-class-1")).toBeInTheDocument();
    expect(screen.queryByTestId("button-delete-class-1")).toBeNull();
  });

  it("shows each class's own pool figures", () => {
    renderTab([cls(1, "Class A"), cls(2, "Class B", { cash: "-50.00" })], false);
    expect(screen.getByTestId("text-class-name-1")).toHaveTextContent("Class A");
    expect(screen.getByTestId("text-class-current-value-1")).toHaveTextContent("$1,400.00");
    expect(screen.getByTestId("text-class-cash-2")).toHaveTextContent("-50.00");
  });

  it("is read-only for investors", () => {
    renderTab([cls(1, "Class A")], false);
    expect(screen.queryByTestId("button-add-class")).toBeNull();
    expect(screen.queryByTestId("button-delete-class-1")).toBeNull();
  });

  it("creates, renames and deletes classes", async () => {
    renderTab([cls(1, "Class A"), cls(2, "Class B")], true);
    expect(screen.getByTestId("text-class-help")).toHaveTextContent("vehicleDetail.deleteClassHelp");
    fireEvent.change(screen.getByTestId("input-class-name"), { target: { value: " Class C " } });
    fireEvent.click(screen.getByTestId("button-add-class"));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("POST", "/api/vehicles/100/classes", { name: "Class C", notes: "" }));

    fireEvent.click(screen.getByTestId("button-edit-class-1"));
    fireEvent.change(screen.getByTestId("input-edit-class-name-1"), { target: { value: "Class A1" } });
    fireEvent.click(screen.getByTestId("button-save-class-1"));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("PATCH", "/api/vehicles/100/classes/1", { name: "Class A1", notes: "" }));

    fireEvent.click(screen.getByTestId("button-delete-class-1"));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("DELETE", "/api/vehicles/100/classes/1"));
  });
});
