import { eq, ilike, or, sql, and, lt, inArray, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  accounts, roles, accountRoles, organizations, organizationOrganizers,
  organizationMembers, organizationInvites, vehicles, vehicleMembers,
  vehicleAssets, vehicleAssetValuations, vehicleClasses,
  entities, entityOwners, introductions, delegations, relationships, promoters, promoterIncentives, contracts, passwordResetTokens,
  apiTokens, currencies, appSettings, PASSWORD_RESET_TTL_MS,
  type Account, type Role, type InsertAccount, type UpdateAccount,
  type Organization, type InsertOrganization, type UpdateOrganization,
  type OrganizationMember, type OrganizationInvite,
  type Vehicle, type VehicleMember, type InsertVehicle, type UpdateVehicle,
  type VehicleAsset, type VehicleAssetValuation, type VehicleClass,
  type Entity, type EntityOwner,
  type Introduction, type CreateIntroductionInput, type UpdateIntroductionInput,
  type Delegation, type DelegationLevel, type CreateDelegationInput, type UpdateDelegationInput,
  type Relationship, type CreateRelationshipInput, type UpdateRelationshipInput,
  type Promoter, type PromoterIncentive, type CreatePromoterInput, type UpdatePromoterInput,
  type CreateIncentiveInput, type UpdateIncentiveInput,
  type Contract,
  type InsertEntity, type UpdateEntity,
  type PasswordResetToken,
  type ApiToken, type PublicApiToken,
} from "@shared/schema";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { resolveSeedAdminPassword } from "./seed";
import { computeInheritedIntroducers, type IntroductionGraph } from "./introductions";
import { poolFinancials, totalFinancials, memberShares, DEFAULT_CLASS_NAME, type PoolFinancials } from "@shared/vehicle-classes";

type InvestmentFields = {
  classId?: number;
  committed?: string;
  managementFee?: string;
  otherFee?: string;
  carry?: string;
  totalCalled?: string;
  distributed?: string;
  ownershipPercent?: string | null;
  date?: string | null;
};

export type AssetFields = {
  classId?: number;
  companyName?: string;
  instrumentType?: string;
  purchaseDate?: string | null;
  cost?: string;
  notes?: string;
  isDefault?: boolean;
};

export interface VehicleAssetWithCurrent extends VehicleAsset {
  currentValue: string;
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

export const db = drizzle(process.env.DATABASE_URL);

export interface AccountWithRoles extends Account {
  roles: Role[];
}

export interface OrganizerInfo {
  id: number;
  accountId: number;
  organizationId: number;
  createdAt: Date | null;
  account: { id: number; email: string; firstName: string; lastName: string };
}

export interface OrganizationWithOrganizers extends Organization {
  organizers: OrganizerInfo[];
}

export interface MemberWithAccount extends OrganizationMember {
  account: { id: number; email: string; firstName: string; lastName: string };
}

export interface InviteWithAccount extends OrganizationInvite {
  usedByAccount?: { id: number; email: string; firstName: string; lastName: string } | null;
}

export interface VehicleWithDetails extends Vehicle {
  manager?: { id: number; email: string; firstName: string; lastName: string } | null;
  signatory?: { id: number; email: string; firstName: string; lastName: string } | null;
  memberCount: number;
  classCount: number;
  organization?: { id: number; name: string; slug: string } | null;
  cash: string;
  assetValue: string;
  currentValue: string;
}

/** A share class with the financials of its pool. */
export interface VehicleClassWithDetails extends VehicleClass {
  memberCount: number;
  assetCount: number;
  committed: string;
  totalCalled: string;
  cash: string;
  assetValue: string;
  currentValue: string;
}

export type DeleteVehicleClassResult = "deleted" | "not_found" | "in_use" | "last_class";

export interface VehicleMemberWithAccount extends VehicleMember {
  className: string | null;
  investorType: "account" | "entity";
  account: { id: number; email: string; firstName: string; lastName: string } | null;
  entity: { id: number; name: string; entityType: string } | null;
  currentValue: string;
}

export interface PortfolioInvestment {
  memberId: number;
  vehicleId: number;
  vehicleName: string;
  classId: number;
  className: string;
  /** The Vehicle's number of classes (the UI only shows classes when there are several). */
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

export interface EntityWithDetails extends Entity {
  managers: { id: number; accountId: number; account: { id: number; email: string; firstName: string; lastName: string } }[];
  ownerCount: number;
}

export interface EntityOwnerWithDetails extends EntityOwner {
  ownerAccount?: { id: number; email: string; firstName: string; lastName: string } | null;
  ownerEntity?: { id: number; name: string; entityType: string } | null;
}

export interface IntroductionWithDetails extends Introduction {
  introducer: { id: number; email: string; firstName: string; lastName: string } | null;
  introducedAccount: { id: number; email: string; firstName: string; lastName: string } | null;
  introducedEntity: { id: number; name: string; entityType: string } | null;
  via: { id: number; email: string; firstName: string; lastName: string } | null;
}

export interface AccountIntroductions {
  /** Introductions of this account (who introduced it). */
  introducedBy: IntroductionWithDetails[];
  /** Accounts and entities this account introduced, including inherited entity rows. */
  introduced: IntroductionWithDetails[];
}

type AccountSummary = { id: number; email: string; firstName: string; lastName: string };

export interface DelegationWithDetails extends Delegation {
  /** Set when the principal is an account. */
  principal: AccountSummary | null;
  /** Set when the principal is an entity. */
  principalEntity: { id: number; name: string; entityType: string } | null;
  delegate: AccountSummary | null;
}

export interface AccountDelegations {
  /** Accounts and entities that delegated to this one (this account acts for them). */
  delegatedIn: DelegationWithDetails[];
  /** Accounts this one delegated to (they act for this account). */
  delegatedOut: DelegationWithDetails[];
}

export interface RelationshipWithDetails extends Relationship {
  fromAccount: AccountSummary | null;
  toAccount: AccountSummary | null;
}

export interface PromoterWithDetails extends Promoter {
  account: { id: number; email: string; firstName: string; lastName: string };
  incentives: PromoterIncentive[];
  /** Introductions made by the promoter's account, inherited entity credit included. */
  introductionCount: number;
  /** Whether a promoter agreement is signed; a promoter can only be active then. */
  hasSignedContract: boolean;
}

export type NewContract = Pick<Contract, "kind" | "concordUid" | "title" | "status" | "signers">
  & Partial<Pick<Contract, "promoterId" | "createdByAccountId" | "statusCheckedAt">>;
export type ContractUpdate = Partial<Pick<Contract, "concordUid" | "status" | "statusCheckedAt" | "signedAt">>;

export interface IStorage {
  getRoles(): Promise<Role[]>;
  getAccounts(search?: string): Promise<AccountWithRoles[]>;
  getAccount(id: number): Promise<AccountWithRoles | undefined>;
  getAccountByEmail(email: string): Promise<Account | undefined>;
  verifyPassword(accountId: number, password: string): Promise<boolean>;
  createAccount(data: InsertAccount): Promise<AccountWithRoles>;
  updateAccount(id: number, data: UpdateAccount): Promise<AccountWithRoles | undefined>;
  deleteAccount(id: number): Promise<boolean>;

  getOrganizations(): Promise<OrganizationWithOrganizers[]>;
  getOrganization(id: number): Promise<OrganizationWithOrganizers | undefined>;
  getOrganizationBySlug(slug: string): Promise<OrganizationWithOrganizers | undefined>;
  createOrganization(data: InsertOrganization): Promise<OrganizationWithOrganizers>;
  updateOrganization(id: number, data: UpdateOrganization): Promise<OrganizationWithOrganizers | undefined>;
  deleteOrganization(id: number): Promise<boolean>;
  addOrganizer(organizationId: number, accountId: number): Promise<void>;
  removeOrganizer(organizationId: number, accountId: number): Promise<boolean>;

  getMembers(organizationId: number): Promise<MemberWithAccount[]>;
  getMember(organizationId: number, accountId: number): Promise<MemberWithAccount | undefined>;
  createMemberRequest(organizationId: number, accountId: number, inviteId?: number, initialStatus?: "pending" | "approved"): Promise<MemberWithAccount>;
  updateMemberStatus(organizationId: number, accountId: number, status: string): Promise<MemberWithAccount | undefined>;
  /** Sets the member's default fee percentages (null clears one; undefined leaves it). */
  updateMemberFees(organizationId: number, accountId: number, fees: { managementFeePercent?: string | null; successFeePercent?: string | null }): Promise<MemberWithAccount | undefined>;
  removeMember(organizationId: number, accountId: number): Promise<boolean>;

  getInvites(organizationId: number): Promise<InviteWithAccount[]>;
  createInvite(organizationId: number): Promise<OrganizationInvite>;
  getInviteByToken(token: string): Promise<InviteWithAccount | undefined>;
  useInvite(token: string, accountId: number): Promise<void>;
  deleteInvite(organizationId: number, inviteId: number): Promise<boolean>;

  getAllVehicles(): Promise<VehicleWithDetails[]>;
  getVehicles(organizationId: number): Promise<VehicleWithDetails[]>;
  getVehicle(id: number): Promise<VehicleWithDetails | undefined>;
  createVehicle(data: InsertVehicle): Promise<VehicleWithDetails>;
  updateVehicle(id: number, data: UpdateVehicle): Promise<VehicleWithDetails | undefined>;
  deleteVehicle(id: number): Promise<boolean>;
  getVehicleMembers(vehicleId: number): Promise<VehicleMemberWithAccount[]>;
  addVehicleMember(vehicleId: number, investor: { accountId: number } | { entityId: number }, investment?: InvestmentFields): Promise<VehicleMemberWithAccount>;
  updateVehicleMemberById(vehicleId: number, memberId: number, investment: InvestmentFields): Promise<VehicleMemberWithAccount | undefined>;
  removeVehicleMemberById(vehicleId: number, memberId: number): Promise<boolean>;
  getVehicleClasses(vehicleId: number): Promise<VehicleClassWithDetails[]>;
  createVehicleClass(vehicleId: number, data: { name: string; notes?: string }): Promise<VehicleClassWithDetails>;
  updateVehicleClass(vehicleId: number, classId: number, data: { name?: string; notes?: string }): Promise<VehicleClassWithDetails | undefined>;
  /** Refused while the class holds positions or assets ("in_use") or is the Vehicle's last ("last_class"). */
  deleteVehicleClass(vehicleId: number, classId: number): Promise<DeleteVehicleClassResult>;
  getVehicleAssets(vehicleId: number): Promise<VehicleAssetWithCurrent[]>;
  getVehicleAsset(vehicleId: number, assetId: number): Promise<VehicleAssetWithCurrent | undefined>;
  createVehicleAsset(vehicleId: number, data: AssetFields & { companyName: string }): Promise<VehicleAssetWithCurrent>;
  updateVehicleAsset(vehicleId: number, assetId: number, data: AssetFields): Promise<VehicleAssetWithCurrent | undefined>;
  deleteVehicleAsset(vehicleId: number, assetId: number): Promise<boolean>;
  getAssetValuations(assetId: number): Promise<VehicleAssetValuation[]>;
  addAssetValuation(assetId: number, data: { date: string; value: string; note?: string }): Promise<VehicleAssetValuation>;
  removeAssetValuation(assetId: number, valuationId: number): Promise<boolean>;
  getPortfolio(filter?: { accountIds?: number[]; entityIds?: number[] }): Promise<PortfolioInvestment[]>;
  getEntityIdsOwnedByAccount(accountId: number): Promise<number[]>;

