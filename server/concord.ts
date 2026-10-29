// Thin client for the ConcordNow REST API (https://api.concordnow.com),
// which we use to send contracts for e-signature. Generic on purpose:
// promoter agreements, investment agreements and tax forms all go through
// `createFromTemplate` / `getStatus` / `deleteAgreement`.

export const DEFAULT_CONCORD_API_URL = "https://api.concordnow.com/api/rest/1";
export const DEFAULT_CONCORD_APP_URL = "https://secure.concordnow.com/#";

export interface ConcordConfig {
  apiKey: string;
  orgId: string;
  /** REST base, e.g. https://api.concordnow.com/api/rest/1 */
  apiUrl: string;
  /** Web app base used to build links people can open. */
  appUrl: string;
}

/**
 * The API key comes from the CONCORD_API_KEY env var; the organization and
 * optional URL overrides from the admin Settings. Null unless both the key
 * and the organization are set.
 */
export function getConcordConfig(
  apiKey: string | undefined,
  settings: { orgId?: string | null; apiUrl?: string | null; appUrl?: string | null },
): ConcordConfig | null {
  const key = apiKey?.trim();
  const orgId = settings.orgId?.trim();
  if (!key || !orgId) return null;
  return {
    apiKey: key,
    orgId,
    apiUrl: (settings.apiUrl?.trim() || DEFAULT_CONCORD_API_URL).replace(/\/+$/, ""),
    appUrl: (settings.appUrl?.trim() || DEFAULT_CONCORD_APP_URL).replace(/\/+$/, ""),
  };
}

export class ConcordError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ConcordError";
  }
}

export class ConcordNotConfiguredError extends Error {
  constructor() {
    super("Concord is not configured (set CONCORD_API_KEY, and the organization id in Settings)");
    this.name = "ConcordNotConfiguredError";
  }
}

/**
 * Concord's `summaryStatus`, with UNKNOWN_CONTRACT (how Concord reports a
 * fully executed, imported document) folded into SIGNED.
 */
export type ConcordStatus = "DRAFT" | "VALIDATION" | "NEGOTIATION" | "SIGNING" | "SIGNED" | "BROKEN" | string;

export function normalizeConcordStatus(status: string): ConcordStatus {
  return status === "UNKNOWN_CONTRACT" ? "SIGNED" : status;
}

export interface CreateFromTemplateOptions {
  templateId: string;
  title: string;
  /** Template placeholders → values. */
  variables: Record<string, string>;
  /** Emails reserved on the template's signature slots, in slot order. */
  signers: string[];
  /** Concord folder to file the agreement in. */
  folderId?: string;
  /**
   * People to invite to the document with an email (usually the external
   * signers; people in our Concord organization already see it).
   */
  invite?: {
    emails: string[];
    subject: string;
    message: string;
    /** Concord member permission; external signers get LIMITED. */
    permission?: "LIMITED" | "NO_EDIT";
  };
}

export interface AgreementStatus {
  status: ConcordStatus;
  /** Uid of the signed document, which can differ from the one we created. */
  uid: string;
}

export interface ConcordClient {
  /** Link to open the agreement in Concord's web app. */
  agreementUrl(uid: string): string;
  /** Creates an agreement from a template and sends it for signature. Returns its uid. */
  createFromTemplate(opts: CreateFromTemplateOptions): Promise<string>;
  /** Current status; null if Concord no longer has the agreement. */
  getStatus(uid: string): Promise<AgreementStatus | null>;
  /**
   * Cancels pending signatures, trashes and deletes the agreement.
   * Resolves quietly if Concord no longer has it.
   */
  deleteAgreement(uid: string): Promise<void>;
}

type Fetch = typeof fetch;

