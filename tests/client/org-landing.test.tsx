import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("wouter", () => ({ useRoute: () => [true, { slug: "acme" }], useSearch: () => "invite=tok" }));
// A plain forwarder rather than vi.fn(): a vi.fn() whose promise rejects fails
// the test even though the page handles the error.
const api = vi.hoisted(() => ({ calls: [] as unknown[][], impl: (..._args: unknown[]): Promise<Response> => Promise.reject(new Error("unset")) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: (...args: unknown[]) => { api.calls.push(args); return api.impl(...args); } }));
vi.mock("@/i18n/hooks", () => ({
  useLocale: () => "en",
  useLocaleFullPath: () => (key: string) => (key === "dashboard" ? "/en" : `/en/${key}`),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const { default: OrgLanding } = await import("@/pages/org-landing");

const org = { id: 10, name: "Acme Capital", slug: "acme" };

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => (queryKey[0] === "/api/invites" ? { invite: { id: 1, token: "tok", organizationId: 10 }, organization: org } : org),
      },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return render(<OrgLanding />, { wrapper });
}

// apiRequest throws "<status>: <body>" on an error response.
function rejectWith(message: string) {
  api.impl = async () => { throw new Error(message); };
}

async function submitSignup(email: string) {
  fireEvent.click(await screen.findByTestId("button-new-user"));
  fireEvent.change(screen.getByTestId("input-signup-firstname"), { target: { value: "Ana" } });
  fireEvent.change(screen.getByTestId("input-signup-lastname"), { target: { value: "Ruiz" } });
  fireEvent.change(screen.getByTestId("input-signup-email"), { target: { value: email } });
  fireEvent.change(screen.getByTestId("input-signup-password"), { target: { value: "secret123" } });
  fireEvent.click(screen.getByTestId("button-signup-submit"));
}

describe("Org landing — invite sign-up", () => {
  beforeEach(() => { api.calls = []; });

  it("links to the sign-in page after creating the account", async () => {
    api.impl = async () => new Response(JSON.stringify({ member: {} }));
    renderPage();
    await submitSignup("ana@example.com");
    const link = await screen.findByTestId("link-success-portal");
    expect(link).toHaveAttribute("href", "/en");
    expect(link).toHaveTextContent("landing.goToSignIn");
    expect(api.calls).toContainEqual(["POST", "/api/invites/tok/accept", expect.objectContaining({ language: "en" })]);
  });

  it("offers signing in or recovering the password when the email is taken", async () => {
    rejectWith('409: {"message":"An account with this email already exists."}');
    renderPage();
    await submitSignup("ana+1@example.com");
    expect(await screen.findByTestId("alert-account-exists")).toBeInTheDocument();
    expect(screen.getByTestId("link-account-exists-recover")).toHaveAttribute(
      "href", "/en/forgotPassword?email=ana%2B1%40example.com",
    );

    fireEvent.click(screen.getByTestId("button-account-exists-signin"));
    expect(screen.getByTestId("input-signin-email")).toHaveValue("ana+1@example.com");
  });

  it("hides the notice once the email is changed", async () => {
    rejectWith("409: exists");
    renderPage();
    await submitSignup("ana@example.com");
    await screen.findByTestId("alert-account-exists");
    fireEvent.change(screen.getByTestId("input-signup-email"), { target: { value: "other@example.com" } });
    expect(screen.queryByTestId("alert-account-exists")).not.toBeInTheDocument();
  });
});
