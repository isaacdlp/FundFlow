import { describe, it, expect } from "vitest";
import { planDbRenames, planEntityDelegationsMerge, planVehicleClassesBackfill, applyDbRenames, type CatalogSnapshot } from "../../server/db-renames";

// The catalog as it was before SPVs became Vehicles (trimmed to what matters).
const legacy: CatalogSnapshot = {
  tables: ["accounts", "spvs", "spv_members", "spv_assets", "spv_asset_valuations"],
  columns: [
    { table: "spvs", column: "id" },
    { table: "spv_members", column: "spv_id" },
    { table: "spv_assets", column: "spv_id" },
    { table: "spv_asset_valuations", column: "asset_id" },
  ],
  constraints: [
    { table: "spvs", name: "spvs_pkey" },
    { table: "spvs", name: "spvs_organization_id_organizations_id_fk" },
    { table: "spv_members", name: "spv_members_spv_id_spvs_id_fk" },
    { table: "spv_members", name: "spv_member_investor_xor" },
    { table: "spv_asset_valuations", name: "spv_asset_valuations_asset_id_spv_assets_id_fk" },
    { table: "accounts", name: "accounts_pkey" },
  ],
  indexes: ["spvs_pkey", "spv_default_asset_unique", "accounts_pkey"],
  sequences: ["spvs_id_seq", "accounts_id_seq"],
};

const renamed: CatalogSnapshot = {
  tables: ["accounts", "vehicles", "vehicle_members", "vehicle_assets", "vehicle_asset_valuations"],
  columns: [{ table: "vehicle_members", column: "vehicle_id" }],
  constraints: [{ table: "vehicles", name: "vehicles_pkey" }],
  indexes: ["vehicles_pkey", "vehicle_default_asset_unique"],
  sequences: ["vehicles_id_seq"],
};

// Up to date: Vehicles have share classes.
const current: CatalogSnapshot = {
  ...renamed,
  tables: [...renamed.tables, "vehicle_classes"],
  columns: [...renamed.columns, { table: "vehicle_members", column: "class_id" }, { table: "vehicle_assets", column: "class_id" }],
  constraints: [
    ...renamed.constraints,
    { table: "vehicle_classes", name: "vehicle_classes_vehicle_name_unique" },
    { table: "vehicle_members", name: "vehicle_members_class_id_vehicle_classes_id_fk" },
    { table: "vehicle_assets", name: "vehicle_assets_class_id_vehicle_classes_id_fk" },
  ],
};

describe("planDbRenames", () => {
  it("renames SPV tables, columns, constraints, indexes and sequences to Vehicle", () => {
    const { statements, conflicts } = planDbRenames(legacy);
    expect(conflicts).toEqual([]);
    expect(statements).toEqual([
      `ALTER TABLE "spvs" RENAME TO "vehicles"`,
      `ALTER TABLE "spv_members" RENAME TO "vehicle_members"`,
      `ALTER TABLE "spv_assets" RENAME TO "vehicle_assets"`,
      `ALTER TABLE "spv_asset_valuations" RENAME TO "vehicle_asset_valuations"`,
      `ALTER TABLE "vehicle_members" RENAME COLUMN "spv_id" TO "vehicle_id"`,
      `ALTER TABLE "vehicle_assets" RENAME COLUMN "spv_id" TO "vehicle_id"`,
      `ALTER TABLE "vehicles" RENAME CONSTRAINT "spvs_pkey" TO "vehicles_pkey"`,
      `ALTER TABLE "vehicles" RENAME CONSTRAINT "spvs_organization_id_organizations_id_fk" TO "vehicles_organization_id_organizations_id_fk"`,
      `ALTER TABLE "vehicle_members" RENAME CONSTRAINT "spv_members_spv_id_spvs_id_fk" TO "vehicle_members_vehicle_id_vehicles_id_fk"`,
      `ALTER TABLE "vehicle_members" RENAME CONSTRAINT "spv_member_investor_xor" TO "vehicle_member_investor_xor"`,
      `ALTER TABLE "vehicle_asset_valuations" RENAME CONSTRAINT "spv_asset_valuations_asset_id_spv_assets_id_fk" TO "vehicle_asset_valuations_asset_id_vehicle_assets_id_fk"`,
      // spvs_pkey's index is renamed along with its constraint.
      `ALTER INDEX "spv_default_asset_unique" RENAME TO "vehicle_default_asset_unique"`,
      `ALTER SEQUENCE "spvs_id_seq" RENAME TO "vehicles_id_seq"`,
    ]);
  });

  it("plans nothing on an already-renamed database", () => {
    expect(planDbRenames(renamed)).toEqual({ statements: [], conflicts: [] });
  });

  it("leaves a table alone when its new name is already taken", () => {
    const { statements, conflicts } = planDbRenames({
      ...legacy,
      tables: [...legacy.tables, "vehicles"],
      columns: [], constraints: [], indexes: [], sequences: [],
    });
    expect(statements).not.toContain(`ALTER TABLE "spvs" RENAME TO "vehicles"`);
    expect(conflicts).toEqual(["table spvs (vehicles already exists)"]);
  });
});

