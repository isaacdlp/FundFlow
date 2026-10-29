/**
 * Development data snapshot.
 *
 *   npm run dev-data:export   pull an org + selected Vehicles from a FundFlow instance
 *   npm run dev-data:seed     load that snapshot into the local DATABASE_URL
 *
 * Export reads FUNDFLOW_URL (default https://portal.rapidscale.vc) and
 * FUNDFLOW_TOKEN (an admin's `ff_…` API token), plus optional DEV_DATA_ORG
 * (org slug) and DEV_DATA_VEHICLES (comma-separated Vehicle name fragments).
 * Seeded accounts get DEV_SEED_PASSWORD (default "password123").
 * The snapshot lives in dev-data/, which is gitignored: it holds real people.
 */
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import {
  exportDevData, importDevData, DEFAULT_DEV_ORG_SLUG, DEFAULT_DEV_VEHICLES,
  type DevDataset, type DevDataSink,
} from "../server/dev-data";

const DATA_FILE = path.resolve(process.env.DEV_DATA_FILE ?? "dev-data/dataset.json");

async function runExport() {
  const baseUrl = (process.env.FUNDFLOW_URL ?? "https://portal.rapidscale.vc").replace(/\/$/, "");
  const token = process.env.FUNDFLOW_TOKEN;
  if (!token) throw new Error("FUNDFLOW_TOKEN must be set to an admin API token (ff_…) for " + baseUrl);

  const get = async (p: string) => {
    const res = await fetch(baseUrl + p, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`GET ${p} → ${res.status} ${await res.text()}`);
    return res.json();
  };

  const data = await exportDevData(get, {
    source: baseUrl,
    orgSlug: process.env.DEV_DATA_ORG ?? DEFAULT_DEV_ORG_SLUG,
    vehiclePatterns: process.env.DEV_DATA_VEHICLES?.split(",").map(s => s.trim()).filter(Boolean) ?? DEFAULT_DEV_VEHICLES,
  });

  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  console.log(`Exported "${data.organization.name}" to ${DATA_FILE}:`);
  console.log(`  ${data.accounts.length} accounts, ${data.entities.length} entities`);
  for (const vehicle of data.vehicles) {
    console.log(`  Vehicle ${vehicle.fields.displayName}: ${vehicle.members.length} positions, ${vehicle.assets.length} assets`);
  }
}

async function runSeed() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to load development data with NODE_ENV=production");
  if (!fs.existsSync(DATA_FILE)) throw new Error(`${DATA_FILE} not found — run \`npm run dev-data:export\` first`);
  const data: DevDataset = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));

  const { db, storage } = await import("../server/storage");
  const schema = await import("../shared/schema");
  const bcrypt = await import("bcrypt");

  // Roles, currencies and the seed admin come from the normal startup seed.
  await storage.seedData();

  const slug = String(data.organization.slug);
  const [existing] = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, slug));
  if (existing) {
    console.log(`Organization "${slug}" already exists (id ${existing.id}); nothing to do. Reset the database to re-seed.`);
    return;
  }

  const passwordHash = await bcrypt.hash(process.env.DEV_SEED_PASSWORD ?? "password123", 10);
  const [adminRole] = await db.select().from(schema.roles).where(eq(schema.roles.name, "admin"));

  const result = await db.transaction(async (tx) => {
    const sink: DevDataSink = {
      async findAccountByEmail(email) {
        const [row] = await tx.select({ id: schema.accounts.id }).from(schema.accounts).where(eq(schema.accounts.email, email));
        return row?.id;
      },
      async insertAccount(account) {
        const [row] = await tx.insert(schema.accounts).values({ ...account, passwordHash }).returning({ id: schema.accounts.id });
        return row.id;
      },
      async grantAdmin(accountId) {
        await tx.insert(schema.accountRoles).values({ accountId, roleId: adminRole.id });
      },
      async insertOrganization(fields) {
        const [row] = await tx.insert(schema.organizations).values(fields as any).returning({ id: schema.organizations.id });
        return row.id;
      },
      async addOrganizer(organizationId, accountId) {
        await tx.insert(schema.organizationOrganizers).values({ organizationId, accountId });
      },
      async addMember(organizationId, accountId, status) {
        await tx.insert(schema.organizationMembers).values({ organizationId, accountId, status });
      },
      async insertEntity(fields) {
        const [row] = await tx.insert(schema.entities).values(fields as any).returning({ id: schema.entities.id });
        return row.id;
      },
      async addEntityManager(entityId, accountId) {
        await tx.insert(schema.entityManagers).values({ entityId, accountId });
      },
      async addEntityOwner(entityId, owner) {
        await tx.insert(schema.entityOwners).values({ entityId, ...owner });
      },
      async insertVehicle(fields) {
        const [row] = await tx.insert(schema.vehicles).values(fields as any).returning({ id: schema.vehicles.id });
        return row.id;
      },
      async insertVehicleMember(vehicleId, member) {
        await tx.insert(schema.vehicleMembers).values({ vehicleId, ...member });
      },
      async insertVehicleAsset(vehicleId, asset) {
        const [row] = await tx.insert(schema.vehicleAssets).values({ vehicleId, ...asset }).returning({ id: schema.vehicleAssets.id });
        return row.id;
      },
      async insertValuation(assetId, valuation) {
        await tx.insert(schema.vehicleAssetValuations).values({ assetId, ...valuation });
      },
    };
    return importDevData(data, sink);
  });

  console.log(`Seeded "${data.organization.name}" from ${data.source} (exported ${data.exportedAt}):`);
  console.log(`  ${result.accountsCreated} accounts created, ${result.accountsReused} already existed`);
  console.log(`  ${result.entities} entities, ${result.vehicles} Vehicles, ${result.vehicleMembers} Vehicle positions`);
}

const command = process.argv[2];
const run = command === "export" ? runExport : command === "seed" ? runSeed : null;
if (!run) {
  console.error("Usage: tsx script/dev-data.ts <export|seed>");
  process.exit(1);
}
run().then(() => process.exit(0), (err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