export function createConcordClient(config: ConcordConfig, fetchImpl: Fetch = fetch): ConcordClient {
  const orgBase = `${config.apiUrl}/organizations/${encodeURIComponent(config.orgId)}`;
  const agreement = (uid: string) => `${orgBase}/agreements/${encodeURIComponent(uid)}`;

  async function call(method: string, url: string, body: unknown, ok: number[], what: string): Promise<Response> {
    const headers: Record<string, string> = { "X-API-KEY": config.apiKey, Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new ConcordError(`Could not ${what}: ${(e as Error).message}`);
    }
    if (!ok.includes(res.status)) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new ConcordError(`Could not ${what} (Concord answered ${res.status}${detail ? `: ${detail}` : ""})`, res.status);
    }
    return res;
  }

  async function getAgreement(uid: string): Promise<{ summaryStatus: string; signedUid: string | null } | null> {
    const res = await call("GET", agreement(uid), undefined, [200, 404], "get the agreement");
    if (res.status === 404) return null;
    const blob = await res.json();
    return { summaryStatus: blob.metadata?.summaryStatus ?? "", signedUid: blob.metadata?.signedUid || null };
  }

  async function deleteAgreement(uid: string): Promise<void> {
    const current = await getAgreement(uid);
    if (!current) return;
    const target = current.signedUid ?? uid;
    if (normalizeConcordStatus(current.summaryStatus) !== "SIGNED") {
      // Pending signatures have to be cancelled before the document can go.
      await call("DELETE", `${agreement(target)}/signature`, undefined, [204, 404], "cancel the signatures");
      await call("PATCH", agreement(target), { status: "BROKEN" }, [204], "cancel the agreement");
    }
    await call("PATCH", `${agreement(target)}/metadata`, { trash: true }, [204], "trash the agreement");
    await call("DELETE", agreement(target), undefined, [204, 404], "delete the agreement");
  }

  return {
    agreementUrl: (uid) => `${config.appUrl}/organizations/${config.orgId}/agreements/${uid}`,

    async createFromTemplate(opts) {
      const res = await call("POST", `${orgBase}/auto/${encodeURIComponent(opts.templateId)}`, {
        title: opts.title,
        description: "",
        signatureRequired: opts.signers.length,
        variables: opts.variables,
        sendWithDocument: false,
      }, [201], "create the agreement");
      const uid: string = (await res.json()).uid;

      try {
        const sig = await call("GET", `${agreement(uid)}/signature`, undefined, [200], "get the signature slots");
        const slots: { id: string | number }[] = (await sig.json()).slots ?? [];
        if (slots.length < opts.signers.length) {
          throw new ConcordError(`The template has ${slots.length} signature slot(s) but ${opts.signers.length} signer(s) were given`);
        }
        await call("PUT", `${agreement(uid)}/signature/slots`, opts.signers.map((email, i) => ({
          id: slots[i].id,
          reservation: { type: "EMAIL", email: { email } },
        })), [204], "assign the signers");

        await call("PATCH", agreement(uid), { status: "SIGNING" }, [204], "start the signature");

        if (opts.folderId) {
          await call("PUT", `${agreement(uid)}/folder`, { folderId: opts.folderId }, [204], "move the agreement to its folder");
        }

        if (opts.invite && opts.invite.emails.length > 0) {
          const permission = opts.invite.permission ?? "LIMITED";
          await call("POST", `${agreement(uid)}/members`, {
            invitations: Object.fromEntries(opts.invite.emails.map(email => [email, { permission }])),
            message: { subject: opts.invite.subject, content: opts.invite.message, name: "FundFlow" },
            saveMessage: false,
            sendWithDocument: false,
          }, [200], "invite the signers");
        }
      } catch (e) {
        // Don't leave a half-configured agreement behind in Concord.
        await deleteAgreement(uid).catch(err => console.error(`[concord] cleanup of ${uid} failed:`, err));
        throw e;
      }
      return uid;
    },

    async getStatus(uid) {
      const current = await getAgreement(uid);
      if (!current) return null;
      return { status: normalizeConcordStatus(current.summaryStatus), uid: current.signedUid ?? uid };
    },

    deleteAgreement,
  };
}

/** Client for a Concord config; throws ConcordNotConfiguredError when there is none. */
export function getConcordClient(config: ConcordConfig | null): ConcordClient {
  if (!config) throw new ConcordNotConfiguredError();
  return createConcordClient(config);
}
