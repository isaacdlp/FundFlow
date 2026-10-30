/**
 * Database object renames that `drizzle-kit push` can't do on its own without
 * interactive "create or rename?" prompts (and dropping data on a wrong
 * answer). Runs before every `npm run db:push` (see `script/db-renames.ts`)
 * and is idempotent: it only renames what still has the old name and whose new
 * name is free, so on an up-to-date database it plans nothing.
 *
 * Current renames: SPV → Vehicle. The `spvs`, `spv_members`, `spv_assets` and
 * `spv_asset_valuations` tables, their `spv_id` columns, and every constraint,
 * index and sequence named after them become `vehicle…`. And
 * `entity_managers` → `delegations` (see `planEntityDelegationsMerge`).
 *
 * Also one data backfill drizzle-kit can't do: every Vehicle gets a default
 * share class holding its positions and assets (see `planVehicleClassesBackfill`).
 */

import { DEFAULT_CLASS_NAME } from "@shared/vehicle-classes";

export interface CatalogSnapshot {
  tables: string[];
  columns: { table: string; column: string }[];
  constraints: { table: string; name: string }[];
  indexes: string[];
  sequences: string[];
}

export interface RenamePlan {
  statements: string[];
  /** Objects left alone because both the old and the new name exist. */
  conflicts: string[];
}

const OLD = /spv/;
export const renameIdentifier = (name: string) => name.replace(/spv/g, "vehicle");

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

export function planDbRenames(c: CatalogSnapshot): RenamePlan {
  const statements: string[] = [];
  const conflicts: string[] = [];
  const tables = new Set(c.tables);
  const tableAfter = (t: string) => (OLD.test(t) && !tables.has(renameIdentifier(t)) ? renameIdentifier(t) : t);

  for (const t of c.tables) {
    if (!OLD.test(t)) continue;
    const to = renameIdentifier(t);
    if (tables.has(to)) conflicts.push(`table ${t} (${to} already exists)`);
    else statements.push(`ALTER TABLE ${q(t)} RENAME TO ${q(to)}`);
  }

  const columns = new Set(c.columns.map((x) => `${x.table}.${x.column}`));
  for (const { table, column } of c.columns) {
    if (!OLD.test(column)) continue;
    const to = renameIdentifier(column);
    if (columns.has(`${table}.${to}`)) conflicts.push(`column ${table}.${column} (${to} already exists)`);
    else statements.push(`ALTER TABLE ${q(tableAfter(table))} RENAME COLUMN ${q(column)} TO ${q(to)}`);
  }

  // Renaming a primary key / unique constraint renames its backing index too,
  // so those indexes are skipped below.
  const relationNames = new Set([...c.constraints.map((x) => x.name), ...c.indexes, ...c.sequences, ...c.tables]);
  const constraintNames = new Set(c.constraints.map((x) => x.name));
  for (const { table, name } of c.constraints) {
    if (!OLD.test(name)) continue;
    const to = renameIdentifier(name);
    if (relationNames.has(to)) conflicts.push(`constraint ${name} (${to} already exists)`);
    else statements.push(`ALTER TABLE ${q(tableAfter(table))} RENAME CONSTRAINT ${q(name)} TO ${q(to)}`);
  }
  for (const name of c.indexes) {
    if (!OLD.test(name) || constraintNames.has(name)) continue;
    const to = renameIdentifier(name);
    if (relationNames.has(to)) conflicts.push(`index ${name} (${to} already exists)`);
    else statements.push(`ALTER INDEX ${q(name)} RENAME TO ${q(to)}`);
  }
  for (const name of c.sequences) {
    if (!OLD.test(name)) continue;
    const to = renameIdentifier(name);
    if (relationNames.has(to)) conflicts.push(`sequence ${name} (${to} already exists)`);
    else statements.push(`ALTER SEQUENCE ${q(name)} RENAME TO ${q(to)}`);
  }

  return { statements, conflicts };
}

interface Queryable {
  query(sql: string): Promise<{ rows: any[] }>;
}

export async function readCatalog(db: Queryable): Promise<CatalogSnapshot> {
  const rows = async (sql: string) => (await db.query(sql)).rows;
  return {
    tables: (await rows(`SELECT tablename AS n FROM pg_tables WHERE schemaname = 'public'`)).map((r) => r.n),
    columns: (await rows(`SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = 'public'`))
      .map((r) => ({ table: r.t, column: r.c })),
    constraints: (await rows(`SELECT cl.relname AS t, co.conname AS n FROM pg_constraint co
      JOIN pg_class cl ON cl.oid = co.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace WHERE ns.nspname = 'public'`))
      .map((r) => ({ table: r.t, name: r.n })),
    indexes: (await rows(`SELECT indexname AS n FROM pg_indexes WHERE schemaname = 'public'`)).map((r) => r.n),
    sequences: (await rows(`SELECT sequencename AS n FROM pg_sequences WHERE schemaname = 'public'`)).map((r) => r.n),
  };
}