// Entity managers before they became entity delegations.
const withManagers: CatalogSnapshot = {
  tables: ["accounts", "entities", "entity_managers"],
  columns: [{ table: "entity_managers", column: "entity_id" }, { table: "entity_managers", column: "account_id" }],
  constraints: [
    { table: "entity_managers", name: "entity_managers_pkey" },
    { table: "entity_managers", name: "entity_managers_entity_id_entities_id_fk" },
    { table: "entity_managers", name: "entity_managers_account_id_accounts_id_fk" },
  ],
  indexes: ["entity_managers_pkey", "entity_manager_unique"],
  sequences: ["entity_managers_id_seq"],
};

describe("planEntityDelegationsMerge", () => {
  it("turns entity_managers into delegations in place, every row a manager", () => {
    const plan = planEntityDelegationsMerge(withManagers);
    expect(plan.conflicts).toEqual([]);
    expect(plan.statements).toEqual([
      `ALTER TABLE "entity_managers" RENAME TO "delegations"`,
      `ALTER TABLE "delegations" RENAME COLUMN "entity_id" TO "principal_entity_id"`,
      `ALTER TABLE "delegations" RENAME COLUMN "account_id" TO "delegate_account_id"`,
      `ALTER TABLE "delegations" ADD COLUMN "principal_account_id" integer`,
      `ALTER TABLE "delegations" ADD COLUMN "level" varchar(20) NOT NULL DEFAULT 'manager'`,
      `ALTER TABLE "delegations" ALTER COLUMN "level" DROP DEFAULT`,
      `ALTER TABLE "delegations" ADD COLUMN "notes" text DEFAULT ''`,
      `ALTER TABLE "delegations" ADD COLUMN "updated_at" timestamp DEFAULT now()`,
      `ALTER TABLE "delegations" RENAME CONSTRAINT "entity_managers_pkey" TO "delegations_pkey"`,
      `ALTER TABLE "delegations" RENAME CONSTRAINT "entity_managers_entity_id_entities_id_fk" TO "delegations_principal_entity_id_entities_id_fk"`,
      `ALTER TABLE "delegations" RENAME CONSTRAINT "entity_managers_account_id_accounts_id_fk" TO "delegations_delegate_account_id_accounts_id_fk"`,
      `ALTER INDEX "entity_manager_unique" RENAME TO "delegations_entity_unique"`,
      `ALTER SEQUENCE "entity_managers_id_seq" RENAME TO "delegations_id_seq"`,
    ]);
  });

  it("plans nothing once merged", () => {
    expect(planEntityDelegationsMerge({ ...renamed, tables: [...renamed.tables, "delegations"] })).toEqual({ statements: [], conflicts: [] });
  });

  it("leaves both tables alone when delegations already exists", () => {
    const plan = planEntityDelegationsMerge({ ...withManagers, tables: [...withManagers.tables, "delegations"] });
    expect(plan.statements).toEqual([]);
    expect(plan.conflicts).toHaveLength(1);
  });
});

