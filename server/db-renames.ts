/**
 * Database object renames that `drizzle-kit push` can't do on its own without
 * interactive "create or rename?" prompts (and dropping data on a wrong
 * answer). Runs before every `npm run db:push` (see `script/db-renames.ts`)
 * and is idempotent: it only renames what still has the old name and whose new
 * name is free, so on an up-to-date database it plans nothing.
 *
 * Current renames: SPV → Vehicle. The `spvs`, `spv_members`, `spv_assets` and
 * `spv_asset_valuations` tables, their `spv_id` columns, and every constraint,
 * index and sequence named after them become `vehicle…`.
 */

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

/** Plans and applies the renames in one transaction. */
export async function applyDbRenames(db: Queryable, log: (msg: string) => void = console.log): Promise<RenamePlan> {
  const plan = planDbRenames(await readCatalog(db));
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
