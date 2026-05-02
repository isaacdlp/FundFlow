import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
  queryClient: undefined,
  getQueryFn: () => async () => null,
}));

/**
 * Smoke test for the gating pattern used across the app:
 *
 *   {canEdit && <Button>Delete</Button>}
 *
 * Verifies that the conditional render correctly hides the action.
 */
function GatedDelete({ canEdit }: { canEdit: boolean }) {
  return (
    <div>
      <span>Some Item</span>
      {canEdit && (
        <Button data-testid="button-delete">Delete</Button>
      )}
    </div>
  );
}

describe("permission gating pattern", () => {
  it("renders the action when canEdit is true", () => {
    render(<GatedDelete canEdit={true} />);
    expect(screen.getByTestId("button-delete")).toBeInTheDocument();
  });

  it("hides the action when canEdit is false", () => {
    render(<GatedDelete canEdit={false} />);
    expect(screen.queryByTestId("button-delete")).not.toBeInTheDocument();
  });
});
