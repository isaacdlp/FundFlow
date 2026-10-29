import { describe, it, expect, vi } from "vitest";
import { createConcordClient, getConcordConfig, normalizeConcordStatus, ConcordError } from "../../server/concord";

const config = { apiKey: "key", orgId: "42", apiUrl: "https://concord.test/api", appUrl: "https://app.concord.test/#" };
const AGREEMENTS = "https://concord.test/api/organizations/42/agreements";

type Reply = { status: number; body?: unknown };

/** Fake fetch answering "METHOD url" keys in order; records every call. */
function fakeFetch(replies: Record<string, Reply | Reply[]>) {
  const calls: { method: string; url: string; body: any; headers: Record<string, string> }[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    calls.push({ method, url, body: init.body ? JSON.parse(init.body as string) : undefined, headers: init.headers as Record<string, string> });
    const key = `${method} ${url}`;
    const entry = replies[key];
    const reply = Array.isArray(entry) ? entry.shift() : entry;
    if (!reply) throw new Error(`Unexpected call ${key}`);
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), { status: reply.status });
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

describe("getConcordConfig", () => {
  it("needs both the API key and the organization", () => {
    expect(getConcordConfig(undefined, {})).toBeNull();
    expect(getConcordConfig("k", {})).toBeNull();
    expect(getConcordConfig(" ", { orgId: "1" })).toBeNull();
    expect(getConcordConfig("k", { orgId: "1", apiUrl: "", appUrl: "" })).toEqual({
      apiKey: "k", orgId: "1",
      apiUrl: "https://api.concordnow.com/api/rest/1",
      appUrl: "https://secure.concordnow.com/#",
    });
  });

  it("uses the URL overrides, without trailing slashes", () => {
    expect(getConcordConfig("k", { orgId: "1", apiUrl: "https://concord.test/api/", appUrl: "https://app.concord.test/#/" })).toMatchObject({
      apiUrl: "https://concord.test/api",
      appUrl: "https://app.concord.test/#",
    });
  });
});

describe("normalizeConcordStatus", () => {
  it("treats UNKNOWN_CONTRACT as signed", () => {
    expect(normalizeConcordStatus("UNKNOWN_CONTRACT")).toBe("SIGNED");
    expect(normalizeConcordStatus("SIGNING")).toBe("SIGNING");
  });
});

