import { eq, ilike, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  accounts, roles, accountRoles,
  type Account, type Role, type InsertAccount, type UpdateAccount,
} from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

export const db = drizzle(process.env.DATABASE_URL);

export interface AccountWithRoles extends Account {
  roles: Role[];
}

export interface IStorage {
  getRoles(): Promise<Role[]>;
  getAccounts(search?: string, roleFilter?: string): Promise<AccountWithRoles[]>;
  getAccount(id: number): Promise<AccountWithRoles | undefined>;
  createAccount(data: InsertAccount): Promise<AccountWithRoles>;
  updateAccount(id: number, data: UpdateAccount): Promise<AccountWithRoles | undefined>;
  deleteAccount(id: number): Promise<boolean>;
  seedData(): Promise<void>;
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

export class DatabaseStorage implements IStorage {
  async getRoles(): Promise<Role[]> {
    return db.select().from(roles).orderBy(roles.id);
  }

  async getAccounts(search?: string, roleFilter?: string): Promise<AccountWithRoles[]> {
    let query = db.select().from(accounts).orderBy(sql`${accounts.createdAt} DESC`);

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
      accountList = await query;
    }

    let withRoles = await attachRoles(accountList);

    if (roleFilter && roleFilter !== "all") {
      withRoles = withRoles.filter(a => a.roles.some(r => r.name === roleFilter));
    }

    return withRoles;
  }

  async getAccount(id: number): Promise<AccountWithRoles | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
    if (!account) return undefined;
    const [withRoles] = await attachRoles([account]);
    return withRoles;
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

  async seedData(): Promise<void> {
    const existingRoles = await db.select().from(roles);
    if (existingRoles.length === 0) {
      await db.insert(roles).values([
        { name: "admin", description: "Platform administrator with full access" },
        { name: "gp", description: "General Partner - Fund manager" },
        { name: "lp", description: "Limited Partner - Investor in funds" },
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
        { email: "adrian.montoya@gmail.com", roles: ["lp"] },
        { email: "sarah.chen@globalvc.com", roles: ["gp", "lp"] },
        { email: "james.wright@capitalpartners.co", roles: ["gp"] },
        { email: "maria.rodriguez@fundmgmt.es", roles: ["admin", "gp"] },
        { email: "david.kim@asiaventures.kr", roles: ["lp"] },
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
