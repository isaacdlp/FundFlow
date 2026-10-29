import { describe, it, expect } from "vitest";
import { planDbRenames, applyDbRenames, type CatalogSnapshot } from "../../server/db-renames";

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

describe("applyDbRenames", () => {
  const fakeDb = (catalog: CatalogSnapshot, failOn?: string) => {
    const executed: string[] = [];
    return {
      executed,
      async query(sql: string) {
        if (sql.includes("pg_tables")) return { rows: catalog.tables.map((n) => ({ n })) };
        if (sql.includes("information_schema.columns")) return { rows: catalog.columns.map((c) => ({ t: c.table, c: c.column })) };
        if (sql.includes("pg_constraint")) return { rows: catalog.constraints.map((c) => ({ t: c.table, n: c.name })) };
        if (sql.includes("pg_indexes")) return { rows: catalog.indexes.map((n) => ({ n })) };
        if (sql.includes("pg_sequences")) return { rows: catalog.sequences.map((n) => ({ n })) };
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

  it("does nothing when there is nothing to rename", async () => {
    const db = fakeDb(renamed);
    await applyDbRenames(db, () => {});
    expect(db.executed).toEqual([]);
  });
});
