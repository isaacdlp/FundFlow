import { eq, ilike, or, sql, and, lt, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  accounts, roles, accountRoles, organizations, organizationOrganizers,
  organizationMembers, organizationInvites, spvs, spvMembers,
  entities, entityOwners, entityManagers, passwordResetTokens,
  apiTokens,
  type Account, type Role, type InsertAccount, type UpdateAccount,
  type Organization, type InsertOrganization, type UpdateOrganization,
  type OrganizationMember, type OrganizationInvite,
  type Spv, type SpvMember, type InsertSpv, type UpdateSpv,
  type Entity, type EntityOwner, type EntityManager,
  type InsertEntity, type UpdateEntity,
  type PasswordResetToken,
  type ApiToken, type PublicApiToken,
} from "@shared/schema";
import crypto from "crypto";
import bcrypt from "bcrypt";

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

export interface SpvWithDetails extends Spv {
  manager?: { id: number; email: string; firstName: string; lastName: string } | null;
  signatory?: { id: number; email: string; firstName: string; lastName: string } | null;
  memberCount: number;
  organization?: { id: number; name: string; slug: string } | null;
}

export interface SpvMemberWithAccount extends SpvMember {
  investorType: "account" | "entity";
  account: { id: number; email: string; firstName: string; lastName: string } | null;
  entity: { id: number; name: string; entityType: string } | null;
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
  initialValue: string;
  currentValue: string;
  distributions: string;
  purchaseDate: string | null;
}

export interface EntityWithDetails extends Entity {
  managers: { id: number; accountId: number; account: { id: number; email: string; firstName: string; lastName: string } }[];
  ownerCount: number;
}

export interface EntityOwnerWithDetails extends EntityOwner {
  ownerAccount?: { id: number; email: string; firstName: string; lastName: string } | null;
  ownerEntity?: { id: number; name: string; entityType: string } | null;
}

