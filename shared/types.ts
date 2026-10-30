export interface Role {
  id: number;
  name: string;
  description: string | null;
}

export interface OrganizerAccount {
  id: number;
  accountId: number;
  organizationId: number;
  createdAt: string;
  account: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export interface MemberInfo {
  id: number;
  organizationId: number;
  accountId: number;
  status: string;
  inviteId: number | null;
  /** Default terms (percent) for this member's investments in the organization; null = none. */
  managementFeePercent: string | null;
  successFeePercent: string | null;
  createdAt: string;
  account: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export interface InviteInfo {
  id: number;
  organizationId: number;
  token: string;
  used: boolean;
  usedByAccountId: number | null;
  createdAt: string;
  usedByAccount?: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
}

export interface OrganizationWithOrganizers {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  website: string | null;
  logoUrl: string | null;
  country: string | null;
  city: string | null;
  stateProvince: string | null;
  createdAt: string;
  updatedAt: string;
  organizers: OrganizerAccount[];
}

export interface OrganizationPublic {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  website: string | null;
  logoUrl: string | null;
  country: string | null;
  city: string | null;
  stateProvince: string | null;
}

export interface VehicleInfo {
  id: number;
  organizationId: number;
  legalName: string;
  displayName: string;
  entityType: string | null;
  stateOfIncorporation: string | null;
  ein: string | null;
  dateEstablished: string | null;
  dateEnded: string | null;
  allocationMethod: string | null;
  currency: string | null;
  managementFeePercent: string | null;
  carriedInterestPercent: string | null;
  preferredReturnPercent: string | null;
  country: string | null;
  streetAddress: string | null;
  streetAddress2: string | null;
  city: string | null;
  stateProvince: string | null;
  zipPostalCode: string | null;
  county: string | null;
  managerId: number | null;
  signatoryId: number | null;
  bankName: string | null;
  bankAddress: string | null;
  bankRoutingNumber: string | null;
  bankSwiftCode: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  forFurtherCreditTo: string | null;
  wiringInstructions: string | null;
  investmentCompanyName: string | null;
  investmentType: string | null;
  totalBeingRaised: string | null;
  minimumInvestment: string | null;
  expectedClosingDate: string | null;
  autoDeploy: boolean;
  createdAt: string;
  updatedAt: string;
  manager?: { id: number; email: string; firstName: string; lastName: string } | null;
  signatory?: { id: number; email: string; firstName: string; lastName: string } | null;
  memberCount: number;
  /** Number of share classes (always ≥ 1; the UI only shows them when there are several). */
  classCount: number;
  organization?: { id: number; name: string; slug: string } | null;
  cash: string;
  assetValue: string;
  currentValue: string;
}

/** A share class of a Vehicle: a segregated pool of investors and assets. */
export interface VehicleClassInfo {
  id: number;
  vehicleId: number;
  name: string;
  notes: string | null;
  createdAt: string;
  memberCount: number;
  assetCount: number;
  committed: string;
  totalCalled: string;
  cash: string;
  assetValue: string;
  currentValue: string;
}

export interface VehicleAssetInfo {
  id: number;
  vehicleId: number;
  classId: number;
  companyName: string;
  instrumentType: string;
  purchaseDate: string | null;
  cost: string;
  notes: string | null;
  isDefault: boolean;
  createdAt: string;
  currentValue: string;
}

export interface VehicleAssetValuationInfo {
  id: number;
  assetId: number;
  date: string;
  value: string;
  note: string | null;
  createdAt: string;
}

export interface VehicleMemberInfo {
  id: number;
  vehicleId: number;
  classId: number;
  className: string;
  accountId: number | null;
  entityId: number | null;
  investorType: "account" | "entity";
  committed: string | null;
  managementFee: string | null;
  otherFee: string | null;
  carry: string | null;
  totalCalled: string | null;
  distributed: string | null;
  ownershipPercent: string | null;
  currentValue: string;
  date: string | null;
  createdAt: string;
  account: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  entity: {
    id: number;
    name: string;
    entityType: string;
  } | null;
}

export interface PortfolioInvestment {
  memberId: number;
  vehicleId: number;
  vehicleName: string;
  classId: number;
  className: string;
  /** The Vehicle's number of share classes (classes are only shown when there are several). */
  vehicleClassCount: number;
  investmentCompanyName: string;
  investmentType: string;
  organizationId: number;
  organizationName: string;
  organizationSlug: string;
  investorType: "account" | "entity";
  investorId: number;
  investorName: string;
  investorEmail: string | null;
  investorEntityType: string | null;
  committed: string;
  managementFee: string;
  otherFee: string;
  carry: string;
  totalCalled: string;
  distributed: string;
  currentValue: string;
  date: string | null;
  currency: string;
}

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  active: boolean;
}

export interface ExchangeRatesInfo {
  base: "USD";
  rates: Record<string, number>;
  updatedAt: string | null;
}

export interface EntityInfo {
  id: number;
  name: string;
  entityType: string;
  dateEstablished: string | null;
  currency: string | null;
  taxId: string | null;
  ownershipAllocation: string | null;
  country: string | null;
  streetAddress: string | null;
  streetAddress2: string | null;
  city: string | null;
  stateProvince: string | null;
  zipPostalCode: string | null;
  disbursementMethod: string | null;
  bankName: string | null;
  bankAddress: string | null;
  bankRoutingNumber: string | null;
  bankSwiftCode: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  forFurtherCreditTo: string | null;
  createdAt: string;
  updatedAt: string;
  /** Manager-level delegates. */
  managers: {
    id: number;
    accountId: number;
    account: { id: number; email: string; firstName: string; lastName: string };
  }[];
  ownerCount: number;
  /** Only on GET /api/entities/:id — how the caller reaches this entity. */
  access?: "admin" | DelegationLevel;
}

export interface EntityOwnerInfo {
  id: number;
  entityId: number;
  ownerType: string;
  ownerAccountId: number | null;
  ownerEntityId: number | null;
  ownershipPercent: string | null;
  createdAt: string;
  ownerAccount?: { id: number; email: string; firstName: string; lastName: string } | null;
  ownerEntity?: { id: number; name: string; entityType: string } | null;
}

export interface AccountWithRoles {
  id: number;
  email: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  phone: string | null;
  birthdate: string | null;
  nationality: string | null;
  taxId: string | null;
  streetAddress1: string | null;
  streetAddress2: string | null;
  country: string | null;
  city: string | null;
  stateProvince: string | null;
  zipPostalCode: string | null;
  mailingStreetAddress1: string | null;
  mailingStreetAddress2: string | null;
  mailingCountry: string | null;
  mailingCity: string | null;
  mailingStateProvince: string | null;
  mailingZipPostalCode: string | null;
  language: string;
  profileComplete: boolean | null;
  createdAt: string;
  updatedAt: string;
  roles: Role[];
  /** Only on GET /api/accounts/:id — how the caller reaches this account. */
  access?: "admin" | "self" | DelegationLevel;
}

export interface IntroductionInfo {
  id: number;
  introducerAccountId: number;
  introducedAccountId: number | null;
  introducedEntityId: number | null;
  /** Set when the entity introduction is inherited through this managing account. */
  viaAccountId: number | null;
  date: string | null;
  notes: string | null;
  createdAt: string;
  introducer: { id: number; email: string; firstName: string; lastName: string } | null;
  introducedAccount: { id: number; email: string; firstName: string; lastName: string } | null;
  introducedEntity: { id: number; name: string; entityType: string } | null;
  via: { id: number; email: string; firstName: string; lastName: string } | null;
}

export interface AccountIntroductionsInfo {
  introducedBy: IntroductionInfo[];
  introduced: IntroductionInfo[];
  unavailable: {
    introducerAccountIds: number[];
    introducedAccountIds: number[];
    introducedEntityIds: number[];
  };
}

export type DelegationLevel = "observer" | "manager";

/** The principal is an account or an entity (exactly one); the delegate is always an account. */
export interface DelegationInfo {
  id: number;
  principalAccountId: number | null;
  principalEntityId: number | null;
  delegateAccountId: number;
  level: DelegationLevel;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  principal: { id: number; email: string; firstName: string; lastName: string } | null;
  principalEntity: { id: number; name: string; entityType: string } | null;
  delegate: { id: number; email: string; firstName: string; lastName: string } | null;
}

export interface AccountDelegationsInfo {
  /** Accounts and entities that delegated to this one (it acts for them). */
  delegatedIn: DelegationInfo[];
  /** Accounts this one delegated to (they act for it). */
  delegatedOut: DelegationInfo[];
}

/** "<fromAccount> is the <description> of <toAccount>". */
export interface RelationshipInfo {
  id: number;
  fromAccountId: number;
  toAccountId: number;
  description: string;
  createdAt: string;
  fromAccount: { id: number; email: string; firstName: string; lastName: string } | null;
  toAccount: { id: number; email: string; firstName: string; lastName: string } | null;
}

export type IncentiveType = "management_fee" | "success_fee";

export interface PromoterIncentiveInfo {
  id: number;
  promoterId: number;
  type: IncentiveType;
  /** Share of that fee, 0–100, as a numeric string (e.g. "20.00"). */
  percent: string;
  notes: string | null;
  createdAt: string;
}

export interface PromoterInfo {
  id: number;
  accountId: number;
  active: boolean;
  contractDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  account: { id: number; email: string; firstName: string; lastName: string };
  incentives: PromoterIncentiveInfo[];
  /** Accounts and entities credited to this promoter, inherited entity credit included. */
  introductionCount: number;
  /** Whether a promoter agreement is signed; a promoter can only be active then. */
  hasSignedContract: boolean;
}

export type ContractKind = "promoter_agreement";

/** A contract sent for e-signature through ConcordNow. */
export interface ContractInfo {
  id: number;
  kind: ContractKind;
  concordUid: string;
  title: string;
  /** Concord summary status: DRAFT, SIGNING, SIGNED, BROKEN… */
  status: string;
  signers: string[];
  promoterId: number | null;
  createdByAccountId: number | null;
  /** When the status was last read from Concord. */
  statusCheckedAt: string | null;
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Link to the document in Concord; null when Concord isn't configured. */
  url: string | null;
}

/** Suggested contract to review (and edit) before sending it through Concord. */
/** Concord settings as shown in the admin Settings page (`GET /api/settings/concord`). */
export interface ConcordSettingsInfo {
  orgId: string;
  apiUrl: string;
  appUrl: string;
  signerEmail: string;
  promoterTemplateId: string;
  promoterFolderId: string;
  /** Whether the CONCORD_API_KEY env var is set (the key itself is never returned). */
  apiKeySet: boolean;
  defaultApiUrl: string;
  defaultAppUrl: string;
}

export interface ContractDraft {
  /** Whether Concord and the promoter agreement template are configured. */
  ready: boolean;
  title: string;
  signers: string[];
  variables: Record<string, string>;
  /** Invitation email subject, in the signer's language (the title stays in the contract's language). */
  subject: string;
  message: string;
}
