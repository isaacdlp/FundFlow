import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeMockStorage, fixtures } from "./setup/mock-storage";
import { loginAs } from "./setup/auth-helper";

/**
 * `server/documents.ts` reaches past `IStorage` and uses the raw Drizzle `db`
 * client plus the filesystem (multer + `fs`). We mock both:
 *   - `db` becomes a chainable builder whose terminal `.then`/`.limit`/
 *     `.orderBy`/`.returning` resolve to results queued by the test
 *     (`dbMock.queueSelect([...])`, `dbMock.queueInsertReturning([...])`).
 *   - `fs/promises` and `fs` become no-ops so no files are actually written.
 */

interface DbMock {
  queueSelect: (rows: any[]) => void;
  queueInsertReturning: (rows: any[]) => void;
  inserts: any[][];
  deletes: any[];
  reset: () => void;
  // Drizzle-shaped methods consumed by documents.ts:
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  delete: (...args: any[]) => any;
}

function makeDbMock(): DbMock {
  const selectQueue: any[][] = [];
  const insertQueue: any[][] = [];
  const inserts: any[][] = [];
  const deletes: any[] = [];

  const select = () => {
    const result = selectQueue.length > 0 ? selectQueue.shift()! : [];
    const builder: any = {
      from: () => builder,
      where: () => builder,
      limit: () => builder,
      orderBy: () => builder,
      then: (resolve: any, reject: any) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return builder;
  };

  const insert = (_table: any) => ({
    values: (v: any) => {
      inserts.push([v]);
      const result = insertQueue.length > 0 ? insertQueue.shift()! : [{ ...v, id: 1 }];
      return {
        returning: async () => result,
        onConflictDoUpdate: async () => undefined,
      };
    },
  });

  const del = (_table: any) => ({
    where: async (...args: any[]) => {
      deletes.push(args);
    },
  });

  return {
    queueSelect: (rows) => selectQueue.push(rows),
    queueInsertReturning: (rows) => insertQueue.push(rows),
    inserts,
    deletes,
    reset: () => {
      selectQueue.length = 0;
      insertQueue.length = 0;
      inserts.length = 0;
      deletes.length = 0;
    },
    select,
    insert,
    delete: del,
  };
}

const mockStorage = makeMockStorage();
const dbMock = makeDbMock();

vi.mock("../../server/storage", async () => {
  const actual: any = await vi.importActual("../../server/storage");
  return { ...actual, storage: mockStorage, db: dbMock };
});
vi.mock("../../server/email", () => ({ sendPasswordResetEmail: vi.fn() }));

// Stub the filesystem so multer-driven uploads/deletes don't touch disk.
vi.mock("fs/promises", () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));
const existsSyncMock = vi.fn(() => true);
vi.mock("fs", async () => {
  const actual: any = await vi.importActual("fs");
  return {
    ...actual,
    existsSync: (...args: any[]) => existsSyncMock(...args),
    mkdirSync: () => undefined,
  };
});

const { createTestApp } = await import("./setup/test-app");