/**
 * Entity managers became manager-level entity delegations: `entity_managers`
 * turns into `delegations` in place (its rows keep their ids), gaining the
 * columns account delegations need. drizzle-kit then adds the remaining
 * constraints. Only when `delegations` doesn't exist yet — otherwise the rows
 * would have to be merged by hand.
 */
export function planEntityDelegationsMerge(c: CatalogSnapshot): RenamePlan {
  if (!c.tables.includes("entity_managers")) return { statements: [], conflicts: [] };
  if (c.tables.includes("delegations")) {
    return { statements: [], conflicts: ["table entity_managers (delegations already exists — move its rows into delegations as manager-level entity delegations)"] };
  }
  const t = q("delegations");
  const statements = [
    `ALTER TABLE ${q("entity_managers")} RENAME TO ${t}`,
    `ALTER TABLE ${t} RENAME COLUMN ${q("entity_id")} TO ${q("principal_entity_id")}`,
    `ALTER TABLE ${t} RENAME COLUMN ${q("account_id")} TO ${q("delegate_account_id")}`,
    `ALTER TABLE ${t} ADD COLUMN ${q("principal_account_id")} integer`,
    // Every existing row is a manager; new rows always state their level.
    `ALTER TABLE ${t} ADD COLUMN ${q("level")} varchar(20) NOT NULL DEFAULT 'manager'`,
    `ALTER TABLE ${t} ALTER COLUMN ${q("level")} DROP DEFAULT`,
    `ALTER TABLE ${t} ADD COLUMN ${q("notes")} text DEFAULT ''`,
    `ALTER TABLE ${t} ADD COLUMN ${q("updated_at")} timestamp DEFAULT now()`,
  ];
  const constraints = new Set(c.constraints.filter((x) => x.table === "entity_managers").map((x) => x.name));
  const renameConstraint = (from: string, to: string) => {
    if (constraints.has(from)) statements.push(`ALTER TABLE ${t} RENAME CONSTRAINT ${q(from)} TO ${q(to)}`);
  };
  renameConstraint("entity_managers_pkey", "delegations_pkey");
  renameConstraint("entity_managers_entity_id_entities_id_fk", "delegations_principal_entity_id_entities_id_fk");
  renameConstraint("entity_managers_account_id_accounts_id_fk", "delegations_delegate_account_id_accounts_id_fk");
  if (c.indexes.includes("entity_manager_unique")) {
    statements.push(`ALTER INDEX ${q("entity_manager_unique")} RENAME TO ${q("delegations_entity_unique")}`);
  }
  if (c.sequences.includes("entity_managers_id_seq")) {
    statements.push(`ALTER SEQUENCE ${q("entity_managers_id_seq")} RENAME TO ${q("delegations_id_seq")}`);
  }
  return { statements, conflicts: [] };
}

/**
 * Every Vehicle has share classes and every position and asset belongs to one
 * (`class_id NOT NULL`), which drizzle-kit can't add to existing rows. So:
 * create `vehicle_classes` and the nullable `class_id` columns, give each
 * Vehicle without a class a default one, and put its positions and assets in
 * it; drizzle-kit then adds NOT NULL and the constraints. Planned while that
 * structure is missing or some data is still unclassed (`unclassedRows`, e.g.
 * a Vehicle the previous release created after this ran).
 */