export interface EntityManagerWithAccount extends EntityManager {
  account: { id: number; email: string; firstName: string; lastName: string };
}

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
  createMemberRequest(organizationId: number, accountId: number, inviteId?: number): Promise<MemberWithAccount>;
  updateMemberStatus(organizationId: number, accountId: number, status: string): Promise<MemberWithAccount | undefined>;
  removeMember(organizationId: number, accountId: number): Promise<boolean>;

  getInvites(organizationId: number): Promise<InviteWithAccount[]>;
  createInvite(organizationId: number): Promise<OrganizationInvite>;
  getInviteByToken(token: string): Promise<InviteWithAccount | undefined>;
  useInvite(token: string, accountId: number): Promise<void>;

  getAllSpvs(): Promise<SpvWithDetails[]>;
  getSpvs(organizationId: number): Promise<SpvWithDetails[]>;
  getSpv(id: number): Promise<SpvWithDetails | undefined>;
  createSpv(data: InsertSpv): Promise<SpvWithDetails>;
  updateSpv(id: number, data: UpdateSpv): Promise<SpvWithDetails | undefined>;
  deleteSpv(id: number): Promise<boolean>;
  getSpvMembers(spvId: number): Promise<SpvMemberWithAccount[]>;
  addSpvMember(spvId: number, investor: { accountId: number } | { entityId: number }, investment?: { initialValue?: string; currentValue?: string; distributions?: string; feesPaid?: string; ownershipPercent?: string | null; purchaseDate?: string | null }): Promise<SpvMemberWithAccount>;
  updateSpvMember(spvId: number, investor: { accountId: number } | { entityId: number }, investment: { initialValue?: string; currentValue?: string; distributions?: string; feesPaid?: string; ownershipPercent?: string | null; purchaseDate?: string | null }): Promise<SpvMemberWithAccount | undefined>;
  removeSpvMember(spvId: number, investor: { accountId: number } | { entityId: number }): Promise<boolean>;
  getPortfolio(filter?: { accountIds?: number[]; entityIds?: number[] }): Promise<PortfolioInvestment[]>;
  getEntityIdsOwnedByAccount(accountId: number): Promise<number[]>;

  getAllEntities(search?: string): Promise<EntityWithDetails[]>;
  getEntity(id: number): Promise<EntityWithDetails | undefined>;
  createEntity(data: InsertEntity): Promise<EntityWithDetails>;
  updateEntity(id: number, data: UpdateEntity): Promise<EntityWithDetails | undefined>;
  deleteEntity(id: number): Promise<boolean>;
  getEntityOwners(entityId: number): Promise<EntityOwnerWithDetails[]>;
  addEntityOwner(entityId: number, ownerType: string, ownerAccountId: number | null, ownerEntityId: number | null, ownershipPercent: string, date: string | null): Promise<EntityOwnerWithDetails>;
  removeEntityOwner(ownerId: number): Promise<boolean>;
  getEntityManagers(entityId: number): Promise<EntityManagerWithAccount[]>;
  addEntityManager(entityId: number, accountId: number): Promise<EntityManagerWithAccount>;
  removeEntityManager(entityId: number, accountId: number): Promise<boolean>;

  getOrganizationIdsForAccount(accountId: number): Promise<number[]>;
  getEntityIdsForAccount(accountId: number): Promise<number[]>;
  getSpvIdsForAccount(accountId: number): Promise<number[]>;

  createPasswordResetToken(accountId: number): Promise<string>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  usePasswordResetToken(token: string): Promise<void>;
  updatePassword(accountId: number, newPassword: string): Promise<void>;

  createApiToken(accountId: number, name: string, prefix: string, tokenHash: string, expiresAt: Date | null): Promise<PublicApiToken>;
  getApiTokenByHash(tokenHash: string): Promise<ApiToken | undefined>;
  listApiTokensForAccount(accountId: number): Promise<PublicApiToken[]>;
  revokeApiToken(id: number, accountId: number): Promise<boolean>;
  touchApiTokenLastUsed(id: number): Promise<void>;

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
          ilike(accounts.firstName, pattern),
          ilike(accounts.lastName, pattern),
          ilike(accounts.email, pattern)
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
    const passwordHash = await bcrypt.hash(password, 10);

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
    const result = await db.delete(accounts).where(eq(accounts.id, id)).returning();
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

  async createMemberRequest(organizationId: number, accountId: number, inviteId?: number): Promise<MemberWithAccount> {
    const status = inviteId ? "approved" : "pending";
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

  private async enrichSpv(spv: Spv): Promise<SpvWithDetails> {
    const manager = spv.managerId ? await getAccountSummary(spv.managerId) : null;
    const signatory = spv.signatoryId ? await getAccountSummary(spv.signatoryId) : null;
    const members = await db.select().from(spvMembers).where(eq(spvMembers.spvId, spv.id));
    return { ...spv, manager, signatory, memberCount: members.length };
  }

  async getAllSpvs(): Promise<SpvWithDetails[]> {
    const spvList = await db.select().from(spvs)
      .orderBy(sql`${spvs.createdAt} DESC`);
    const enriched = await Promise.all(spvList.map(s => this.enrichSpv(s)));
    for (const spv of enriched) {
      const [org] = await db.select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
      }).from(organizations).where(eq(organizations.id, spv.organizationId));
      spv.organization = org || null;
    }
    return enriched;
  }

  async getSpvs(organizationId: number): Promise<SpvWithDetails[]> {
    const spvList = await db.select().from(spvs)
      .where(eq(spvs.organizationId, organizationId))
      .orderBy(sql`${spvs.createdAt} DESC`);
    return Promise.all(spvList.map(s => this.enrichSpv(s)));
  }

  async getSpv(id: number): Promise<SpvWithDetails | undefined> {
    const [spv] = await db.select().from(spvs).where(eq(spvs.id, id));
    if (!spv) return undefined;
    return this.enrichSpv(spv);
  }

  async createSpv(data: InsertSpv): Promise<SpvWithDetails> {
    const [spv] = await db.insert(spvs).values(data).returning();
    return this.enrichSpv(spv);
  }

  async updateSpv(id: number, data: UpdateSpv): Promise<SpvWithDetails | undefined> {
    const existing = await this.getSpv(id);
    if (!existing) return undefined;

    const updateFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        updateFields[key] = value;
      }
    }

    if (Object.keys(updateFields).length > 0) {
      updateFields.updatedAt = new Date();
      await db.update(spvs).set(updateFields).where(eq(spvs.id, id));
    }

    return this.getSpv(id);
  }

  async deleteSpv(id: number): Promise<boolean> {
    const result = await db.delete(spvs).where(eq(spvs.id, id)).returning();
    return result.length > 0;
  }

  async getSpvMembers(spvId: number): Promise<SpvMemberWithAccount[]> {
    const members = await db.select().from(spvMembers)
      .where(eq(spvMembers.spvId, spvId))
      .orderBy(sql`${spvMembers.createdAt} DESC`);

    const result: SpvMemberWithAccount[] = [];
    for (const m of members) {
      if (m.accountId !== null) {
        const acct = await getAccountSummary(m.accountId);
        if (acct) {
          result.push({ ...m, investorType: "account", account: acct, entity: null });
        }
      } else if (m.entityId !== null) {
        const ent = await getEntitySummary(m.entityId);
        if (ent) {
          result.push({ ...m, investorType: "entity", account: null, entity: ent });
        }
      }
    }
    return result;
  }

  async addSpvMember(
    spvId: number,
    investor: { accountId: number } | { entityId: number },
    investment?: { initialValue?: string; currentValue?: string; distributions?: string; feesPaid?: string; ownershipPercent?: string | null; purchaseDate?: string | null }
  ): Promise<SpvMemberWithAccount> {
    const values: any = { spvId };
    if ("accountId" in investor) values.accountId = investor.accountId;
    else values.entityId = investor.entityId;
    if (investment) {
      if (investment.initialValue !== undefined) values.initialValue = investment.initialValue;
      if (investment.currentValue !== undefined) values.currentValue = investment.currentValue;
      if (investment.distributions !== undefined) values.distributions = investment.distributions;
      if (investment.feesPaid !== undefined) values.feesPaid = investment.feesPaid;
      if (investment.ownershipPercent !== undefined) values.ownershipPercent = investment.ownershipPercent;
      if (investment.purchaseDate !== undefined) values.purchaseDate = investment.purchaseDate;
    }
    const [member] = await db.insert(spvMembers).values(values)
      .onConflictDoNothing().returning();

    const finalMember = member ?? (await db.select().from(spvMembers)
      .where("accountId" in investor
        ? and(eq(spvMembers.spvId, spvId), eq(spvMembers.accountId, investor.accountId))
        : and(eq(spvMembers.spvId, spvId), eq(spvMembers.entityId, investor.entityId))))[0];

    if ("accountId" in investor) {
      const acct = await getAccountSummary(investor.accountId);
      return { ...finalMember, investorType: "account", account: acct!, entity: null };
    } else {
      const ent = await getEntitySummary(investor.entityId);
      return { ...finalMember, investorType: "entity", account: null, entity: ent! };
    }
  }

  async updateSpvMember(
    spvId: number,
    investor: { accountId: number } | { entityId: number },
    investment: { initialValue?: string; currentValue?: string; distributions?: string; feesPaid?: string; ownershipPercent?: string | null; purchaseDate?: string | null }
  ): Promise<SpvMemberWithAccount | undefined> {
    const investorWhere = "accountId" in investor
      ? and(eq(spvMembers.spvId, spvId), eq(spvMembers.accountId, investor.accountId))
      : and(eq(spvMembers.spvId, spvId), eq(spvMembers.entityId, investor.entityId));

    const updates: any = {};
    if (investment.initialValue !== undefined) updates.initialValue = investment.initialValue;
    if (investment.currentValue !== undefined) updates.currentValue = investment.currentValue;
    if (investment.distributions !== undefined) updates.distributions = investment.distributions;
    if (investment.feesPaid !== undefined) updates.feesPaid = investment.feesPaid;
    if (investment.ownershipPercent !== undefined) updates.ownershipPercent = investment.ownershipPercent;
    if (investment.purchaseDate !== undefined) updates.purchaseDate = investment.purchaseDate;

    let row;
    if (Object.keys(updates).length === 0) {
      [row] = await db.select().from(spvMembers).where(investorWhere);
    } else {
      [row] = await db.update(spvMembers).set(updates).where(investorWhere).returning();
    }
    if (!row) return undefined;

    if ("accountId" in investor) {
      const acct = await getAccountSummary(investor.accountId);
      return { ...row, investorType: "account", account: acct!, entity: null };
    } else {
      const ent = await getEntitySummary(investor.entityId);
      return { ...row, investorType: "entity", account: null, entity: ent! };
    }
  }

  async removeSpvMember(spvId: number, investor: { accountId: number } | { entityId: number }): Promise<boolean> {
    const investorWhere = "accountId" in investor
      ? and(eq(spvMembers.spvId, spvId), eq(spvMembers.accountId, investor.accountId))
      : and(eq(spvMembers.spvId, spvId), eq(spvMembers.entityId, investor.entityId));
    const result = await db.delete(spvMembers).where(investorWhere).returning();
    return result.length > 0;
  }

  async getPortfolio(filter?: { accountIds?: number[]; entityIds?: number[] }): Promise<PortfolioInvestment[]> {
    let where;
    if (filter !== undefined) {
      const conds: any[] = [];
      if (filter.accountIds !== undefined && filter.accountIds.length > 0) {
        conds.push(inArray(spvMembers.accountId, filter.accountIds));
      }
      if (filter.entityIds !== undefined && filter.entityIds.length > 0) {
        conds.push(inArray(spvMembers.entityId, filter.entityIds));
      }
      if (conds.length === 0) return [];
      where = conds.length === 1 ? conds[0] : or(...conds);
    } else {
      where = sql`TRUE`;
    }

    const rows = await db
      .select({
        memberId: spvMembers.id,
        spvId: spvs.id,
        spvName: spvs.displayName,
        investmentCompanyName: spvs.investmentCompanyName,
        investmentType: spvs.investmentType,
        organizationId: organizations.id,
        organizationName: organizations.name,
        organizationSlug: organizations.slug,
        accountId: spvMembers.accountId,
        entityId: spvMembers.entityId,
        accountFirstName: accounts.firstName,
        accountLastName: accounts.lastName,
        accountEmail: accounts.email,
        entityName: entities.name,
        entityType: entities.entityType,
        initialValue: spvMembers.initialValue,
        currentValue: spvMembers.currentValue,
        distributions: spvMembers.distributions,
        purchaseDate: spvMembers.purchaseDate,
      })
      .from(spvMembers)
      .innerJoin(spvs, eq(spvs.id, spvMembers.spvId))
      .innerJoin(organizations, eq(organizations.id, spvs.organizationId))
      .leftJoin(accounts, eq(accounts.id, spvMembers.accountId))
      .leftJoin(entities, eq(entities.id, spvMembers.entityId))
      .where(where)
      .orderBy(sql`${spvs.displayName} ASC`);

    return rows.map(r => {
      const isAccount = r.accountId !== null;
      return {
        memberId: r.memberId,
        spvId: r.spvId,
        spvName: r.spvName,
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
        initialValue: r.initialValue ?? "0",
        currentValue: r.currentValue ?? "0",
        distributions: r.distributions ?? "0",
        purchaseDate: r.purchaseDate ?? null,
      };
    });
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
    const mgrs = await db.select().from(entityManagers).where(eq(entityManagers.entityId, entity.id));
    const managersWithAccounts = [];
    for (const m of mgrs) {
      const acct = await getAccountSummary(m.accountId);
      if (acct) {
        managersWithAccounts.push({ id: m.id, accountId: m.accountId, account: acct });
      }
    }
    const owners = await db.select().from(entityOwners).where(eq(entityOwners.entityId, entity.id));
    return { ...entity, managers: managersWithAccounts, ownerCount: owners.length };
  }

  async getAllEntities(search?: string): Promise<EntityWithDetails[]> {
    let query = db.select().from(entities).orderBy(sql`${entities.name} ASC`);
    if (search) {
      query = db.select().from(entities)
        .where(or(
          ilike(entities.name, `%${search}%`),
          ilike(entities.entityType, `%${search}%`),
        ))
        .orderBy(sql`${entities.name} ASC`);
    }
    const list = await query;
    return Promise.all(list.map(e => this.enrichEntity(e)));
  }

  async getEntity(id: number): Promise<EntityWithDetails | undefined> {
    const [entity] = await db.select().from(entities).where(eq(entities.id, id));
    if (!entity) return undefined;
    return this.enrichEntity(entity);
  }

  async createEntity(data: InsertEntity): Promise<EntityWithDetails> {
    const [entity] = await db.insert(entities).values(data).returning();
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

  async addEntityOwner(entityId: number, ownerType: string, ownerAccountId: number | null, ownerEntityId: number | null, ownershipPercent: string, date: string | null): Promise<EntityOwnerWithDetails> {
    const [owner] = await db.insert(entityOwners).values({
      entityId,
      ownerType,
      ownerAccountId,
      ownerEntityId,
      ownershipPercent,
      date,
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

  async getEntityManagers(entityId: number): Promise<EntityManagerWithAccount[]> {
    const mgrs = await db.select().from(entityManagers)
      .where(eq(entityManagers.entityId, entityId))
      .orderBy(sql`${entityManagers.createdAt} DESC`);
    const result: EntityManagerWithAccount[] = [];
    for (const m of mgrs) {
      const acct = await getAccountSummary(m.accountId);
      if (acct) result.push({ ...m, account: acct });
    }
    return result;
  }

  async addEntityManager(entityId: number, accountId: number): Promise<EntityManagerWithAccount> {
    const [mgr] = await db.insert(entityManagers).values({ entityId, accountId })
      .onConflictDoNothing().returning();
    if (!mgr) {
      const existing = await db.select().from(entityManagers)
        .where(and(eq(entityManagers.entityId, entityId), eq(entityManagers.accountId, accountId)));
      const acct = await getAccountSummary(accountId);
      return { ...existing[0], account: acct! };
    }
    const acct = await getAccountSummary(accountId);
    return { ...mgr, account: acct! };
  }

  async removeEntityManager(entityId: number, accountId: number): Promise<boolean> {
    const result = await db.delete(entityManagers)
      .where(and(eq(entityManagers.entityId, entityId), eq(entityManagers.accountId, accountId)))
      .returning();
    return result.length > 0;
  }

  async createPasswordResetToken(accountId: number): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
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

  async getEntityIdsForAccount(accountId: number): Promise<number[]> {
    const managed = await db.select({ id: entityManagers.entityId })
      .from(entityManagers)
      .where(eq(entityManagers.accountId, accountId));
    return managed.map(r => r.id);
  }

  async getSpvIdsForAccount(accountId: number): Promise<number[]> {
    const ownedEntityIds = await this.getEntityIdsOwnedByAccount(accountId);
    const conds: any[] = [eq(spvMembers.accountId, accountId)];
    if (ownedEntityIds.length > 0) {
      conds.push(inArray(spvMembers.entityId, ownedEntityIds));
    }
    const memberOf = await db.select({ id: spvMembers.spvId })
      .from(spvMembers)
      .where(or(...conds));
    return Array.from(new Set(memberOf.map(r => r.id)));
  }

  async seedData(): Promise<void> {
    const existingRoles = await db.select().from(roles);
    if (existingRoles.length === 0) {
      await db.insert(roles).values([
        { name: "admin", description: "Platform administrator with full access" },
      ]);
    }

    const existingAccounts = await db.select().from(accounts);
    if (existingAccounts.length === 0) {
      const bcrypt = await import("bcrypt");
      const hash = await bcrypt.hash("password123", 10);
      const adminHash = await bcrypt.hash("ioYOU&*HjEE", 10);

      const seedAccounts = [
        {
          email: "isaac@conexo.vc", passwordHash: adminHash,
          firstName: "Isaac", lastName: "Admin",
          profileComplete: false,
        },
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
