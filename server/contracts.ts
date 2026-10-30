import { INCENTIVE_TYPES, type IncentiveType, type Account, type Contract, type PromoterIncentive, type UpdateConcordSettingsInput } from "@shared/schema";
import type { ConcordSettingsInfo, ContractDraft, ContractInfo, ContractKind } from "@shared/types";
import {
  createConcordClient, getConcordConfig, DEFAULT_CONCORD_API_URL, DEFAULT_CONCORD_APP_URL, type ConcordConfig,
} from "./concord";
import { storage } from "./storage";

/**
 * Concord settings edited in the admin Settings page, stored in `app_settings`.
 * Only the API key stays in the environment (CONCORD_API_KEY).
 */
export interface ConcordSettings {
  orgId: string;
  apiUrl: string;
  appUrl: string;
  signerEmail: string;
  promoterTemplateId: string;
  promoterFolderId: string;
}

const SETTING_KEYS: Record<keyof ConcordSettings, string> = {
  orgId: "concord_org_id",
  apiUrl: "concord_api_url",
  appUrl: "concord_app_url",
  signerEmail: "concord_signer_email",
  promoterTemplateId: "concord_promoter_template_id",
  promoterFolderId: "concord_promoter_folder_id",
};

export async function getConcordSettings(): Promise<ConcordSettings> {
  const stored = await storage.getAppSettings(Object.values(SETTING_KEYS));
  const entries = Object.entries(SETTING_KEYS).map(([field, key]) => [field, stored[key]?.trim() ?? ""]);
  return Object.fromEntries(entries) as ConcordSettings;
}

/** Saves the given fields (others are untouched); empty strings clear them. */
export async function updateConcordSettings(data: UpdateConcordSettingsInput): Promise<ConcordSettings> {
  const values: Record<string, string> = {};
  for (const [field, value] of Object.entries(data)) {
    if (value !== undefined) values[SETTING_KEYS[field as keyof ConcordSettings]] = value.trim();
  }
  await storage.setAppSettings(values);
  return getConcordSettings();
}

export function concordSettingsInfo(settings: ConcordSettings, env: NodeJS.ProcessEnv = process.env): ConcordSettingsInfo {
  return {
    ...settings,
    apiKeySet: !!env.CONCORD_API_KEY?.trim(),
    defaultApiUrl: DEFAULT_CONCORD_API_URL,
    defaultAppUrl: DEFAULT_CONCORD_APP_URL,
  };
}

/** Concord connection from CONCORD_API_KEY + stored settings; null when not configured. */
export function concordConfigFrom(settings: ConcordSettings, env: NodeJS.ProcessEnv = process.env): ConcordConfig | null {
  return getConcordConfig(env.CONCORD_API_KEY, settings);
}

/** Concord settings for one kind of contract. */
export interface ContractTemplate {
  templateId: string | null;
  folderId: string | null;
}

const TEMPLATE_SETTINGS: Record<ContractKind, { template: keyof ConcordSettings; folder: keyof ConcordSettings }> = {
  promoter_agreement: { template: "promoterTemplateId", folder: "promoterFolderId" },
};

export function getContractTemplate(kind: ContractKind, settings: ConcordSettings): ContractTemplate {
  const fields = TEMPLATE_SETTINGS[kind];
  return {
    templateId: settings[fields.template] || null,
    folderId: settings[fields.folder] || null,
  };
}

/** Who signs for us; defaults to the admin sending the contract. */
export function getOurSigner(fallbackEmail: string, settings: ConcordSettings): string {
  return settings.signerEmail || fallbackEmail;
}

export function serializeContract(contract: Contract, config: ConcordConfig | null): ContractInfo {
  return {
    ...contract,
    kind: contract.kind as ContractKind,
    statusCheckedAt: contract.statusCheckedAt?.toISOString() ?? null,
    signedAt: contract.signedAt?.toISOString() ?? null,
    createdAt: contract.createdAt?.toISOString() ?? "",
    updatedAt: contract.updatedAt?.toISOString() ?? "",
    url: config ? createConcordClient(config).agreementUrl(contract.concordUid) : null,
  };
}

// The Concord template is in English, so the contract's content (title and
// variables) is too. Only the invitation email follows the promoter's language.
const INVITES: Record<"en" | "es" | "fr", { subject: (name: string) => string; message: string }> = {
  en: {
    subject: (name) => `Promoter Agreement for ${name}`,
    message: "Please review and sign the attached agreement.",
  },
  es: {
    subject: (name) => `Acuerdo de Promotor para ${name}`,
    message: "Por favor, revisa y firma el acuerdo adjunto.",
  },
  fr: {
    subject: (name) => `Contrat de Promoteur pour ${name}`,
    message: "Veuillez examiner et signer le contrat ci-joint.",
  },
};

const FEE_LABELS: Record<IncentiveType, string> = {
  management_fee: "of the management fee",
  success_fee: "of the success fee",
};

/**
 * "Detail of Fees": every incentive, management fee first, in capitals,
 * joined with "; " (template variables are single-line text).
 */
export function formatFeeDetail(incentives: PromoterIncentive[]): string {
  const percent = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 2 });
  const order = (i: PromoterIncentive) => INCENTIVE_TYPES.indexOf(i.type as IncentiveType);
  return [...incentives]
    .sort((a, b) => order(a) - order(b))
    .map(i => `${percent.format(Number(i.percent) / 100)} ${FEE_LABELS[i.type as IncentiveType]}`)
    .join("; ")
    .toUpperCase();
}

/**
 * Suggested title, signers, template variables and invite message for a
 * promoter agreement. The admin reviews (and may edit) them before sending,
 * so variable names only need to match the Concord template's placeholders.
 */
export function buildPromoterContractDraft(
  account: Account,
  incentives: PromoterIncentive[],
  ourSigner: string,
  ready: boolean,
  // Where the promoter's copy goes: their email, or their manager's when they're a managed account.
  signerEmail: string,
): ContractDraft {
  // Full legal name, middle name included.
  const name = [account.firstName, account.middleName, account.lastName].map(p => p?.trim()).filter(Boolean).join(" ");
  const invite = INVITES[account.language === "es" || account.language === "fr" ? account.language : "en"];
  const join = (parts: (string | null | undefined)[]) => parts.map(p => p?.trim()).filter(Boolean).join(", ");
  // The template's two signature slots: the promoter, then our Managing Partner.
  const signers = signerEmail.toLowerCase() === ourSigner.toLowerCase() ? [signerEmail] : [signerEmail, ourSigner];
  return {
    ready,
    title: `Promoter Agreement for ${name}`,
    signers,
    variables: {
      "Beneficiary": name,
      "Nationality": account.nationality ?? "",
      "Address Street": join([account.streetAddress1, account.streetAddress2]),
      "Address State": join([account.city, account.stateProvince, account.zipPostalCode]),
      "Address Country": account.country ?? "",
      "Email": signerEmail,
      "Detail of Fees": formatFeeDetail(incentives),
    },
    subject: invite.subject(name),
    message: invite.message,
  };
}
