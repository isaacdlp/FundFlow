import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

const mockStorage = makeMockStorage();
vi.mock("../../server/storage", () => ({ storage: mockStorage }));
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

const { createTestApp } = await import("./setup/test-app");

describe("Organizers", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const orgA = fixtures.organization({ id: 10 });

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    app = await createTestApp();
  });

  describe("POST /api/organizations/:id/organizers", () => {
    it("returns 403 when non-admin not in org", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([]);
      const res = await agent
        .post(`/api/organizations/${orgA.id}/organizers`)
        .send({ accountId: 99 });
      expect(res.status).toBe(403);
    });

    it("returns 400 when accountId missing or invalid", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const r1 = await agent.post(`/api/organizations/${orgA.id}/organizers`).send({});
      const r2 = await agent
        .post(`/api/organizations/${orgA.id}/organizers`)
        .send({ accountId: "abc" });
      expect(r1.status).toBe(400);
      expect(r2.status).toBe(400);
    });

    it("returns 404 when org or account is missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getOrganization.mockResolvedValue(null);
      const r1 = await agent
        .post(`/api/organizations/${orgA.id}/organizers`)
        .send({ accountId: 99 });
      expect(r1.status).toBe(404);

      mockStorage.getOrganization.mockResolvedValue(orgA);
      mockStorage.getAccount.mockImplementation(async (id: number) =>
        id === fixtures.adminAccount.id ? fixtures.adminAccount : null,
      );
      const r2 = await agent
        .post(`/api/organizations/${orgA.id}/organizers`)
        .send({ accountId: 99 });
      expect(r2.status).toBe(404);
    });

    it("admin adds an organizer and returns updated org", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.getOrganization.mockResolvedValue(orgA);
      mockStorage.getAccount.mockImplementation(async (id: number) =>
        id === fixtures.adminAccount.id
          ? fixtures.adminAccount
          : id === fixtures.organizerAccount.id
            ? fixtures.organizerAccount
            : null,
      );
      const res = await agent
        .post(`/api/organizations/${orgA.id}/organizers`)
        .send({ accountId: fixtures.organizerAccount.id });
      expect(res.status).toBe(200);
      expect(mockStorage.addOrganizer).toHaveBeenCalledWith(orgA.id, fixtures.organizerAccount.id);
    });
  });

  describe("DELETE /api/organizations/:id/organizers/:accountId", () => {
    it("returns 403 when non-admin not in org", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getOrganizationIdsForAccount.mockResolvedValue([]);
      const res = await agent.delete(`/api/organizations/${orgA.id}/organizers/3`);
      expect(res.status).toBe(403);
    });

    it("returns 400 on invalid IDs", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent.delete(`/api/organizations/${orgA.id}/organizers/abc`);
      expect(res.status).toBe(400);
    });

    it("returns 404 when assignment does not exist", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.removeOrganizer.mockResolvedValue(false);
      const res = await agent.delete(`/api/organizations/${orgA.id}/organizers/99`);
      expect(res.status).toBe(404);
    });

    it("admin removes an organizer", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      mockStorage.removeOrganizer.mockResolvedValue(true);
      mockStorage.getOrganization.mockResolvedValue(orgA);
      const res = await agent.delete(`/api/organizations/${orgA.id}/organizers/3`);
      expect(res.status).toBe(200);
    });
  });
});