export function planVehicleClassesBackfill(c: CatalogSnapshot, unclassedRows: boolean): RenamePlan {
  const tables = new Set(c.tables);
  const has = (t: string) => tables.has(t) || tables.has(t.replace(/vehicle/g, "spv"));
  if (!has("vehicles") || !has("vehicle_members") || !has("vehicle_assets")) return { statements: [], conflicts: [] };
  const hasColumn = (table: string, column: string) => c.columns.some((x) => x.table === table && x.column === column);
  const structureReady = tables.has("vehicle_classes") && hasColumn("vehicle_members", "class_id") && hasColumn("vehicle_assets", "class_id");
  if (structureReady && !unclassedRows) return { statements: [], conflicts: [] };
  const classes = q("vehicle_classes");
  const firstClass = (alias: string) => `(SELECT min(c.${q("id")}) FROM ${classes} c WHERE c.${q("vehicle_id")} = ${alias}.${q("vehicle_id")})`;
  const statements = [
    `CREATE TABLE IF NOT EXISTS ${classes} (${q("id")} serial PRIMARY KEY, ${q("vehicle_id")} integer NOT NULL, ` +
      `${q("name")} varchar(100) NOT NULL, ${q("notes")} text DEFAULT '', ${q("created_at")} timestamp DEFAULT now(), ` +
      `CONSTRAINT ${q("vehicle_classes_vehicle_id_vehicles_id_fk")} FOREIGN KEY (${q("vehicle_id")}) REFERENCES ${q("vehicles")}(${q("id")}) ON DELETE cascade)`,
    `ALTER TABLE ${q("vehicle_members")} ADD COLUMN IF NOT EXISTS ${q("class_id")} integer`,
    `ALTER TABLE ${q("vehicle_assets")} ADD COLUMN IF NOT EXISTS ${q("class_id")} integer`,
    `INSERT INTO ${classes} (${q("vehicle_id")}, ${q("name")}) SELECT v.${q("id")}, '${DEFAULT_CLASS_NAME}' FROM ${q("vehicles")} v ` +
      `WHERE NOT EXISTS (SELECT 1 FROM ${classes} c WHERE c.${q("vehicle_id")} = v.${q("id")})`,
    `UPDATE ${q("vehicle_members")} m SET ${q("class_id")} = ${firstClass("m")} WHERE m.${q("class_id")} IS NULL`,
    `UPDATE ${q("vehicle_assets")} a SET ${q("class_id")} = ${firstClass("a")} WHERE a.${q("class_id")} IS NULL`,
    // The constraints too: drizzle-kit would stop to offer truncating the (now
    // non-empty) tables before adding them.
    `ALTER TABLE ${q("vehicle_members")} ALTER COLUMN ${q("class_id")} SET NOT NULL`,
    `ALTER TABLE ${q("vehicle_assets")} ALTER COLUMN ${q("class_id")} SET NOT NULL`,
  ];
  const constraints = new Set(c.constraints.map((x) => x.name));
  const addConstraint = (table: string, name: string, definition: string) => {
    if (!constraints.has(name)) statements.push(`ALTER TABLE ${q(table)} ADD CONSTRAINT ${q(name)} ${definition}`);
  };
  addConstraint("vehicle_classes", "vehicle_classes_vehicle_name_unique", `UNIQUE (${q("vehicle_id")}, ${q("name")})`);
  for (const table of ["vehicle_members", "vehicle_assets"]) {
    addConstraint(table, `${table}_class_id_vehicle_classes_id_fk`,
      `FOREIGN KEY (${q("class_id")}) REFERENCES ${classes}(${q("id")}) ON DELETE no action ON UPDATE no action`);
  }
  // One default asset per class instead of per Vehicle.
  statements.push(
    `DROP INDEX IF EXISTS ${q("vehicle_default_asset_unique")}`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ${q("vehicle_class_default_asset_unique")} ON ${q("vehicle_assets")} (${q("class_id")}) WHERE is_default = true`,
  );
  return { statements, conflicts: [] };
}

/** True when some Vehicle has no class, or some position or asset no class_id. */
async function hasUnclassedRows(db: Queryable, c: CatalogSnapshot): Promise<boolean> {
  if (!c.tables.includes("vehicle_classes")) return false;
  const nullable = ["vehicle_members", "vehicle_assets"].filter((t) => c.columns.some((x) => x.table === t && x.column === "class_id"));
  const checks = [
    `EXISTS (SELECT 1 FROM ${q("vehicles")} v WHERE NOT EXISTS (SELECT 1 FROM ${q("vehicle_classes")} c WHERE c.${q("vehicle_id")} = v.${q("id")}))`,
    ...nullable.map((t) => `EXISTS (SELECT 1 FROM ${q(t)} WHERE ${q("class_id")} IS NULL)`),
  ];
  const { rows } = await db.query(`SELECT (${checks.join(" OR ")}) AS pending`);
  return rows[0]?.pending === true;
}

/** Plans and applies the renames in one transaction. */
export async function applyDbRenames(db: Queryable, log: (msg: string) => void = console.log): Promise<RenamePlan> {
  const catalog = await readCatalog(db);
  const plans = [
    planDbRenames(catalog),
    planEntityDelegationsMerge(catalog),
    planVehicleClassesBackfill(catalog, await hasUnclassedRows(db, catalog)),
  ];
  const plan = { statements: plans.flatMap((p) => p.statements), conflicts: plans.flatMap((p) => p.conflicts) };
  for (const c of plan.conflicts) log(`db-renames: skipped ${c} — resolve by hand`);
  if (plan.statements.length === 0) return plan;
  await db.query("BEGIN");
  try {
    for (const s of plan.statements) {
      log(`db-renames: ${s}`);
      await db.query(s);
    }
    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
  return plan;
}
