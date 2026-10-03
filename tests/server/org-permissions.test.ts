import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

/**
 * Regression suite: an APPROVED MEMBER of an organization who is NOT one of
 * its organizers must not be able to manage it. Membership grants read access
 * to the org only; management requires being an organizer (or an admin).
 */
describe("Organization management requires organizer or admin", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const orgA = fixtures.organization({ id: 10 });

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  async function loginAsPlainMember() {
    const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
    // Approved member of orgA…
    mockStorage.getOrganizationIdsForAccount.mockResolvedValue([orgA.id]);
    // …but not an organizer of it.
    mockStorage.getOrganizationIdsAsOrganizer.mockResolvedValue([]);
    mockStorage.getOrganization.mockResolvedValue(orgA);
    return agent;
  }

  const forbidden: Array<[string, (agent: any) => any]> = [
    ["PATCH the organization", (a) => a.patch(`/api/organizations/${orgA.id}`).send({ name: "Hacked" })],
    ["add an organizer (e.g. themselves)", (a) => a.post(`/api/organizations/${orgA.id}/organizers`).send({ accountId: fixtures.memberAccount.id })],
    ["remove an organizer", (a) => a.delete(`/api/organizations/${orgA.id}/organizers/${fixtures.organizerAccount.id}`)],
    ["list members", (a) => a.get(`/api/organizations/${orgA.id}/members`)],
    ["approve a member", (a) => a.patch(`/api/organizations/${orgA.id}/members/${fixtures.outsiderAccount.id}`).send({ status: "approved" })],
    ["remove a member", (a) => a.delete(`/api/organizations/${orgA.id}/members/${fixtures.outsiderAccount.id}`)],
    ["list invites", (a) => a.get(`/api/organizations/${orgA.id}/invites`)],
    ["create an invite", (a) => a.post(`/api/organizations/${orgA.id}/invites`)],
    ["create an SPV", (a) => a.post(`/api/organizations/${orgA.id}/spvs`).send({ legalName: "X LLC", displayName: "X", dateEstablished: "2025-01-01" })],
    ["add another account as member", (a) => a.post(`/api/organizations/${orgA.id}/members/request`).send({ accountId: fixtures.outsiderAccount.id })],
  ];

  for (const [action, send] of forbidden) {
    it(`approved non-organizer member cannot ${action} (403)`, async () => {
      const agent = await loginAsPlainMember();
      const res = await send(agent);
      expect(res.status).toBe(403);
      expect(mockStorage.updateOrganization).not.toHaveBeenCalled();
      expect(mockStorage.addOrganizer).not.toHaveBeenCalled();
      expect(mockStorage.removeOrganizer).not.toHaveBeenCalled();
      expect(mockStorage.getMembers).not.toHaveBeenCalled();
      expect(mockStorage.updateMemberStatus).not.toHaveBeenCalled();
      expect(mockStorage.removeMember).not.toHaveBeenCalled();
      expect(mockStorage.getInvites).not.toHaveBeenCalled();
      expect(mockStorage.createInvite).not.toHaveBeenCalled();
      expect(mockStorage.createSpv).not.toHaveBeenCalled();
      expect(mockStorage.createMemberRequest).not.toHaveBeenCalled();
    });
  }

  it("approved non-organizer member can still view the organization", async () => {
    const agent = await loginAsPlainMember();
    const res = await agent.get(`/api/organizations/${orgA.id}`);
    expect(res.status).toBe(200);
  });

  it("organizer of a DIFFERENT org cannot manage this one", async () => {
    const agent = await loginAs(app, mockStorage, fixtures.organizerAccount);
    mockStorage.getOrganizationIdsAsOrganizer.mockResolvedValue([999]);
    const res = await agent
      .patch(`/api/organizations/${orgA.id}/members/${fixtures.memberAccount.id}`)
      .send({ status: "approved" });
    expect(res.status).toBe(403);
    expect(mockStorage.updateMemberStatus).not.toHaveBeenCalled();
  });
});