  getAllEntities(search?: string): Promise<EntityWithDetails[]>;
  getEntity(id: number): Promise<EntityWithDetails | undefined>;
  /** Creates the entity with a manager-level delegation for each of the accounts. */
  createEntity(data: InsertEntity, managerAccountIds: number[]): Promise<EntityWithDetails>;
  updateEntity(id: number, data: UpdateEntity): Promise<EntityWithDetails | undefined>;
  deleteEntity(id: number): Promise<boolean>;
  getEntityOwners(entityId: number): Promise<EntityOwnerWithDetails[]>;
  addEntityOwner(entityId: number, ownerType: string, ownerAccountId: number | null, ownerEntityId: number | null, ownershipPercent: string): Promise<EntityOwnerWithDetails>;
  removeEntityOwner(ownerId: number): Promise<boolean>;

  getIntroductionGraph(): Promise<IntroductionGraph>;
  getIntroduction(id: number): Promise<Introduction | undefined>;
  getIntroductionsForAccount(accountId: number): Promise<AccountIntroductions>;
  getIntroductionsForEntity(entityId: number): Promise<IntroductionWithDetails[]>;
  /** Returns null if the same direct introduction already exists. */
  createIntroduction(data: CreateIntroductionInput): Promise<IntroductionWithDetails | null>;
  updateIntroduction(id: number, data: UpdateIntroductionInput): Promise<IntroductionWithDetails | undefined>;
  deleteIntroduction(id: number): Promise<boolean>;

  getDelegation(id: number): Promise<Delegation | undefined>;
  getDelegationsForAccount(accountId: number): Promise<AccountDelegations>;
  getDelegationsForEntity(entityId: number): Promise<DelegationWithDetails[]>;
  /** Accounts (not entities) that delegated to this account, with the level each granted. */
  getDelegatorsOf(delegateAccountId: number): Promise<{ accountId: number; level: DelegationLevel }[]>;
  /** Returns null if the principal already delegated to that account. */
  createDelegation(data: CreateDelegationInput): Promise<DelegationWithDetails | null>;
  updateDelegation(id: number, data: UpdateDelegationInput): Promise<DelegationWithDetails | undefined>;
  deleteDelegation(id: number): Promise<boolean>;

  getRelationship(id: number): Promise<Relationship | undefined>;
  /** Relationships on either side of the account. */
  getRelationshipsForAccount(accountId: number): Promise<RelationshipWithDetails[]>;
  /** Returns null if the same from → to relationship already exists. */
  createRelationship(data: CreateRelationshipInput): Promise<RelationshipWithDetails | null>;
  updateRelationship(id: number, data: UpdateRelationshipInput): Promise<RelationshipWithDetails | undefined>;
  deleteRelationship(id: number): Promise<boolean>;

  getPromoters():Promise<PromoterWithDetails[]>;
  getPromoter(id: number): Promise<PromoterWithDetails | undefined>;
  getPromoterByAccountId(accountId: number): Promise<Promoter | undefined>;
  /** Creates the promoter with its incentives; returns null if the account already is one. */
  createPromoter(data: CreatePromoterInput): Promise<PromoterWithDetails | null>;
  updatePromoter(id: number, data: UpdatePromoterInput): Promise<PromoterWithDetails | undefined>;
  deletePromoter(id: number): Promise<boolean>;
  getPromoterIncentive(id: number): Promise<PromoterIncentive | undefined>;
  /** Returns null if the promoter already has an incentive of that type. */
  createPromoterIncentive(promoterId: number, data: CreateIncentiveInput): Promise<PromoterIncentive | null>;
  updatePromoterIncentive(id: number, data: UpdateIncentiveInput): Promise<PromoterIncentive | undefined>;
  deletePromoterIncentive(id: number): Promise<boolean>;

  getContract(id: number): Promise<Contract | undefined>;
  getContractsForPromoter(promoterId: number): Promise<Contract[]>;
  createContract(data: NewContract): Promise<Contract>;
  updateContract(id: number, data: ContractUpdate): Promise<Contract | undefined>;
  deleteContract(id: number): Promise<boolean>;

  /** `app_settings` values for these keys; missing keys are left out. */
  getAppSettings(keys: string[]): Promise<Record<string, string>>;
  /** Upserts each key; an empty string clears the setting back to its default. */
  setAppSettings(values: Record<string, string>): Promise<void>;

  getOrganizationIdsForAccount(accountId: number): Promise<number[]>;
  getOrganizationIdsAsOrganizer(accountId: number): Promise<number[]>;
  /** Entities that delegated to the account at `minLevel` or above (any level by default). */
  getEntityIdsForAccount(accountId: number, minLevel?: DelegationLevel): Promise<number[]>;
  getVehicleIdsForAccount(accountId: number): Promise<number[]>;

  createPasswordResetToken(accountId: number, ttlMs?: number): Promise<string>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  usePasswordResetToken(token: string): Promise<void>;
  updatePassword(accountId: number, newPassword: string): Promise<void>;

  createApiToken(accountId: number, name: string, prefix: string, tokenHash: string, expiresAt: Date | null): Promise<PublicApiToken>;
  getApiTokenByHash(tokenHash: string): Promise<ApiToken | undefined>;
  listApiTokensForAccount(accountId: number): Promise<PublicApiToken[]>;
  revokeApiToken(id: number, accountId: number): Promise<boolean>;
  touchApiTokenLastUsed(id: number): Promise<void>;

  getActiveCurrencyCodes(): Promise<string[]>;

  seedData(): Promise<void>;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function attachRoles(accountList: Account[]): Promise<AccountWithRoles[]> {
  if (accountList.length === 0) return [];
  const allAccountRoles = await db.select().from(accountRoles);
  const allRoles = await db.select().from(roles);
  const roleMap = new Map(allRoles.map(r => [r.id, r]));

  return accountList.map(account => ({
    ...account,
    roles: allAccountRoles
      .filter(ar => ar.accountId === account.id)
      .map(ar => roleMap.get(ar.roleId))
      .filter((r): r is Role => !!r),
  }));
}

function isProfileComplete(account: Record<string, unknown>): boolean {
  const requiredFields = ["firstName", "lastName", "email", "streetAddress1", "country", "city", "stateProvince", "zipPostalCode"];
  return requiredFields.every(f => {
    const val = account[f];
    return val !== null && val !== undefined && val !== "";
  });
}

async function setRoles(accountId: number, roleNames: string[]): Promise<void> {
  await db.delete(accountRoles).where(eq(accountRoles.accountId, accountId));
  if (roleNames.length > 0) {
    const allRoles = await db.select().from(roles);
    const roleIds = allRoles
      .filter(r => roleNames.includes(r.name))
      .map(r => r.id);
    for (const roleId of roleIds) {
      await db.insert(accountRoles).values({ accountId, roleId }).onConflictDoNothing();
    }
  }
}

async function getAccountSummary(accountId: number): Promise<{ id: number; email: string; firstName: string; lastName: string } | null> {
  const [acct] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!acct) return null;
  return { id: acct.id, email: acct.email, firstName: acct.firstName, lastName: acct.lastName };
}

async function getEntitySummary(entityId: number): Promise<{ id: number; name: string; entityType: string } | null> {
  const [ent] = await db.select().from(entities).where(eq(entities.id, entityId));
  if (!ent) return null;
  return { id: ent.id, name: ent.name, entityType: ent.entityType };
}

export class DatabaseStorage implements IStorage {
  async getRoles(): Promise<Role[]> {
    return db.select().from(roles).orderBy(roles.id);
  }

  async getAccounts(search?: string): Promise<AccountWithRoles[]> {
    let accountList: Account[];
    if (search) {
      const pattern = `%${search}%`;
      accountList = await db.select().from(accounts)
        .where(or(
          sql`unaccent(${accounts.firstName}) ilike unaccent(${pattern})`,
          sql`unaccent(${accounts.lastName}) ilike unaccent(${pattern})`,
          sql`unaccent(${accounts.email}) ilike unaccent(${pattern})`
        ))
        .orderBy(sql`${accounts.createdAt} DESC`);
    } else {
      accountList = await db.select().from(accounts).orderBy(sql`${accounts.createdAt} DESC`);
    }

    return attachRoles(accountList);
  }

  async getAccount(id: number): Promise<AccountWithRoles | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
    if (!account) return undefined;
    const [withRoles] = await attachRoles([account]);
    return withRoles;
  }