describe("Concord client", () => {
  it("builds web links", () => {
    expect(createConcordClient(config).agreementUrl("abc")).toBe("https://app.concord.test/#/organizations/42/agreements/abc");
  });

  describe("createFromTemplate", () => {
    const options = {
      templateId: "tpl",
      title: "Promoter Agreement for Ada",
      variables: { Beneficiary: "Ada" },
      signers: ["ada@example.com", "us@example.com"],
      folderId: "77",
      invite: { emails: ["ada@example.com"], subject: "Sign please", message: "Hi" },
    };

    it("creates, assigns signers, starts signing, files and invites", async () => {
      const { fetch, calls } = fakeFetch({
        "POST https://concord.test/api/organizations/42/auto/tpl": { status: 201, body: { uid: "doc1" } },
        [`GET ${AGREEMENTS}/doc1/signature`]: { status: 200, body: { slots: [{ id: "s1" }, { id: "s2" }] } },
        [`PUT ${AGREEMENTS}/doc1/signature/slots`]: { status: 204 },
        [`PATCH ${AGREEMENTS}/doc1`]: { status: 204 },
        [`PUT ${AGREEMENTS}/doc1/folder`]: { status: 204 },
        [`POST ${AGREEMENTS}/doc1/members`]: { status: 200, body: {} },
      });
      const uid = await createConcordClient(config, fetch).createFromTemplate(options);
      expect(uid).toBe("doc1");
      expect(calls.map(c => `${c.method} ${c.url.replace(AGREEMENTS, "")}`)).toEqual([
        "POST https://concord.test/api/organizations/42/auto/tpl",
        "GET /doc1/signature",
        "PUT /doc1/signature/slots",
        "PATCH /doc1",
        "PUT /doc1/folder",
        "POST /doc1/members",
      ]);
      expect(calls[0].headers["X-API-KEY"]).toBe("key");
      expect(calls[0].body).toMatchObject({ title: options.title, signatureRequired: 2, variables: { Beneficiary: "Ada" } });
      expect(calls[2].body).toEqual([
        { id: "s1", reservation: { type: "EMAIL", email: { email: "ada@example.com" } } },
        { id: "s2", reservation: { type: "EMAIL", email: { email: "us@example.com" } } },
      ]);
      expect(calls[3].body).toEqual({ status: "SIGNING" });
      expect(calls[4].body).toEqual({ folderId: "77" });
      expect(calls[5].body).toMatchObject({
        invitations: { "ada@example.com": { permission: "LIMITED" } },
        message: { subject: "Sign please", content: "Hi" },
      });
    });

    it("skips filing and inviting when not asked", async () => {
      const { fetch, calls } = fakeFetch({
        "POST https://concord.test/api/organizations/42/auto/tpl": { status: 201, body: { uid: "doc1" } },
        [`GET ${AGREEMENTS}/doc1/signature`]: { status: 200, body: { slots: [{ id: "s1" }, { id: "s2" }] } },
        [`PUT ${AGREEMENTS}/doc1/signature/slots`]: { status: 204 },
        [`PATCH ${AGREEMENTS}/doc1`]: { status: 204 },
      });
      await createConcordClient(config, fetch).createFromTemplate({ ...options, folderId: undefined, invite: undefined });
      expect(calls).toHaveLength(4);
    });

    it("throws without leaving anything behind when the template can't be created", async () => {
      const { fetch, calls } = fakeFetch({
        "POST https://concord.test/api/organizations/42/auto/tpl": { status: 404, body: { message: "no template" } },
      });
      await expect(createConcordClient(config, fetch).createFromTemplate(options)).rejects.toThrow(ConcordError);
      expect(calls).toHaveLength(1);
    });

    it("deletes the half-made agreement when a later step fails", async () => {
      const { fetch, calls } = fakeFetch({
        "POST https://concord.test/api/organizations/42/auto/tpl": { status: 201, body: { uid: "doc1" } },
        [`GET ${AGREEMENTS}/doc1/signature`]: { status: 200, body: { slots: [{ id: "s1" }] } },
        [`GET ${AGREEMENTS}/doc1`]: { status: 200, body: { metadata: { summaryStatus: "DRAFT", signedUid: null } } },
        [`DELETE ${AGREEMENTS}/doc1/signature`]: { status: 404 },
        [`PATCH ${AGREEMENTS}/doc1`]: { status: 204 },
        [`PATCH ${AGREEMENTS}/doc1/metadata`]: { status: 204 },
        [`DELETE ${AGREEMENTS}/doc1`]: { status: 204 },
      });
      await expect(createConcordClient(config, fetch).createFromTemplate(options))
        .rejects.toThrow("The template has 1 signature slot(s) but 2 signer(s) were given");
      expect(calls.at(-1)).toMatchObject({ method: "DELETE", url: `${AGREEMENTS}/doc1` });
    });
  });

  describe("getStatus", () => {
    it("reports the status and follows the signed copy", async () => {
      const { fetch } = fakeFetch({
        [`GET ${AGREEMENTS}/doc1`]: { status: 200, body: { metadata: { summaryStatus: "UNKNOWN_CONTRACT", signedUid: "doc2" } } },
      });
      expect(await createConcordClient(config, fetch).getStatus("doc1")).toEqual({ status: "SIGNED", uid: "doc2" });
    });

    it("returns null when Concord no longer has it", async () => {
      const { fetch } = fakeFetch({ [`GET ${AGREEMENTS}/gone`]: { status: 404 } });
      expect(await createConcordClient(config, fetch).getStatus("gone")).toBeNull();
    });

    it("throws on other failures", async () => {
      const { fetch } = fakeFetch({ [`GET ${AGREEMENTS}/doc1`]: { status: 401, body: { message: "bad key" } } });
      await expect(createConcordClient(config, fetch).getStatus("doc1")).rejects.toMatchObject({ status: 401 });
    });
  });

  describe("deleteAgreement", () => {
    it("cancels pending signatures before trashing and deleting", async () => {
      const { fetch, calls } = fakeFetch({
        [`GET ${AGREEMENTS}/doc1`]: { status: 200, body: { metadata: { summaryStatus: "SIGNING", signedUid: null } } },
        [`DELETE ${AGREEMENTS}/doc1/signature`]: { status: 204 },
        [`PATCH ${AGREEMENTS}/doc1`]: { status: 204 },
        [`PATCH ${AGREEMENTS}/doc1/metadata`]: { status: 204 },
        [`DELETE ${AGREEMENTS}/doc1`]: { status: 204 },
      });
      await createConcordClient(config, fetch).deleteAgreement("doc1");
      expect(calls.map(c => `${c.method} ${c.url.replace(AGREEMENTS, "")}`)).toEqual([
        "GET /doc1", "DELETE /doc1/signature", "PATCH /doc1", "PATCH /doc1/metadata", "DELETE /doc1",
      ]);
      expect(calls[2].body).toEqual({ status: "BROKEN" });
      expect(calls[3].body).toEqual({ trash: true });
    });

    it("does nothing when the agreement is already gone", async () => {
      const { fetch, calls } = fakeFetch({ [`GET ${AGREEMENTS}/gone`]: { status: 404 } });
      await createConcordClient(config, fetch).deleteAgreement("gone");
      expect(calls).toHaveLength(1);
    });
  });
});