describe("/api/documents", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    Object.assign(mockStorage, makeMockStorage());
    dbMock.reset();
    app = await createTestApp();
  });

  // ───────── GET /api/documents ─────────────────────────────────────────────
  describe("GET /api/documents", () => {
    it("rejects unauthenticated callers with 401", async () => {
      const request = (await import("supertest")).default;
      const res = await request(app).get("/api/documents");
      expect(res.status).toBe(401);
    });

    it("admin sees all documents (db returns full set, no extra filtering)", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      // visibleDocsForAccount: admin path → single select on documents
      dbMock.queueSelect([
        { id: 1, name: "Doc A", folderPath: "", ownerType: "account", accountId: 2, entityId: null, fileName: "a.pdf", storedPath: "account/2/a.pdf", mimeType: "application/pdf", sizeBytes: 10, uploadedBy: 1, createdAt: new Date() },
        { id: 2, name: "Doc B", folderPath: "", ownerType: "entity", accountId: null, entityId: 200, fileName: "b.pdf", storedPath: "entity/200/b.pdf", mimeType: "application/pdf", sizeBytes: 20, uploadedBy: 1, createdAt: new Date() },
      ]);
      // enrichDoc runs both docs through Promise.all, so owner selects happen
      // for both docs before either uploader select. Order: d1.owner, d2.owner,
      // d1.uploader, d2.uploader.
      dbMock.queueSelect([{ id: 2, firstName: "Member", lastName: "User" }]);
      dbMock.queueSelect([{ id: 200, name: "Test Entity" }]);
      dbMock.queueSelect([{ id: 1, firstName: "Admin", lastName: "User" }]);
      dbMock.queueSelect([{ id: 1, firstName: "Admin", lastName: "User" }]);

      const res = await agent.get("/api/documents");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].owner).toEqual({ id: 2, type: "account", name: "Member User" });
      expect(res.body[1].owner).toEqual({ id: 200, type: "entity", name: "Test Entity" });
      expect(res.body[0].uploader).toEqual({ id: 1, name: "Admin User" });
    });

    it("non-admin scope: pulls owned + managed entity ids before listing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      mockStorage.getEntityIdsOwnedByAccount.mockResolvedValue([300]);
      mockStorage.getEntityIdsForAccount.mockResolvedValue([200]);
      // visibleDocsForAccount: non-admin path → single filtered select on documents
      dbMock.queueSelect([
        { id: 5, name: "Mine", folderPath: "", ownerType: "account", accountId: 2, entityId: null, fileName: "m.pdf", storedPath: "account/2/m.pdf", mimeType: "application/pdf", sizeBytes: 10, uploadedBy: 1, createdAt: new Date() },
      ]);
      // enrichDoc: 1 account + 1 uploader
      dbMock.queueSelect([{ id: 2, firstName: "Member", lastName: "User" }]);
      dbMock.queueSelect([{ id: 1, firstName: "Admin", lastName: "User" }]);

      const res = await agent.get("/api/documents");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(mockStorage.getEntityIdsOwnedByAccount).toHaveBeenCalledWith(2);
      expect(mockStorage.getEntityIdsForAccount).toHaveBeenCalledWith(2);
    });
  });

  // ───────── POST /api/documents ────────────────────────────────────────────
  describe("POST /api/documents (admin-only multipart upload)", () => {
    it("non-admin gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent
        .post("/api/documents")
        .field("ownerType", "account")
        .field("accountId", "2")
        .attach("file", Buffer.from("hello"), "hello.txt");
      expect(res.status).toBe(403);
    });

    it("unauthenticated gets 401", async () => {
      const request = (await import("supertest")).default;
      const res = await request(app)
        .post("/api/documents")
        .field("ownerType", "account")
        .field("accountId", "2")
        .attach("file", Buffer.from("hello"), "hello.txt");
      expect(res.status).toBe(401);
    });

    it("returns 400 when file is missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent
        .post("/api/documents")
        .field("ownerType", "account")
        .field("accountId", "2");
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/file is required/i);
    });

    it("returns 400 on invalid ownerType", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent
        .post("/api/documents")
        .field("ownerType", "wat")
        .attach("file", Buffer.from("hi"), "x.txt");
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/ownerType/);
    });

    it("returns 400 when ownerType=account but accountId missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent
        .post("/api/documents")
        .field("ownerType", "account")
        .attach("file", Buffer.from("hi"), "x.txt");
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/accountId/);
    });

    it("returns 400 when ownerType=entity but entityId missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      const res = await agent
        .post("/api/documents")
        .field("ownerType", "entity")
        .attach("file", Buffer.from("hi"), "x.txt");
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/entityId/);
    });

    it("returns 404 when accountId references missing account", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      // Owner-validation select returns []
      dbMock.queueSelect([]);
      const res = await agent
        .post("/api/documents")
        .field("ownerType", "account")
        .field("accountId", "999")
        .attach("file", Buffer.from("hi"), "x.txt");
      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/Account not found/);
    });

    it("admin happy path: writes the document row and returns 201 with enriched owner", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      // 1) owner-validation select (account exists)
      dbMock.queueSelect([{ id: 2, firstName: "Member", lastName: "User" }]);
      // 2) getStoragePath select on appSettings (no row → use default)
      dbMock.queueSelect([]);
      // 3) insert(documents).returning() — return shape close to what enrichDoc consumes
      dbMock.queueInsertReturning([{
        id: 42,
        name: "Pitch Deck",
        folderPath: "SPVs/Acme",
        ownerType: "account",
        accountId: 2,
        entityId: null,
        fileName: "deck.pdf",
        storedPath: "account/2/SPVs/Acme/deck-x.pdf",
        mimeType: "application/pdf",
        sizeBytes: 5,
        uploadedBy: 1,
        createdAt: new Date(),
      }]);
      // 4) enrichDoc: account select + uploader account select
      dbMock.queueSelect([{ id: 2, firstName: "Member", lastName: "User" }]);
      dbMock.queueSelect([{ id: 1, firstName: "Admin", lastName: "User" }]);

      const res = await agent
        .post("/api/documents")
        .field("name", "Pitch Deck")
        .field("folderPath", "SPVs/Acme")
        .field("ownerType", "account")
        .field("accountId", "2")
        .attach("file", Buffer.from("hello"), "deck.pdf");

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: 42,
        name: "Pitch Deck",
        folderPath: "SPVs/Acme",
        ownerType: "account",
        accountId: 2,
        owner: { id: 2, type: "account", name: "Member User" },
        uploader: { id: 1, name: "Admin User" },
      });

      // Verify the inserted row associates the file with the right owner and
      // tucks the storage path under `account/<id>/...`.
      expect(dbMock.inserts.length).toBeGreaterThan(0);
      const inserted = dbMock.inserts.find(([v]) => v.fileName === "deck.pdf")?.[0];
      expect(inserted).toBeDefined();
      expect(inserted.accountId).toBe(2);
      expect(inserted.entityId).toBeNull();
      expect(inserted.storedPath).toMatch(/^account\/2\/SPVs\/Acme\//);
      expect(inserted.uploadedBy).toBe(1);
    });

    it("sanitizes traversal segments in folderPath (.. and slashes are stripped)", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      dbMock.queueSelect([{ id: 200, name: "Test Entity" }]); // entity exists
      dbMock.queueSelect([]); // app_settings empty → default storage path
      dbMock.queueInsertReturning([{
        id: 7, name: "x", folderPath: "evil", ownerType: "entity",
        accountId: null, entityId: 200, fileName: "x.txt",
        storedPath: "entity/200/evil/x-y.txt", mimeType: "text/plain",
        sizeBytes: 1, uploadedBy: 1, createdAt: new Date(),
      }]);
      dbMock.queueSelect([{ id: 200, name: "Test Entity" }]);
      dbMock.queueSelect([{ id: 1, firstName: "Admin", lastName: "User" }]);

      const res = await agent
        .post("/api/documents")
        .field("ownerType", "entity")
        .field("entityId", "200")
        .field("folderPath", "../../etc/evil")
        .attach("file", Buffer.from("hi"), "x.txt");

      expect(res.status).toBe(201);
      const inserted = dbMock.inserts.find(([v]) => v.fileName === "x.txt")?.[0];
      // ".." segments are dropped; only the safe leaf survives.
      expect(inserted.folderPath).toBe("etc/evil");
      expect(inserted.storedPath.startsWith("entity/200/etc/evil/")).toBe(true);
      expect(inserted.storedPath).not.toContain("..");
    });
  });

  // ───────── DELETE /api/documents/:id ──────────────────────────────────────
  describe("DELETE /api/documents/:id (admin-only)", () => {
    it("non-admin gets 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent.delete("/api/documents/1");
      expect(res.status).toBe(403);
    });

    it("returns 404 when document is missing", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      dbMock.queueSelect([]); // existing lookup returns nothing
      const res = await agent.delete("/api/documents/9999");
      expect(res.status).toBe(404);
    });

    it("admin can delete an existing document", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      dbMock.queueSelect([{ id: 5, storedPath: "account/2/foo.pdf" }]); // existing lookup
      dbMock.queueSelect([]); // getStoragePath → default
      const res = await agent.delete("/api/documents/5");
      expect(res.status).toBe(200);
      expect(dbMock.deletes.length).toBe(1);
    });
  });

  // ───────── /api/settings/documents-path (admin-only) ──────────────────────
  describe("/api/settings/documents-path", () => {
    it("GET requires admin (non-admin → 403)", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent.get("/api/settings/documents-path");
      expect(res.status).toBe(403);
    });

    it("GET admin: returns configured (empty) + effective + default", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      dbMock.queueSelect([]); // raw configured lookup → none
      dbMock.queueSelect([]); // getStoragePath internal lookup → none
      const res = await agent.get("/api/settings/documents-path");
      expect(res.status).toBe(200);
      expect(res.body.configured).toBe("");
      expect(typeof res.body.effective).toBe("string");
      expect(typeof res.body.default).toBe("string");
      expect(res.body.effective.length).toBeGreaterThan(0);
    });

    it("PATCH admin: persists value via upsert and returns it", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      dbMock.queueSelect([{ key: "documents_storage_path", value: "/tmp/docs" }]);
      const res = await agent
        .patch("/api/settings/documents-path")
        .send({ value: "/tmp/docs" });
      expect(res.status).toBe(200);
      expect(res.body.configured).toBe("/tmp/docs");
      expect(typeof res.body.effective).toBe("string");
      // Upsert call recorded.
      expect(dbMock.inserts.find(([v]) => v.key === "documents_storage_path")).toBeDefined();
    });

    it("PATCH non-admin → 403", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.memberAccount);
      const res = await agent
        .patch("/api/settings/documents-path")
        .send({ value: "/tmp/docs" });
      expect(res.status).toBe(403);
    });
  });

  // ───────── GET /api/documents/:id/download ────────────────────────────────
  describe("GET /api/documents/:id/download", () => {
    it("rejects unauthenticated callers with 401", async () => {
      const request = (await import("supertest")).default;
      const res = await request(app).get("/api/documents/1/download");
      expect(res.status).toBe(401);
    });

    it("returns 404 when the document is not visible to the caller", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.outsiderAccount);
      mockStorage.getEntityIdsOwnedByAccount.mockResolvedValue([]);
      mockStorage.getEntityIdsForAccount.mockResolvedValue([]);
      dbMock.queueSelect([]); // visibleDocsForAccount returns nothing
      const res = await agent.get("/api/documents/123/download");
      expect(res.status).toBe(404);
    });

    it("returns 410 Gone when DB row exists but the file is missing on disk", async () => {
      const agent = await loginAs(app, mockStorage, fixtures.adminAccount);
      // Admin path: visibleDocsForAccount returns the doc (single select).
      dbMock.queueSelect([{
        id: 77,
        name: "Lost",
        folderPath: "",
        ownerType: "account",
        accountId: 1,
        entityId: null,
        fileName: "lost.pdf",
        storedPath: "account/1/lost.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1,
        uploadedBy: 1,
        createdAt: new Date(),
      }]);
      // getStoragePath select on app_settings → default
      dbMock.queueSelect([]);
      // existsSync is called twice in this flow:
      //  1) getStoragePath checks the storage directory → must exist (true)
      //  2) the download handler checks the file → must be missing (false)
      existsSyncMock.mockImplementationOnce(() => true);
      existsSyncMock.mockImplementationOnce(() => false);

      const res = await agent.get("/api/documents/77/download");
      expect(res.status).toBe(410);
    });
  });
});