  async getAccountByEmail(email: string): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.email, email));
    return account;
  }

  async verifyPassword(accountId: number, password: string): Promise<boolean> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    if (!account) return false;
    const bcrypt = await import("bcrypt");
    return bcrypt.compare(password, account.passwordHash);
  }

  async createAccount(data: InsertAccount): Promise<AccountWithRoles> {
    const { password, roles: roleNames, ...rest } = data;
    const bcrypt = await import("bcrypt");
    // No password → hash a random secret nobody knows, so the account cannot
    // log in until the user sets a password via a setup/reset token.
    const passwordHash = await bcrypt.hash(password ?? crypto.randomBytes(32).toString("hex"), 10);

    const profileComplete = isProfileComplete(rest);
    const [account] = await db.insert(accounts).values({
      ...rest,
      passwordHash,
      profileComplete,
    }).returning();

    if (roleNames && roleNames.length > 0) {
      await setRoles(account.id, roleNames);
    }

    return (await this.getAccount(account.id))!;
  }

  async updateAccount(id: number, data: UpdateAccount): Promise<AccountWithRoles | undefined> {
    const existing = await this.getAccount(id);
    if (!existing) return undefined;

    const { roles: roleNames, ...fields } = data;

    const updateFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        updateFields[key] = value;
      }
    }

    if (Object.keys(updateFields).length > 0) {
      updateFields.updatedAt = new Date();
      const merged = { ...existing, ...updateFields };
      updateFields.profileComplete = isProfileComplete(merged);
      await db.update(accounts).set(updateFields).where(eq(accounts.id, id));
    }

    if (roleNames !== undefined) {
      await setRoles(id, roleNames);
    }

    return this.getAccount(id);
  }

  async deleteAccount(id: number): Promise<boolean> {
    // Inherited introductions routed through this account cascade away; a
    // co-manager may still pass the same credit on, so re-derive afterwards.
    const managed = await this.getManagedEntityIds([id]);
    const result = await db.delete(accounts).where(eq(accounts.id, id)).returning();
    await this.syncInheritedIntroductions(managed);
    return result.length > 0;
  }

  private async attachOrganizers(orgList: Organization[]): Promise<OrganizationWithOrganizers[]> {
    if (orgList.length === 0) return [];
    const allOrgOrganizers = await db.select().from(organizationOrganizers);
    const orgIds = orgList.map(o => o.id);
    const relevantOrgOrganizers = allOrgOrganizers.filter(oo => orgIds.includes(oo.organizationId));
    const accountIds = [...new Set(relevantOrgOrganizers.map(oo => oo.accountId))];

    let accountMap = new Map<number, Account>();
    if (accountIds.length > 0) {
      const accts = await db.select().from(accounts);
      accountMap = new Map(accts.filter(a => accountIds.includes(a.id)).map(a => [a.id, a]));
    }

    return orgList.map(org => ({
      ...org,
      organizers: relevantOrgOrganizers
        .filter(oo => oo.organizationId === org.id)
        .map(oo => {
          const acct = accountMap.get(oo.accountId);
          return acct ? {
            id: oo.id,
            accountId: oo.accountId,
            organizationId: oo.organizationId,
            createdAt: oo.createdAt,
            account: {
              id: acct.id,
              email: acct.email,
              firstName: acct.firstName,
              lastName: acct.lastName,
            },
          } : null;
        })
        .filter((o): o is OrganizerInfo => !!o),
    }));
  }

  async getOrganizations(): Promise<OrganizationWithOrganizers[]> {
    const orgList = await db.select().from(organizations).orderBy(sql`${organizations.createdAt} DESC`);
    return this.attachOrganizers(orgList);
  }

  async getOrganization(id: number): Promise<OrganizationWithOrganizers | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    if (!org) return undefined;
    const [withOrganizers] = await this.attachOrganizers([org]);
    return withOrganizers;
  }

  async getOrganizationBySlug(slug: string): Promise<OrganizationWithOrganizers | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
    if (!org) return undefined;
    const [withOrganizers] = await this.attachOrganizers([org]);
    return withOrganizers;
  }

  async createOrganization(data: InsertOrganization): Promise<OrganizationWithOrganizers> {
    let slug = generateSlug(data.name);
    const existing = await db.select().from(organizations).where(eq(organizations.slug, slug));
    if (existing.length > 0) {
      slug = `${slug}-${crypto.randomBytes(3).toString("hex")}`;
    }
    const [org] = await db.insert(organizations).values({ ...data, slug }).returning();
    return (await this.getOrganization(org.id))!;
  }

  async updateOrganization(id: number, data: UpdateOrganization): Promise<OrganizationWithOrganizers | undefined> {
    const existing = await this.getOrganization(id);
    if (!existing) return undefined;

    const updateFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        updateFields[key] = value;
      }
    }

    if (Object.keys(updateFields).length > 0) {
      updateFields.updatedAt = new Date();
      await db.update(organizations).set(updateFields).where(eq(organizations.id, id));
    }

    return this.getOrganization(id);
  }

  async deleteOrganization(id: number): Promise<boolean> {
    const result = await db.delete(organizations).where(eq(organizations.id, id)).returning();
    return result.length > 0;
  }

  async addOrganizer(organizationId: number, accountId: number): Promise<void> {
    await db.insert(organizationOrganizers).values({ organizationId, accountId }).onConflictDoNothing();
  }

  async removeOrganizer(organizationId: number, accountId: number): Promise<boolean> {
    const result = await db.delete(organizationOrganizers)
      .where(and(
        eq(organizationOrganizers.organizationId, organizationId),
        eq(organizationOrganizers.accountId, accountId),
      ))
      .returning();
    return result.length > 0;
  }

  async getMembers(organizationId: number): Promise<MemberWithAccount[]> {
    const members = await db.select().from(organizationMembers)
      .where(eq(organizationMembers.organizationId, organizationId))
      .orderBy(sql`${organizationMembers.createdAt} DESC`);

    const result: MemberWithAccount[] = [];
    for (const m of members) {
      const acct = await getAccountSummary(m.accountId);
      if (acct) {
        result.push({ ...m, account: acct });
      }
    }
    return result;
  }

  async getMember(organizationId: number, accountId: number): Promise<MemberWithAccount | undefined> {
    const [m] = await db.select().from(organizationMembers)
      .where(and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.accountId, accountId),
      ));
    if (!m) return undefined;
    const acct = await getAccountSummary(m.accountId);
    if (!acct) return undefined;
    return { ...m, account: acct };
  }

  async createMemberRequest(
    organizationId: number,
    accountId: number,
    inviteId?: number,
    initialStatus?: "pending" | "approved",
  ): Promise<MemberWithAccount> {
    // Invite acceptances and admin/organizer additions are approved up front.
    const status = initialStatus ?? (inviteId ? "approved" : "pending");
    const [member] = await db.insert(organizationMembers).values({
      organizationId,
      accountId,
      status,
      inviteId: inviteId || null,
    }).onConflictDoNothing().returning();

    if (!member) {
      const existing = await this.getMember(organizationId, accountId);
      if (existing) return existing;
      throw new Error("Failed to create membership");
    }

    const acct = await getAccountSummary(accountId);
    return { ...member, account: acct! };
  }

  async updateMemberStatus(organizationId: number, accountId: number, status: string): Promise<MemberWithAccount | undefined> {
    const [updated] = await db.update(organizationMembers)
      .set({ status })
      .where(and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.accountId, accountId),
      ))
      .returning();
    if (!updated) return undefined;
    const acct = await getAccountSummary(accountId);
    return { ...updated, account: acct! };
  }

  async updateMemberFees(organizationId: number, accountId: number, fees: { managementFeePercent?: string | null; successFeePercent?: string | null }): Promise<MemberWithAccount | undefined> {
    const fields = Object.fromEntries(Object.entries(fees).filter(([, v]) => v !== undefined));
    if (Object.keys(fields).length > 0) {
      await db.update(organizationMembers).set(fields)
        .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.accountId, accountId)));
    }
    return this.getMember(organizationId, accountId);
  }

  async removeMember(organizationId: number, accountId: number): Promise<boolean> {
    const result = await db.delete(organizationMembers)
      .where(and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.accountId, accountId),
      ))
      .returning();
    return result.length > 0;
  }

  async getInvites(organizationId: number): Promise<InviteWithAccount[]> {
    const invites = await db.select().from(organizationInvites)
      .where(eq(organizationInvites.organizationId, organizationId))
      .orderBy(sql`${organizationInvites.createdAt} DESC`);

    const result: InviteWithAccount[] = [];
    for (const inv of invites) {
      let usedByAccount = null;
      if (inv.usedByAccountId) {
        usedByAccount = await getAccountSummary(inv.usedByAccountId);
      }
      result.push({ ...inv, usedByAccount });
    }
    return result;
  }

  async createInvite(organizationId: number): Promise<OrganizationInvite> {
    const token = crypto.randomBytes(32).toString("hex");
    const [invite] = await db.insert(organizationInvites).values({
      organizationId,
      token,
    }).returning();
    return invite;
  }

  async getInviteByToken(token: string): Promise<InviteWithAccount | undefined> {
    const [invite] = await db.select().from(organizationInvites)
      .where(eq(organizationInvites.token, token));
    if (!invite) return undefined;
    let usedByAccount = null;
    if (invite.usedByAccountId) {
      usedByAccount = await getAccountSummary(invite.usedByAccountId);
    }
    return { ...invite, usedByAccount };
  }

  async useInvite(token: string, accountId: number): Promise<void> {
    await db.update(organizationInvites)
      .set({ used: true, usedByAccountId: accountId })
      .where(eq(organizationInvites.token, token));
  }

  async deleteInvite(organizationId: number, inviteId: number): Promise<boolean> {
    const result = await db.delete(organizationInvites)
      .where(and(
        eq(organizationInvites.id, inviteId),
        eq(organizationInvites.organizationId, organizationId),
      ))
      .returning();
    return result.length > 0;
  }

  /** A Vehicle's positions and assets, and the financials of each of its pools (one per share class). */
  private async vehiclePools(vehicleId: number): Promise<{ members: VehicleMember[]; assets: VehicleAssetWithCurrent[]; pools: Map<number, PoolFinancials> }> {
    const members = await db.select().from(vehicleMembers).where(eq(vehicleMembers.vehicleId, vehicleId));
    const assets = await this.getVehicleAssets(vehicleId);
    return { members, assets, pools: poolFinancials(members, assets) };
  }

  /** Each position's current value: its share of its class pool's value. */
  private memberValues(members: VehicleMember[], pools: Map<number, PoolFinancials>, allocationMethod: string | null | undefined): Record<number, string> {
    const shares = memberShares(members, allocationMethod);
    const out: Record<number, string> = {};
    for (const m of members) {
      out[m.id] = ((shares[m.id] ?? 0) * (pools.get(m.classId)?.currentValue ?? 0)).toFixed(2);
    }
    return out;
  }

  private async classNames(vehicleId: number): Promise<Map<number, string>> {
    const rows = await db.select({ id: vehicleClasses.id, name: vehicleClasses.name })
      .from(vehicleClasses).where(eq(vehicleClasses.vehicleId, vehicleId));
    return new Map(rows.map(r => [r.id, r.name]));
  }

  private async enrichVehicle(vehicle: Vehicle): Promise<VehicleWithDetails> {
    const manager = vehicle.managerId ? await getAccountSummary(vehicle.managerId) : null;
    const signatory = vehicle.signatoryId ? await getAccountSummary(vehicle.signatoryId) : null;
    const { members, pools } = await this.vehiclePools(vehicle.id);
    const total = totalFinancials(pools);
    const [{ count: classCount }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(vehicleClasses).where(eq(vehicleClasses.vehicleId, vehicle.id));
    return {
      ...vehicle, manager, signatory, memberCount: members.length, classCount,
      cash: total.cash.toFixed(2), assetValue: total.assetValue.toFixed(2), currentValue: total.currentValue.toFixed(2),
    };
  }

  async getAllVehicles(): Promise<VehicleWithDetails[]> {
    const vehicleList = await db.select().from(vehicles)
      .orderBy(sql`${vehicles.createdAt} DESC`);
    const enriched = await Promise.all(vehicleList.map(s => this.enrichVehicle(s)));
    for (const vehicle of enriched) {
      const [org] = await db.select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
      }).from(organizations).where(eq(organizations.id, vehicle.organizationId));
      vehicle.organization = org || null;
    }
    return enriched;
  }

  async getVehicles(organizationId: number): Promise<VehicleWithDetails[]> {
    const vehicleList = await db.select().from(vehicles)
      .where(eq(vehicles.organizationId, organizationId))
      .orderBy(sql`${vehicles.createdAt} DESC`);
    return Promise.all(vehicleList.map(s => this.enrichVehicle(s)));
  }

  async getVehicle(id: number): Promise<VehicleWithDetails | undefined> {
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, id));
    if (!vehicle) return undefined;
    return this.enrichVehicle(vehicle);
  }

  async createVehicle(data: InsertVehicle): Promise<VehicleWithDetails> {
    // Every Vehicle has at least one share class; a single one isn't shown.
    const vehicle = await db.transaction(async (tx) => {
      const [row] = await tx.insert(vehicles).values(data).returning();
      await tx.insert(vehicleClasses).values({ vehicleId: row.id, name: DEFAULT_CLASS_NAME });
      return row;
    });
    return this.enrichVehicle(vehicle);
  }

  async updateVehicle(id: number, data: UpdateVehicle): Promise<VehicleWithDetails | undefined> {
    const existing = await this.getVehicle(id);
    if (!existing) return undefined;

    const updateFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        updateFields[key] = value;
      }
    }

    if (Object.keys(updateFields).length > 0) {
      updateFields.updatedAt = new Date();
      await db.update(vehicles).set(updateFields).where(eq(vehicles.id, id));
    }

    return this.getVehicle(id);
  }

  async deleteVehicle(id: number): Promise<boolean> {
    const result = await db.delete(vehicles).where(eq(vehicles.id, id)).returning();
    return result.length > 0;
  }

  async getVehicleMembers(vehicleId: number): Promise<VehicleMemberWithAccount[]> {
    const [vehicleRow] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId));
    const { members, pools } = await this.vehiclePools(vehicleId);
    members.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) || b.id - a.id);
    const values = this.memberValues(members, pools, vehicleRow?.allocationMethod);
    const names = await this.classNames(vehicleId);

    const result: VehicleMemberWithAccount[] = [];
    for (const m of members) {
      const enriched = await this.withInvestor(m, values[m.id], names);
      if (enriched) result.push(enriched);
    }
    return result;
  }

  private async withInvestor(m: VehicleMember, currentValue: string, classNames: Map<number, string>): Promise<VehicleMemberWithAccount | undefined> {
    const className = classNames.get(m.classId) ?? null;
    if (m.accountId !== null) {
      const acct = await getAccountSummary(m.accountId);
      return acct ? { ...m, className, investorType: "account", account: acct, entity: null, currentValue } : undefined;
    }
    const ent = m.entityId !== null ? await getEntitySummary(m.entityId) : null;
    return ent ? { ...m, className, investorType: "entity", account: null, entity: ent, currentValue } : undefined;
  }

  /** A position with its investor, class and current value (recomputed against its whole pool). */
  private async enrichVehicleMember(vehicleId: number, memberId: number): Promise<VehicleMemberWithAccount | undefined> {
    const [vehicleRow] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId));
    const { members, pools } = await this.vehiclePools(vehicleId);
    const member = members.find(m => m.id === memberId);
    if (!member) return undefined;
    const values = this.memberValues(members, pools, vehicleRow?.allocationMethod);
    return this.withInvestor(member, values[member.id], await this.classNames(vehicleId));
  }

  async addVehicleMember(
    vehicleId: number,
    investor: { accountId: number } | { entityId: number },
    investment?: InvestmentFields
  ): Promise<VehicleMemberWithAccount> {
    const values: any = { vehicleId };
    if ("accountId" in investor) values.accountId = investor.accountId;
    else values.entityId = investor.entityId;
    if (investment) Object.assign(values, investment);

    const member = await db.transaction(async (tx) => {
      const [vehicleRow] = await tx.select().from(vehicles).where(eq(vehicles.id, vehicleId));
      // AutoDeploy: auto-call the net capital (committed − management fee) and deploy it into
      // the default asset of the position's class
      if (vehicleRow?.autoDeploy) {
        const committed = parseFloat(values.committed ?? "0");
        const mgmtFee = parseFloat(values.managementFee ?? "0");
        const capital = Math.max(0, committed - mgmtFee);
        // AutoDeploy always overrides totalCalled to match the net capital, even when zero.
        values.totalCalled = capital.toFixed(2);
        if (capital > 0) {
          const [defaultAsset] = await tx.select().from(vehicleAssets)
            .where(and(eq(vehicleAssets.vehicleId, vehicleId), eq(vehicleAssets.classId, values.classId), eq(vehicleAssets.isDefault, true)));
          if (!defaultAsset) {
            throw new Error("AutoDeploy is enabled but the Vehicle has no default asset.");
          }
          const [inserted] = await tx.insert(vehicleMembers).values(values).returning();
          const newCost = (parseFloat(defaultAsset.cost || "0") + capital).toFixed(2);
          await tx.update(vehicleAssets).set({ cost: newCost })
            .where(eq(vehicleAssets.id, defaultAsset.id));
          return inserted;
        }
      }
      const [inserted] = await tx.insert(vehicleMembers).values(values).returning();
      return inserted;
    });

    return (await this.enrichVehicleMember(vehicleId, member.id))!;
  }


  async updateVehicleMemberById(
    vehicleId: number,
    memberId: number,
    investment: InvestmentFields
  ): Promise<VehicleMemberWithAccount | undefined> {
    const memberWhere = and(eq(vehicleMembers.vehicleId, vehicleId), eq(vehicleMembers.id, memberId));
    const updates: any = { ...investment };
    let row;
    if (Object.keys(updates).length === 0) {
      [row] = await db.select().from(vehicleMembers).where(memberWhere);
    } else {
      [row] = await db.update(vehicleMembers).set(updates).where(memberWhere).returning();
    }
    if (!row) return undefined;
    return this.enrichVehicleMember(vehicleId, row.id);
  }

  async getVehicleClasses(vehicleId: number): Promise<VehicleClassWithDetails[]> {
    const rows = await db.select().from(vehicleClasses)
      .where(eq(vehicleClasses.vehicleId, vehicleId))
      .orderBy(vehicleClasses.name, vehicleClasses.id);
    if (rows.length === 0) return [];
    const { assets, pools } = await this.vehiclePools(vehicleId);
    return rows.map(c => {
      const p = pools.get(c.id);
      return {
        ...c,
        memberCount: p?.memberCount ?? 0,
        assetCount: assets.filter(a => a.classId === c.id).length,
        committed: (p?.committed ?? 0).toFixed(2),
        totalCalled: (p?.totalCalled ?? 0).toFixed(2),
        cash: (p?.cash ?? 0).toFixed(2),
        assetValue: (p?.assetValue ?? 0).toFixed(2),
        currentValue: (p?.currentValue ?? 0).toFixed(2),
      };
    });
  }

  private async getVehicleClass(vehicleId: number, classId: number): Promise<VehicleClassWithDetails | undefined> {
    return (await this.getVehicleClasses(vehicleId)).find(c => c.id === classId);
  }

  async createVehicleClass(vehicleId: number, data: { name: string; notes?: string }): Promise<VehicleClassWithDetails> {
    const [row] = await db.insert(vehicleClasses).values({ vehicleId, name: data.name, notes: data.notes ?? "" }).returning();
    return (await this.getVehicleClass(vehicleId, row.id))!;
  }

  async updateVehicleClass(vehicleId: number, classId: number, data: { name?: string; notes?: string }): Promise<VehicleClassWithDetails | undefined> {
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) if (v !== undefined) updates[k] = v;
    const where = and(eq(vehicleClasses.vehicleId, vehicleId), eq(vehicleClasses.id, classId));
    const [row] = Object.keys(updates).length > 0
      ? await db.update(vehicleClasses).set(updates).where(where).returning()
      : await db.select().from(vehicleClasses).where(where);
    if (!row) return undefined;
    return this.getVehicleClass(vehicleId, classId);
  }

  async deleteVehicleClass(vehicleId: number, classId: number): Promise<DeleteVehicleClassResult> {
    return db.transaction(async (tx) => {
      // Lock the Vehicle so two concurrent deletes can't remove its last two classes.
      await tx.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, vehicleId)).for("update");
      const classes = await tx.select({ id: vehicleClasses.id }).from(vehicleClasses).where(eq(vehicleClasses.vehicleId, vehicleId));
      if (!classes.some(c => c.id === classId)) return "not_found";
      if (classes.length === 1) return "last_class";
      // The class FKs would refuse this too; checking first gives a clear answer.
      const [m] = await tx.select({ id: vehicleMembers.id }).from(vehicleMembers).where(eq(vehicleMembers.classId, classId)).limit(1);
      const [a] = await tx.select({ id: vehicleAssets.id }).from(vehicleAssets).where(eq(vehicleAssets.classId, classId)).limit(1);
      if (m || a) return "in_use";
      await tx.delete(vehicleClasses).where(and(eq(vehicleClasses.vehicleId, vehicleId), eq(vehicleClasses.id, classId)));
      return "deleted";
    });
  }

  async removeVehicleMemberById(vehicleId: number, memberId: number): Promise<boolean> {
    const result = await db.delete(vehicleMembers)
      .where(and(eq(vehicleMembers.vehicleId, vehicleId), eq(vehicleMembers.id, memberId)))
      .returning();
    return result.length > 0;
  }

  async getPortfolio(filter?: { accountIds?: number[]; entityIds?: number[] }): Promise<PortfolioInvestment[]> {
    let where;
    if (filter !== undefined) {
      const conds: any[] = [];
      if (filter.accountIds !== undefined && filter.accountIds.length > 0) {
        conds.push(inArray(vehicleMembers.accountId, filter.accountIds));
      }
      if (filter.entityIds !== undefined && filter.entityIds.length > 0) {
        conds.push(inArray(vehicleMembers.entityId, filter.entityIds));
      }
      if (conds.length === 0) return [];
      where = conds.length === 1 ? conds[0] : or(...conds);
    } else {
      where = sql`TRUE`;
    }

    const rows = await db
      .select({
        memberId: vehicleMembers.id,
        vehicleId: vehicles.id,
        vehicleName: vehicles.displayName,
        classId: vehicleMembers.classId,
        className: vehicleClasses.name,
        investmentCompanyName: vehicles.investmentCompanyName,
        investmentType: vehicles.investmentType,
        organizationId: organizations.id,
        organizationName: organizations.name,
        organizationSlug: organizations.slug,
        accountId: vehicleMembers.accountId,
        entityId: vehicleMembers.entityId,
        accountFirstName: accounts.firstName,
        accountLastName: accounts.lastName,
        accountEmail: accounts.email,
        entityName: entities.name,
        entityType: entities.entityType,
        committed: vehicleMembers.committed,
        managementFee: vehicleMembers.managementFee,
        otherFee: vehicleMembers.otherFee,
        carry: vehicleMembers.carry,
        totalCalled: vehicleMembers.totalCalled,
        distributed: vehicleMembers.distributed,
        ownershipPercent: vehicleMembers.ownershipPercent,
        date: vehicleMembers.date,
        allocationMethod: vehicles.allocationMethod,
        currency: vehicles.currency,
      })
      .from(vehicleMembers)
      .innerJoin(vehicles, eq(vehicles.id, vehicleMembers.vehicleId))
      .innerJoin(organizations, eq(organizations.id, vehicles.organizationId))
      .leftJoin(accounts, eq(accounts.id, vehicleMembers.accountId))
      .leftJoin(entities, eq(entities.id, vehicleMembers.entityId))
      .innerJoin(vehicleClasses, eq(vehicleClasses.id, vehicleMembers.classId))
      .where(where)
      .orderBy(sql`${vehicles.displayName} ASC, ${vehicleClasses.name} ASC`);

    // Each position's value is its share of its whole class pool, so compute per Vehicle once
    const vehicleCache = new Map<number, { values: Record<number, string>; classCount: number }>();
    const out: PortfolioInvestment[] = [];
    for (const r of rows) {
      let cached = vehicleCache.get(r.vehicleId);
      if (!cached) {
        const { members, pools } = await this.vehiclePools(r.vehicleId);
        const classCount = (await this.classNames(r.vehicleId)).size;
        cached = { values: this.memberValues(members, pools, r.allocationMethod), classCount };
        vehicleCache.set(r.vehicleId, cached);
      }
      const currentValue = cached.values[r.memberId] ?? "0.00";
      const isAccount = r.accountId !== null;
      out.push({
        memberId: r.memberId,
        vehicleId: r.vehicleId,
        vehicleName: r.vehicleName,
        classId: r.classId,
        className: r.className,
        vehicleClassCount: cached.classCount,
        investmentCompanyName: r.investmentCompanyName ?? "",
        investmentType: r.investmentType ?? "",
        organizationId: r.organizationId,
        organizationName: r.organizationName,
        organizationSlug: r.organizationSlug,
        investorType: isAccount ? "account" as const : "entity" as const,
        investorId: isAccount ? r.accountId! : r.entityId!,
        investorName: isAccount
          ? `${r.accountFirstName ?? ""} ${r.accountLastName ?? ""}`.trim()
          : (r.entityName ?? ""),
        investorEmail: isAccount ? (r.accountEmail ?? null) : null,
        investorEntityType: isAccount ? null : (r.entityType ?? null),
        committed: r.committed ?? "0",
        managementFee: r.managementFee ?? "0",
        otherFee: r.otherFee ?? "0",
        carry: r.carry ?? "0",
        totalCalled: r.totalCalled ?? "0",
        distributed: r.distributed ?? "0",
        currentValue,
        date: r.date ?? null,
        currency: r.currency ?? "USD",
      });
    }
    return out;
  }

  async getVehicleAssets(vehicleId: number): Promise<VehicleAssetWithCurrent[]> {
    const list = await db.select().from(vehicleAssets)
      .where(eq(vehicleAssets.vehicleId, vehicleId))
      .orderBy(sql`${vehicleAssets.purchaseDate} DESC NULLS LAST, ${vehicleAssets.id} DESC`);
    const out: VehicleAssetWithCurrent[] = [];
    for (const a of list) {
      const [latest] = await db.select().from(vehicleAssetValuations)
        .where(eq(vehicleAssetValuations.assetId, a.id))
        .orderBy(sql`${vehicleAssetValuations.date} DESC, ${vehicleAssetValuations.id} DESC`)
        .limit(1);
      const currentValue = latest ? (latest.value || "0") : (a.cost || "0");
      out.push({ ...a, currentValue: parseFloat(currentValue).toFixed(2) });
    }
    return out;
  }

  async getVehicleAsset(vehicleId: number, assetId: number): Promise<VehicleAssetWithCurrent | undefined> {
    const [a] = await db.select().from(vehicleAssets)
      .where(and(eq(vehicleAssets.vehicleId, vehicleId), eq(vehicleAssets.id, assetId)));
    if (!a) return undefined;
    const [latest] = await db.select().from(vehicleAssetValuations)
      .where(eq(vehicleAssetValuations.assetId, a.id))
      .orderBy(sql`${vehicleAssetValuations.date} DESC, ${vehicleAssetValuations.id} DESC`)
      .limit(1);
    const currentValue = latest ? (latest.value || "0") : (a.cost || "0");
    return { ...a, currentValue: parseFloat(currentValue).toFixed(2) };
  }

  async createVehicleAsset(vehicleId: number, data: AssetFields & { companyName: string }): Promise<VehicleAssetWithCurrent> {
    const created = await db.transaction(async (tx) => {
      const [row] = await tx.insert(vehicleAssets).values({
        vehicleId,
        classId: data.classId!,
        companyName: data.companyName,
        instrumentType: data.instrumentType ?? "Equity",
        purchaseDate: data.purchaseDate ?? null,
        cost: data.cost ?? "0",
        notes: data.notes ?? "",
        isDefault: false,
      }).returning();
      if (data.isDefault) {
        await tx.update(vehicleAssets).set({ isDefault: false })
          .where(and(eq(vehicleAssets.vehicleId, vehicleId), eq(vehicleAssets.classId, row.classId), sql`${vehicleAssets.id} <> ${row.id}`));
        const [promoted] = await tx.update(vehicleAssets).set({ isDefault: true })
          .where(eq(vehicleAssets.id, row.id)).returning();
        return promoted;
      }
      return row;
    });
    return { ...created, currentValue: parseFloat(created.cost || "0").toFixed(2) };
  }

  async updateVehicleAsset(vehicleId: number, assetId: number, data: AssetFields): Promise<VehicleAssetWithCurrent | undefined> {
    const updates: any = {};
    for (const [k, v] of Object.entries(data)) if (v !== undefined) updates[k] = v;
    if (Object.keys(updates).length === 0) return this.getVehicleAsset(vehicleId, assetId);
    const ok = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(vehicleAssets)
        .where(and(eq(vehicleAssets.vehicleId, vehicleId), eq(vehicleAssets.id, assetId)));
      if (!current) return false;
      const targetClassId = updates.classId !== undefined ? updates.classId : current.classId;
      // A default asset moved to another class stops being the default unless asked to stay one
      // (then it replaces that class's default).
      if (targetClassId !== current.classId && current.isDefault && updates.isDefault !== true) {
        updates.isDefault = false;
      }
      // Clear other defaults FIRST to avoid the partial unique index transiently seeing two true rows.
      if (updates.isDefault === true) {
        await tx.update(vehicleAssets).set({ isDefault: false })
          .where(and(eq(vehicleAssets.vehicleId, vehicleId), eq(vehicleAssets.classId, targetClassId), sql`${vehicleAssets.id} <> ${assetId}`, eq(vehicleAssets.isDefault, true)));
      }
      const [updated] = await tx.update(vehicleAssets).set(updates)
        .where(and(eq(vehicleAssets.vehicleId, vehicleId), eq(vehicleAssets.id, assetId)))
        .returning();
      if (!updated) return false;
      return true;
    });
    if (!ok) return undefined;
    return this.getVehicleAsset(vehicleId, assetId);
  }

  async deleteVehicleAsset(vehicleId: number, assetId: number): Promise<boolean> {
    const res = await db.delete(vehicleAssets)
      .where(and(eq(vehicleAssets.vehicleId, vehicleId), eq(vehicleAssets.id, assetId))).returning();
    return res.length > 0;
  }

  async getAssetValuations(assetId: number): Promise<VehicleAssetValuation[]> {
    return await db.select().from(vehicleAssetValuations)
      .where(eq(vehicleAssetValuations.assetId, assetId))
      .orderBy(sql`${vehicleAssetValuations.date} DESC, ${vehicleAssetValuations.id} DESC`);
  }

  async addAssetValuation(assetId: number, data: { date: string; value: string; note?: string }): Promise<VehicleAssetValuation> {
    const [v] = await db.insert(vehicleAssetValuations).values({
      assetId,
      date: data.date,
      value: data.value,
      note: data.note ?? "",
    }).returning();
    return v;
  }

  async removeAssetValuation(assetId: number, valuationId: number): Promise<boolean> {
    const res = await db.delete(vehicleAssetValuations)
      .where(and(eq(vehicleAssetValuations.assetId, assetId), eq(vehicleAssetValuations.id, valuationId)))
      .returning();
    return res.length > 0;
  }

  async getEntityIdsOwnedByAccount(accountId: number): Promise<number[]> {
    const directRows = await db.select({ id: entityOwners.entityId })
      .from(entityOwners)
      .where(and(eq(entityOwners.ownerType, "account"), eq(entityOwners.ownerAccountId, accountId)));
    const found = new Set<number>(directRows.map(r => r.id));
    const stack = Array.from(found);
    while (stack.length > 0) {
      const eid = stack.pop()!;
      const children = await db.select({ id: entityOwners.entityId })
        .from(entityOwners)
        .where(and(eq(entityOwners.ownerType, "entity"), eq(entityOwners.ownerEntityId, eid)));
      for (const c of children) {
        if (!found.has(c.id)) {
          found.add(c.id);
          stack.push(c.id);
        }
      }
    }
    return Array.from(found);
  }

  private async enrichEntity(entity: Entity): Promise<EntityWithDetails> {
    const mgrs = await db.select().from(delegations)
      .where(and(eq(delegations.principalEntityId, entity.id), eq(delegations.level, "manager")));
    const managersWithAccounts = [];
    for (const m of mgrs) {
      const acct = await getAccountSummary(m.delegateAccountId);
      if (acct) {
        managersWithAccounts.push({ id: m.id, accountId: m.delegateAccountId, account: acct });
      }
    }
    const owners = await db.select().from(entityOwners).where(eq(entityOwners.entityId, entity.id));
    return { ...entity, managers: managersWithAccounts, ownerCount: owners.length };
  }

  async getAllEntities(search?: string): Promise<EntityWithDetails[]> {
    const list = search
      ? await db.select().from(entities)
          .where(or(
            sql`unaccent(${entities.name}) ilike unaccent(${`%${search}%`})`,
            sql`unaccent(${entities.entityType}) ilike unaccent(${`%${search}%`})`,
          ))
          .orderBy(sql`${entities.name} ASC`)
      : await db.select().from(entities).orderBy(sql`${entities.name} ASC`);
    return Promise.all(list.map(e => this.enrichEntity(e)));
  }

  async getEntity(id: number): Promise<EntityWithDetails | undefined> {
    const [entity] = await db.select().from(entities).where(eq(entities.id, id));
    if (!entity) return undefined;
    return this.enrichEntity(entity);
  }

  async createEntity(data: InsertEntity, managerAccountIds: number[]): Promise<EntityWithDetails> {
    const entity = await db.transaction(async tx => {
      const [row] = await tx.insert(entities).values(data).returning();
      await tx.insert(delegations).values(managerAccountIds.map(delegateAccountId => (
        { principalEntityId: row.id, delegateAccountId, level: "manager" })));
      return row;
    });
    // Managers pass their introducers on to the entity.
    await this.syncInheritedIntroductions([entity.id]);
    return this.enrichEntity(entity);
  }

  async updateEntity(id: number, data: UpdateEntity): Promise<EntityWithDetails | undefined> {
    const existing = await this.getEntity(id);
    if (!existing) return undefined;
    const updateFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) updateFields[key] = value;
    }
    if (Object.keys(updateFields).length > 0) {
      updateFields.updatedAt = new Date();
      await db.update(entities).set(updateFields).where(eq(entities.id, id));
    }
    return this.getEntity(id);
  }

  async deleteEntity(id: number): Promise<boolean> {
    const result = await db.delete(entities).where(eq(entities.id, id)).returning();
    return result.length > 0;
  }

  async getEntityOwners(entityId: number): Promise<EntityOwnerWithDetails[]> {
    const owners = await db.select().from(entityOwners)
      .where(eq(entityOwners.entityId, entityId))
      .orderBy(sql`${entityOwners.createdAt} DESC`);
    const result: EntityOwnerWithDetails[] = [];
    for (const o of owners) {
      let ownerAccount = null;
      let ownerEntity = null;
      if (o.ownerType === "account" && o.ownerAccountId) {
        ownerAccount = await getAccountSummary(o.ownerAccountId);
      } else if (o.ownerType === "entity" && o.ownerEntityId) {
        const [ent] = await db.select({ id: entities.id, name: entities.name, entityType: entities.entityType })
          .from(entities).where(eq(entities.id, o.ownerEntityId));
        ownerEntity = ent || null;
      }
      result.push({ ...o, ownerAccount, ownerEntity });
    }
    return result;
  }

  async addEntityOwner(entityId: number, ownerType: string, ownerAccountId: number | null, ownerEntityId: number | null, ownershipPercent: string): Promise<EntityOwnerWithDetails> {
    const [owner] = await db.insert(entityOwners).values({
      entityId,
      ownerType,
      ownerAccountId,
      ownerEntityId,
      ownershipPercent,
    }).returning();
    let ownerAccount = null;
    let ownerEntity = null;
    if (ownerType === "account" && ownerAccountId) {
      ownerAccount = await getAccountSummary(ownerAccountId);
    } else if (ownerType === "entity" && ownerEntityId) {
      const [ent] = await db.select({ id: entities.id, name: entities.name, entityType: entities.entityType })
        .from(entities).where(eq(entities.id, ownerEntityId));
      ownerEntity = ent || null;
    }
    return { ...owner, ownerAccount, ownerEntity };
  }

  async removeEntityOwner(ownerId: number): Promise<boolean> {
    const result = await db.delete(entityOwners).where(eq(entityOwners.id, ownerId)).returning();
    return result.length > 0;
  }

  async getIntroductionGraph(): Promise<IntroductionGraph> {
    const rows = await db.select().from(introductions);
    // Only managers pass introductions on — observers don't act for the entity.
    const mgrs = (await db.select({ entityId: delegations.principalEntityId, accountId: delegations.delegateAccountId })
      .from(delegations)
      .where(and(sql`${delegations.principalEntityId} IS NOT NULL`, eq(delegations.level, "manager"))))
      .map(m => ({ entityId: m.entityId!, accountId: m.accountId }));
    return {
      accountEdges: rows
        .filter(r => r.introducedAccountId !== null)
        .map(r => ({ introducerAccountId: r.introducerAccountId, introducedAccountId: r.introducedAccountId! })),
      entityEdges: rows
        .filter(r => r.introducedEntityId !== null && r.viaAccountId === null)
        .map(r => ({ introducerAccountId: r.introducerAccountId, introducedEntityId: r.introducedEntityId! })),
      managers: mgrs,
    };
  }

  async getIntroduction(id: number): Promise<Introduction | undefined> {
    const [row] = await db.select().from(introductions).where(eq(introductions.id, id));
    return row;
  }

  async getIntroductionsForAccount(accountId: number): Promise<AccountIntroductions> {
    const introducedBy = await db.select().from(introductions)
      .where(eq(introductions.introducedAccountId, accountId));
    const introduced = await db.select().from(introductions)
      .where(eq(introductions.introducerAccountId, accountId));
    return {
      introducedBy: await this.enrichIntroductions(introducedBy),
      introduced: await this.enrichIntroductions(introduced),
    };
  }

  async getIntroductionsForEntity(entityId: number): Promise<IntroductionWithDetails[]> {
    const rows = await db.select().from(introductions).where(eq(introductions.introducedEntityId, entityId));
    return this.enrichIntroductions(rows);
  }

  async createIntroduction(data: CreateIntroductionInput): Promise<IntroductionWithDetails | null> {
    const details = { date: data.date ?? null, notes: data.notes ?? "" };
    let row: Introduction | undefined;

    if (data.introducedEntityId !== undefined) {
      const [existing] = await db.select().from(introductions).where(and(
        eq(introductions.introducerAccountId, data.introducerAccountId),
        eq(introductions.introducedEntityId, data.introducedEntityId),
      ));
      if (existing && existing.viaAccountId === null) return null;
      if (existing) {
        // Promote an inherited row to a direct one.
        [row] = await db.update(introductions).set({ viaAccountId: null, ...details })
          .where(eq(introductions.id, existing.id)).returning();
      } else {
        [row] = await db.insert(introductions).values({
          introducerAccountId: data.introducerAccountId,
          introducedEntityId: data.introducedEntityId,
          ...details,
        }).onConflictDoNothing().returning();
      }
    } else {
      [row] = await db.insert(introductions).values({
        introducerAccountId: data.introducerAccountId,
        introducedAccountId: data.introducedAccountId!,
        ...details,
      }).onConflictDoNothing().returning();
      if (row) await this.syncInheritedIntroductions(await this.getManagedEntityIds([data.introducedAccountId!]));
    }

    if (!row) return null;
    const [enriched] = await this.enrichIntroductions([row]);
    return enriched;
  }

  async updateIntroduction(id: number, data: UpdateIntroductionInput): Promise<IntroductionWithDetails | undefined> {
    const fields: Record<string, unknown> = {};
    if (data.date !== undefined) fields.date = data.date;
    if (data.notes !== undefined) fields.notes = data.notes;
    let row = await this.getIntroduction(id);
    if (!row) return undefined;
    if (Object.keys(fields).length > 0) {
      [row] = await db.update(introductions).set(fields).where(eq(introductions.id, id)).returning();
    }
    const [enriched] = await this.enrichIntroductions([row]);
    return enriched;
  }

  async deleteIntroduction(id: number): Promise<boolean> {
    const [row] = await db.delete(introductions).where(eq(introductions.id, id)).returning();
    if (!row) return false;
    if (row.introducedAccountId !== null) {
      await this.syncInheritedIntroductions(await this.getManagedEntityIds([row.introducedAccountId]));
    } else if (row.introducedEntityId !== null) {
      // A removed direct credit may still be due through a manager.
      await this.syncInheritedIntroductions([row.introducedEntityId]);
    }
    return true;
  }

  private async getManagedEntityIds(accountIds: number[]): Promise<number[]> {
    if (accountIds.length === 0) return [];
    const rows = await db.select({ entityId: delegations.principalEntityId }).from(delegations)
      .where(and(inArray(delegations.delegateAccountId, accountIds), sql`${delegations.principalEntityId} IS NOT NULL`, eq(delegations.level, "manager")));
    return Array.from(new Set(rows.map(r => r.entityId!)));
  }

  /**
   * Brings the inherited (viaAccountId) introductions of the given entities in
   * line with their current managers and those managers' introducers.
   */
  private async syncInheritedIntroductions(entityIds: number[]): Promise<void> {
    if (entityIds.length === 0) return;
    const graph = await this.getIntroductionGraph();
    const existing = await db.select().from(introductions)
      .where(inArray(introductions.introducedEntityId, entityIds));

    for (const entityId of entityIds) {
      const wanted = computeInheritedIntroducers(graph, entityId);
      const inherited = existing.filter(r => r.introducedEntityId === entityId && r.viaAccountId !== null);

      for (const row of inherited) {
        const via = wanted.get(row.introducerAccountId);
        if (via === undefined) {
          await db.delete(introductions).where(eq(introductions.id, row.id));
        } else if (via !== row.viaAccountId) {
          await db.update(introductions).set({ viaAccountId: via }).where(eq(introductions.id, row.id));
        }
      }
      const have = new Set(inherited.map(r => r.introducerAccountId));
      for (const [introducerAccountId, viaAccountId] of Array.from(wanted)) {
        if (have.has(introducerAccountId)) continue;
        await db.insert(introductions)
          .values({ introducerAccountId, introducedEntityId: entityId, viaAccountId })
          .onConflictDoNothing();
      }
    }
  }

  private async enrichIntroductions(rows: Introduction[]): Promise<IntroductionWithDetails[]> {
    if (rows.length === 0) return [];
    const accountIds = Array.from(new Set(rows.flatMap(r => [r.introducerAccountId, r.introducedAccountId, r.viaAccountId])
      .filter((v): v is number => v !== null)));
    const entityIds = Array.from(new Set(rows.map(r => r.introducedEntityId).filter((v): v is number => v !== null)));
    const accts = await db.select({ id: accounts.id, email: accounts.email, firstName: accounts.firstName, lastName: accounts.lastName })
      .from(accounts).where(inArray(accounts.id, accountIds));
    const ents = entityIds.length === 0 ? [] : await db.select({ id: entities.id, name: entities.name, entityType: entities.entityType })
      .from(entities).where(inArray(entities.id, entityIds));
    const acctMap = new Map(accts.map(a => [a.id, a]));
    const entMap = new Map(ents.map(e => [e.id, e]));
    return rows.map(r => ({
      ...r,
      introducer: acctMap.get(r.introducerAccountId) ?? null,
      introducedAccount: r.introducedAccountId !== null ? acctMap.get(r.introducedAccountId) ?? null : null,
      introducedEntity: r.introducedEntityId !== null ? entMap.get(r.introducedEntityId) ?? null : null,
      via: r.viaAccountId !== null ? acctMap.get(r.viaAccountId) ?? null : null,
    }));
  }

  private async accountSummaries(ids: number[]): Promise<Map<number, AccountSummary>> {
    if (ids.length === 0) return new Map();
    const rows = await db.select({ id: accounts.id, email: accounts.email, firstName: accounts.firstName, lastName: accounts.lastName })
      .from(accounts).where(inArray(accounts.id, Array.from(new Set(ids))));
    return new Map(rows.map(a => [a.id, a]));
  }

  async getDelegation(id: number): Promise<Delegation | undefined> {
    const [row] = await db.select().from(delegations).where(eq(delegations.id, id));
    return row;
  }

  async getDelegationsForEntity(entityId: number): Promise<DelegationWithDetails[]> {
    const rows = await db.select().from(delegations)
      .where(eq(delegations.principalEntityId, entityId)).orderBy(delegations.id);
    return this.enrichDelegations(rows);
  }

  async getDelegationsForAccount(accountId: number): Promise<AccountDelegations> {
    const [delegatedIn, delegatedOut] = await Promise.all([
      db.select().from(delegations).where(eq(delegations.delegateAccountId, accountId)),
      db.select().from(delegations).where(eq(delegations.principalAccountId, accountId)),
    ]);
    return {
      delegatedIn: await this.enrichDelegations(delegatedIn),
      delegatedOut: await this.enrichDelegations(delegatedOut),
    };
  }

  async getDelegatorsOf(delegateAccountId: number): Promise<{ accountId: number; level: DelegationLevel }[]> {
    const rows = await db.select({ accountId: delegations.principalAccountId, level: delegations.level })
      .from(delegations).where(and(
        eq(delegations.delegateAccountId, delegateAccountId),
        sql`${delegations.principalAccountId} IS NOT NULL`,
      ));
    return rows.map(r => ({ accountId: r.accountId!, level: r.level as DelegationLevel }));
  }

  async createDelegation(data: CreateDelegationInput): Promise<DelegationWithDetails | null> {
    const [row] = await db.insert(delegations).values({
      principalAccountId: data.principalAccountId ?? null,
      principalEntityId: data.principalEntityId ?? null,
      delegateAccountId: data.delegateAccountId,
      level: data.level,
      notes: data.notes ?? "",
    }).onConflictDoNothing().returning();
    if (!row) return null;
    await this.syncEntityDelegation(row);
    const [enriched] = await this.enrichDelegations([row]);
    return enriched;
  }

  async updateDelegation(id: number, data: UpdateDelegationInput): Promise<DelegationWithDetails | undefined> {
    const fields: Record<string, unknown> = {};
    if (data.level !== undefined) fields.level = data.level;
    if (data.notes !== undefined) fields.notes = data.notes;
    let row = await this.getDelegation(id);
    if (!row) return undefined;
    if (Object.keys(fields).length > 0) {
      const levelChanged = data.level !== undefined && data.level !== row.level;
      [row] = await db.update(delegations).set({ ...fields, updatedAt: new Date() }).where(eq(delegations.id, id)).returning();
      if (levelChanged) await this.syncEntityDelegation(row);
    }
    const [enriched] = await this.enrichDelegations([row]);
    return enriched;
  }

  async deleteDelegation(id: number): Promise<boolean> {
    const [row] = await db.delete(delegations).where(eq(delegations.id, id)).returning();
    if (row) await this.syncEntityDelegation(row);
    return !!row;
  }

  /** An entity's managers pass their introducers on to it; keep that credit current. */
  private async syncEntityDelegation(row: Delegation): Promise<void> {
    if (row.principalEntityId !== null) await this.syncInheritedIntroductions([row.principalEntityId]);
  }

  private async enrichDelegations(rows: Delegation[]): Promise<DelegationWithDetails[]> {
    const accts = await this.accountSummaries(rows.flatMap(r =>
      [r.principalAccountId, r.delegateAccountId].filter((v): v is number => v !== null)));
    const entityIds = Array.from(new Set(rows.map(r => r.principalEntityId).filter((v): v is number => v !== null)));
    const ents = entityIds.length === 0 ? [] : await db.select({ id: entities.id, name: entities.name, entityType: entities.entityType })
      .from(entities).where(inArray(entities.id, entityIds));
    const entMap = new Map(ents.map(e => [e.id, e]));
    return rows.map(r => ({
      ...r,
      principal: r.principalAccountId !== null ? accts.get(r.principalAccountId) ?? null : null,
      principalEntity: r.principalEntityId !== null ? entMap.get(r.principalEntityId) ?? null : null,
      delegate: accts.get(r.delegateAccountId) ?? null,
    }));
  }

  async getRelationship(id: number): Promise<Relationship | undefined> {
    const [row] = await db.select().from(relationships).where(eq(relationships.id, id));
    return row;
  }

  async getRelationshipsForAccount(accountId: number): Promise<RelationshipWithDetails[]> {
    const rows = await db.select().from(relationships)
      .where(or(eq(relationships.fromAccountId, accountId), eq(relationships.toAccountId, accountId)))
      .orderBy(relationships.id);
    return this.enrichRelationships(rows);
  }

  async createRelationship(data: CreateRelationshipInput): Promise<RelationshipWithDetails | null> {
    const [row] = await db.insert(relationships).values(data).onConflictDoNothing().returning();
    if (!row) return null;
    const [enriched] = await this.enrichRelationships([row]);
    return enriched;
  }

  async updateRelationship(id: number, data: UpdateRelationshipInput): Promise<RelationshipWithDetails | undefined> {
    const [row] = await db.update(relationships).set({ description: data.description })
      .where(eq(relationships.id, id)).returning();
    if (!row) return undefined;
    const [enriched] = await this.enrichRelationships([row]);
    return enriched;
  }

  async deleteRelationship(id: number): Promise<boolean> {
    const [row] = await db.delete(relationships).where(eq(relationships.id, id)).returning();
    return !!row;
  }

  private async enrichRelationships(rows: Relationship[]): Promise<RelationshipWithDetails[]> {
    const accts = await this.accountSummaries(rows.flatMap(r => [r.fromAccountId, r.toAccountId]));
    return rows.map(r => ({
      ...r,
      fromAccount: accts.get(r.fromAccountId) ?? null,
      toAccount: accts.get(r.toAccountId) ?? null,
    }));
  }

  async getPromoters(): Promise<PromoterWithDetails[]> {
    const rows = await db.select().from(promoters).orderBy(promoters.id);
    return this.enrichPromoters(rows);
  }

  async getPromoter(id: number): Promise<PromoterWithDetails | undefined> {
    const [row] = await db.select().from(promoters).where(eq(promoters.id, id));
    if (!row) return undefined;
    const [enriched] = await this.enrichPromoters([row]);
    return enriched;
  }

  async getPromoterByAccountId(accountId: number): Promise<Promoter | undefined> {
    const [row] = await db.select().from(promoters).where(eq(promoters.accountId, accountId));
    return row;
  }

  async createPromoter(data: CreatePromoterInput): Promise<PromoterWithDetails | null> {
    const row = await db.transaction(async (tx) => {
      const [created] = await tx.insert(promoters).values({
        accountId: data.accountId,
        active: false,
        contractDate: data.contractDate ?? null,
        notes: data.notes ?? "",
      }).onConflictDoNothing().returning();
      if (!created) return null;
      if (data.incentives && data.incentives.length > 0) {
        await tx.insert(promoterIncentives).values(data.incentives.map(i => ({
          promoterId: created.id, type: i.type, percent: String(i.percent), notes: i.notes ?? "",
        })));
      }
      return created;
    });
    if (!row) return null;
    const [enriched] = await this.enrichPromoters([row]);
    return enriched;
  }

  async updatePromoter(id: number, data: UpdatePromoterInput): Promise<PromoterWithDetails | undefined> {
    const fields: Record<string, unknown> = {};
    if (data.active !== undefined) fields.active = data.active;
    if (data.contractDate !== undefined) fields.contractDate = data.contractDate;
    if (data.notes !== undefined) fields.notes = data.notes;
    if (Object.keys(fields).length > 0) {
      await db.update(promoters).set({ ...fields, updatedAt: new Date() }).where(eq(promoters.id, id));
    }
    return this.getPromoter(id);
  }

  async deletePromoter(id: number): Promise<boolean> {
    const result = await db.delete(promoters).where(eq(promoters.id, id)).returning();
    return result.length > 0;
  }

  async getPromoterIncentive(id: number): Promise<PromoterIncentive | undefined> {
    const [row] = await db.select().from(promoterIncentives).where(eq(promoterIncentives.id, id));
    return row;
  }

  async createPromoterIncentive(promoterId: number, data: CreateIncentiveInput): Promise<PromoterIncentive | null> {
    const [row] = await db.insert(promoterIncentives).values({
      promoterId, type: data.type, percent: String(data.percent), notes: data.notes ?? "",
    }).onConflictDoNothing().returning();
    return row ?? null;
  }

  async updatePromoterIncentive(id: number, data: UpdateIncentiveInput): Promise<PromoterIncentive | undefined> {
    const fields: Record<string, unknown> = {};
    if (data.percent !== undefined) fields.percent = String(data.percent);
    if (data.notes !== undefined) fields.notes = data.notes;
    if (Object.keys(fields).length === 0) return this.getPromoterIncentive(id);
    const [row] = await db.update(promoterIncentives).set(fields).where(eq(promoterIncentives.id, id)).returning();
    return row;
  }

  async deletePromoterIncentive(id: number): Promise<boolean> {
    const result = await db.delete(promoterIncentives).where(eq(promoterIncentives.id, id)).returning();
    return result.length > 0;
  }

  async getContract(id: number): Promise<Contract | undefined> {
    const [row] = await db.select().from(contracts).where(eq(contracts.id, id));
    return row;
  }

  async getContractsForPromoter(promoterId: number): Promise<Contract[]> {
    return db.select().from(contracts).where(eq(contracts.promoterId, promoterId)).orderBy(desc(contracts.createdAt));
  }

  async createContract(data: NewContract): Promise<Contract> {
    const [row] = await db.insert(contracts).values(data).returning();
    return row;
  }

  async updateContract(id: number, data: ContractUpdate): Promise<Contract | undefined> {
    const [row] = await db.update(contracts).set({ ...data, updatedAt: new Date() }).where(eq(contracts.id, id)).returning();
    return row;
  }

  async deleteContract(id: number): Promise<boolean> {
    const result = await db.delete(contracts).where(eq(contracts.id, id)).returning();
    return result.length > 0;
  }

  async getAppSettings(keys: string[]): Promise<Record<string, string>> {
    if (keys.length === 0) return {};
    const rows = await db.select().from(appSettings).where(inArray(appSettings.key, keys));
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }

  async setAppSettings(values: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(values)) {
      await db.insert(appSettings)
        .values({ key, value })
        .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
    }
  }

  private async enrichPromoters(rows: Promoter[]): Promise<PromoterWithDetails[]> {
    if (rows.length === 0) return [];
    const ids = rows.map(r => r.id);
    const accountIds = rows.map(r => r.accountId);
    const [accts, incentives, counts, signed] = await Promise.all([
      db.select({ id: accounts.id, email: accounts.email, firstName: accounts.firstName, lastName: accounts.lastName })
        .from(accounts).where(inArray(accounts.id, accountIds)),
      db.select().from(promoterIncentives).where(inArray(promoterIncentives.promoterId, ids))
        .orderBy(promoterIncentives.id),
      db.select({ accountId: introductions.introducerAccountId, count: sql<number>`count(*)::int` })
        .from(introductions).where(inArray(introductions.introducerAccountId, accountIds))
        .groupBy(introductions.introducerAccountId),
      db.selectDistinct({ promoterId: contracts.promoterId }).from(contracts)
        .where(and(inArray(contracts.promoterId, ids), eq(contracts.status, "SIGNED"))),
    ]);
    const acctMap = new Map(accts.map(a => [a.id, a]));
    const countMap = new Map(counts.map(c => [c.accountId, c.count]));
    const signedIds = new Set(signed.map(s => s.promoterId));
    return rows.map(r => ({
      ...r,
      account: acctMap.get(r.accountId)!,
      incentives: incentives.filter(i => i.promoterId === r.id),
      introductionCount: countMap.get(r.accountId) ?? 0,
      hasSignedContract: signedIds.has(r.id),
    }));
  }

  async createPasswordResetToken(accountId: number, ttlMs: number = PASSWORD_RESET_TTL_MS): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + ttlMs);
    await db.insert(passwordResetTokens).values({ accountId, token, expiresAt });
    return token;
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const [row] = await db.select().from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .limit(1);
    return row;
  }

  async usePasswordResetToken(token: string): Promise<void> {
    await db.update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.token, token));
  }

  async updatePassword(accountId: number, newPassword: string): Promise<void> {
    const hash = await bcrypt.hash(newPassword, 10);
    await db.update(accounts)
      .set({ passwordHash: hash, updatedAt: new Date() })
      .where(eq(accounts.id, accountId));
  }

  async createApiToken(
    accountId: number,
    name: string,
    prefix: string,
    tokenHash: string,
    expiresAt: Date | null,
  ): Promise<PublicApiToken> {
    const [row] = await db.insert(apiTokens).values({
      accountId,
      name,
      prefix,
      tokenHash,
      expiresAt,
    }).returning();
    const { tokenHash: _omit, ...rest } = row;
    return rest;
  }

  async getApiTokenByHash(tokenHash: string): Promise<ApiToken | undefined> {
    const [row] = await db.select().from(apiTokens)
      .where(eq(apiTokens.tokenHash, tokenHash))
      .limit(1);
    return row;
  }

  async listApiTokensForAccount(accountId: number): Promise<PublicApiToken[]> {
    const rows = await db.select().from(apiTokens)
      .where(eq(apiTokens.accountId, accountId));
    return rows.map(({ tokenHash: _omit, ...rest }) => rest);
  }

  async revokeApiToken(id: number, accountId: number): Promise<boolean> {
    const result = await db.update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(and(
        eq(apiTokens.id, id),
        eq(apiTokens.accountId, accountId),
        sql`${apiTokens.revokedAt} IS NULL`,
      ))
      .returning({ id: apiTokens.id });
    return result.length > 0;
  }

  async touchApiTokenLastUsed(id: number): Promise<void> {
    await db.update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, id));
  }

  async getOrganizationIdsForAccount(accountId: number): Promise<number[]> {
    const asOrganizer = await db.select({ id: organizationOrganizers.organizationId })
      .from(organizationOrganizers)
      .where(eq(organizationOrganizers.accountId, accountId));
    const asMember = await db.select({ id: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.accountId, accountId), eq(organizationMembers.status, "approved")));
    const ids = new Set([...asOrganizer.map(r => r.id), ...asMember.map(r => r.id)]);
    return Array.from(ids);
  }

  async getOrganizationIdsAsOrganizer(accountId: number): Promise<number[]> {
    const rows = await db.select({ id: organizationOrganizers.organizationId })
      .from(organizationOrganizers)
      .where(eq(organizationOrganizers.accountId, accountId));
    return Array.from(new Set(rows.map(r => r.id)));
  }

  async getEntityIdsForAccount(accountId: number, minLevel: DelegationLevel = "observer"): Promise<number[]> {
    const rows = await db.select({ id: delegations.principalEntityId })
      .from(delegations)
      .where(and(
        eq(delegations.delegateAccountId, accountId),
        sql`${delegations.principalEntityId} IS NOT NULL`,
        minLevel === "manager" ? eq(delegations.level, "manager") : undefined,
      ));
    return rows.map(r => r.id!);
  }

  async getVehicleIdsForAccount(accountId: number): Promise<number[]> {
    const [ownedEntityIds, managedEntityIds] = await Promise.all([
      this.getEntityIdsOwnedByAccount(accountId),
      this.getEntityIdsForAccount(accountId),
    ]);
    const allEntityIds = Array.from(new Set([...ownedEntityIds, ...managedEntityIds]));
    const conds: any[] = [eq(vehicleMembers.accountId, accountId)];
    if (allEntityIds.length > 0) {
      conds.push(inArray(vehicleMembers.entityId, allEntityIds));
    }
    const memberOf = await db.select({ id: vehicleMembers.vehicleId })
      .from(vehicleMembers)
      .where(or(...conds));
    return Array.from(new Set(memberOf.map(r => r.id)));
  }

  async getActiveCurrencyCodes(): Promise<string[]> {
    const rows = await db.select({ code: currencies.code }).from(currencies).where(eq(currencies.active, true));
    return rows.map(r => r.code);
  }

  async seedData(): Promise<void> {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS unaccent`);
    const existingRoles = await db.select().from(roles);
    if (existingRoles.length === 0) {
      await db.insert(roles).values([
        { name: "admin", description: "Platform administrator with full access" },
      ]);
    }

    const existingAccounts = await db.select().from(accounts);
    if (existingAccounts.length === 0) {
      const bcrypt = await import("bcrypt");
      const adminHash = await bcrypt.hash(resolveSeedAdminPassword(), 10);
      const isProduction = process.env.NODE_ENV === "production";

      const adminAccount = {
        email: "isaac@conexo.vc", passwordHash: adminHash,
        firstName: "Isaac", lastName: "Admin",
        profileComplete: false,
      };

      // Production gets only the admin account on a clean database.
      // Development gets demo accounts for manual testing.
      if (isProduction) {
        const inserted = await db.insert(accounts).values([adminAccount]).returning();
        const [adminRole] = await db.select().from(roles).where(eq(roles.name, "admin"));
        if (adminRole && inserted[0]) {
          await db.insert(accountRoles).values({
            accountId: inserted[0].id, roleId: adminRole.id,
          }).onConflictDoNothing();
        }
        return;
      }

      const hash = await bcrypt.hash("password123", 10);
      const seedAccounts = [
        adminAccount,
        {
          email: "adrian.montoya@gmail.com", passwordHash: hash,
          firstName: "Adrian", lastName: "Montoya Garcia",
          phone: "605438815", birthdate: "2006-01-28", taxId: "123-45-6789",
          streetAddress1: "Calle Mariano Benlliure", streetAddress2: "Apt 4B",
          country: "Spain", city: "Elche", stateProvince: "Alicante",
          zipPostalCode: "03201", profileComplete: false,
        },
        {
          email: "sarah.chen@globalvc.com", passwordHash: hash,
          firstName: "Sarah", lastName: "Chen",
          phone: "+1-415-555-0142", birthdate: "1985-03-15", taxId: "987-65-4321",
          streetAddress1: "123 Market Street", streetAddress2: "Suite 500",
          country: "United States", city: "San Francisco", stateProvince: "California",
          zipPostalCode: "94105", profileComplete: true,
        },
        {
          email: "james.wright@capitalpartners.co", passwordHash: hash,
          firstName: "James", lastName: "Wright",
          phone: "+44-20-7946-0958", birthdate: "1978-11-22",
          streetAddress1: "10 Downing Avenue",
          country: "United Kingdom", city: "London", stateProvince: "England",
          zipPostalCode: "SW1A 2AA", profileComplete: true,
        },
        {
          email: "maria.rodriguez@fundmgmt.es", passwordHash: hash,
          firstName: "Maria", lastName: "Rodriguez",
          phone: "+34-611-234-567", birthdate: "1990-07-08",
          streetAddress1: "Paseo de la Castellana 45", streetAddress2: "Oficina 301",
          country: "Spain", city: "Madrid", stateProvince: "Madrid",
          zipPostalCode: "28046", profileComplete: true,
        },
        {
          email: "david.kim@asiaventures.kr", passwordHash: hash,
          firstName: "David", lastName: "Kim",
          phone: "+82-2-555-0199", birthdate: "1982-05-30",
          streetAddress1: "123 Gangnam-daero", streetAddress2: "Floor 12",
          country: "South Korea", city: "Seoul", stateProvince: "Seoul",
          zipPostalCode: "06141", profileComplete: false,
        },
      ];

      const inserted = await db.insert(accounts).values(seedAccounts).returning();

      const allRoles = await db.select().from(roles);
      const roleByName = (name: string) => allRoles.find(r => r.name === name)!;

      const roleAssignments = [
        { email: "isaac@conexo.vc", roles: ["admin"] },
        { email: "maria.rodriguez@fundmgmt.es", roles: ["admin"] },
      ];

      for (const assignment of roleAssignments) {
        const account = inserted.find(a => a.email === assignment.email);
        if (account) {
          for (const roleName of assignment.roles) {
            const role = roleByName(roleName);
            if (role) {
              await db.insert(accountRoles).values({
                accountId: account.id,
                roleId: role.id,
              }).onConflictDoNothing();
            }
          }
        }
      }
    }
  }
}

export const storage = new DatabaseStorage();
