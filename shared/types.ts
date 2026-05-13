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

export interface SpvInfo {
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
  organization?: { id: number; name: string; slug: string } | null;
  cash: string;
  assetValue: string;
  currentValue: string;
}

export interface SpvAssetInfo {
  id: number;
  spvId: number;
  companyName: string;
  instrumentType: string;
  purchaseDate: string | null;
  cost: string;
  notes: string | null;
  isDefault: boolean;
  createdAt: string;
  currentValue: string;
}

export interface SpvAssetValuationInfo {
  id: number;
  assetId: number;
  date: string;
  value: string;
  note: string | null;
  createdAt: string;
}

export interface SpvMemberInfo {
  id: number;
  spvId: number;
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
  spvId: number;
  spvName: string;
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
  managers: {
    id: number;
    accountId: number;
    account: { id: number; email: string; firstName: string; lastName: string };
  }[];
  ownerCount: number;
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

export interface EntityManagerInfo {
  id: number;
  entityId: number;
  accountId: number;
  createdAt: string;
  account: { id: number; email: string; firstName: string; lastName: string };
}

export interface AccountWithRoles {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  birthdate: string | null;
  taxId: string | null;
  streetAddress1: string | null;
  streetAddress2: string | null;
  country: string | null;
  city: string | null;
  stateProvince: string | null;
  zipPostalCode: string | null;
  language: string;
  profileComplete: boolean | null;
  createdAt: string;
  updatedAt: string;
  roles: Role[];
}