describe("planVehicleClassesBackfill", () => {
  it("gives every Vehicle a default class holding its positions and assets", () => {
    const { statements } = planVehicleClassesBackfill(renamed, false);
    expect(statements[0]).toMatch(/^CREATE TABLE IF NOT EXISTS "vehicle_classes"/);
    expect(statements[1]).toBe(`ALTER TABLE "vehicle_members" ADD COLUMN IF NOT EXISTS "class_id" integer`);
    expect(statements[2]).toBe(`ALTER TABLE "vehicle_assets" ADD COLUMN IF NOT EXISTS "class_id" integer`);
    expect(statements[3]).toMatch(/^INSERT INTO "vehicle_classes" .*'Class A'.*WHERE NOT EXISTS/);
    expect(statements[4]).toMatch(/^UPDATE "vehicle_members" m SET "class_id" = .* WHERE m."class_id" IS NULL$/);
    expect(statements[5]).toMatch(/^UPDATE "vehicle_assets" a SET "class_id" = .* WHERE a."class_id" IS NULL$/);
    // Constraints drizzle-kit would otherwise offer to truncate the tables for.
    expect(statements.slice(6)).toEqual([
      'ALTER TABLE "vehicle_members" ALTER COLUMN "class_id" SET NOT NULL',
      'ALTER TABLE "vehicle_assets" ALTER COLUMN "class_id" SET NOT NULL',
      'ALTER TABLE "vehicle_classes" ADD CONSTRAINT "vehicle_classes_vehicle_name_unique" UNIQUE ("vehicle_id", "name")',
      'ALTER TABLE "vehicle_members" ADD CONSTRAINT "vehicle_members_class_id_vehicle_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "vehicle_classes"("id") ON DELETE no action ON UPDATE no action',
      'ALTER TABLE "vehicle_assets" ADD CONSTRAINT "vehicle_assets_class_id_vehicle_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "vehicle_classes"("id") ON DELETE no action ON UPDATE no action',
      'DROP INDEX IF EXISTS "vehicle_default_asset_unique"',
      'CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_class_default_asset_unique" ON "vehicle_assets" ("class_id") WHERE is_default = true',
    ]);
  });

  it("also runs on a legacy catalog, after the SPV renames", () => {
    expect(planVehicleClassesBackfill(legacy, false).statements).toHaveLength(13);
  });

  it("plans nothing once done, unless rows were left without a class", () => {
    expect(planVehicleClassesBackfill(current, false).statements).toEqual([]);
    // Re-running doesn't re-add the constraints that already exist.
    const again = planVehicleClassesBackfill(current, true).statements;
    expect(again.some((st) => st.startsWith('UPDATE "vehicle_members"'))).toBe(true);
    expect(again.some((st) => st.includes("ADD CONSTRAINT"))).toBe(false);
  });

  it("plans nothing on an empty database", () => {
    expect(planVehicleClassesBackfill({ tables: [], columns: [], constraints: [], indexes: [], sequences: [] }, false).statements).toEqual([]);
  });
});

describe("applyDbRenames", () => {
  const fakeDb = (catalog: CatalogSnapshot, failOn?: string, unclassed = false) => {
    const executed: string[] = [];
    return {
      executed,
      async query(sql: string) {
        if (sql.includes("pg_tables")) return { rows: catalog.tables.map((n) => ({ n })) };
        if (sql.includes("information_schema.columns")) return { rows: catalog.columns.map((c) => ({ t: c.table, c: c.column })) };
        if (sql.includes("pg_constraint")) return { rows: catalog.constraints.map((c) => ({ t: c.table, n: c.name })) };
        if (sql.includes("pg_indexes")) return { rows: catalog.indexes.map((n) => ({ n })) };
        if (sql.includes("pg_sequences")) return { rows: catalog.sequences.map((n) => ({ n })) };
        if (sql.includes("AS pending")) return { rows: [{ pending: unclassed }] };
        executed.push(sql);
        if (failOn && sql.includes(failOn)) throw new Error("boom");
        return { rows: [] };
      },
    };
  };

  it("runs the plan inside a transaction", async () => {
    const db = fakeDb(legacy);
    await applyDbRenames(db, () => {});
    expect(db.executed[0]).toBe("BEGIN");
    expect(db.executed.at(-1)).toBe("COMMIT");
    expect(db.executed).toContain(`ALTER TABLE "spvs" RENAME TO "vehicles"`);
  });

  it("rolls back when a statement fails", async () => {
    const db = fakeDb(legacy, "RENAME COLUMN");
    await expect(applyDbRenames(db, () => {})).rejects.toThrow("boom");
    expect(db.executed.at(-1)).toBe("ROLLBACK");
  });

  it("runs the entity delegations merge in the same transaction", async () => {
    const db = fakeDb(withManagers);
    await applyDbRenames(db, () => {});
    expect(db.executed[0]).toBe("BEGIN");
    expect(db.executed).toContain(`ALTER TABLE "entity_managers" RENAME TO "delegations"`);
    expect(db.executed.at(-1)).toBe("COMMIT");
  });

  it("backfills share classes in the same transaction", async () => {
    const db = fakeDb(renamed);
    await applyDbRenames(db, () => {});
    expect(db.executed[0]).toBe("BEGIN");
    expect(db.executed.some((s) => s.startsWith(`INSERT INTO "vehicle_classes"`))).toBe(true);
    expect(db.executed.at(-1)).toBe("COMMIT");
  });

  it("backfills again when rows were left without a class", async () => {
    const db = fakeDb(current, undefined, true);
    await applyDbRenames(db, () => {});
    expect(db.executed.some((s) => s.startsWith(`UPDATE "vehicle_members"`))).toBe(true);
  });

  it("does nothing when there is nothing to rename", async () => {
    const db = fakeDb(current);
    await applyDbRenames(db, () => {});
    expect(db.executed).toEqual([]);
  });
});
