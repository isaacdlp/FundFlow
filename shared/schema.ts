import { sql } from "drizzle-orm";
import { pgTable, serial, text, varchar, date, boolean, timestamp, integer, uniqueIndex, numeric, check, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  description: text("description").default(""),
});

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  middleName: varchar("middle_name", { length: 100 }).default(""),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 50 }).default(""),
  birthdate: date("birthdate"),
  // Country of citizenship (a name from the client's country list), e.g. for contracts.
  nationality: varchar("nationality", { length: 100 }).default(""),
  taxId: varchar("tax_id", { length: 50 }).default(""),
  streetAddress1: varchar("street_address_1", { length: 255 }).default(""),
  streetAddress2: varchar("street_address_2", { length: 255 }).default(""),
  country: varchar("country", { length: 100 }).default(""),
  city: varchar("city", { length: 100 }).default(""),
  stateProvince: varchar("state_province", { length: 100 }).default(""),
  zipPostalCode: varchar("zip_postal_code", { length: 20 }).default(""),
  // Optional postal address, when it differs from the residential one above (empty = same).
  mailingStreetAddress1: varchar("mailing_street_address_1", { length: 255 }).default(""),
  mailingStreetAddress2: varchar("mailing_street_address_2", { length: 255 }).default(""),
  mailingCountry: varchar("mailing_country", { length: 100 }).default(""),
  mailingCity: varchar("mailing_city", { length: 100 }).default(""),
  mailingStateProvince: varchar("mailing_state_province", { length: 100 }).default(""),
  mailingZipPostalCode: varchar("mailing_zip_postal_code", { length: 20 }).default(""),
  language: varchar("language", { length: 10 }).default("en").notNull(),
  profileComplete: boolean("profile_complete").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const accountRoles = pgTable("account_roles", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  roleId: integer("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
}, (table) => [
  uniqueIndex("account_roles_unique").on(table.accountId, table.roleId),
]);

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description").default(""),
  website: varchar("website", { length: 255 }).default(""),
  logoUrl: varchar("logo_url", { length: 500 }).default(""),
  country: varchar("country", { length: 100 }).default(""),
  city: varchar("city", { length: 100 }).default(""),
  stateProvince: varchar("state_province", { length: 100 }).default(""),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const organizationOrganizers = pgTable("organization_organizers", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("org_organizer_unique").on(table.organizationId, table.accountId),
]);

export const organizationMembers = pgTable("organization_members", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  inviteId: integer("invite_id"),
  // The member's default terms in this organization, as percentages: applied
  // to their new investments unless the investment states its own (see
  // shared/fees.ts). Null = no default.
  managementFeePercent: numeric("management_fee_percent", { precision: 5, scale: 2 }),
  successFeePercent: numeric("success_fee_percent", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("org_member_unique").on(table.organizationId, table.accountId),
]);

export const organizationInvites = pgTable("organization_invites", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 64 }).notNull().unique(),
  used: boolean("used").default(false),
  usedByAccountId: integer("used_by_account_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  legalName: varchar("legal_name", { length: 500 }).notNull(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).default("LLC"),
  stateOfIncorporation: varchar("state_of_incorporation", { length: 100 }).default(""),
  ein: varchar("ein", { length: 20 }).default(""),
  dateEstablished: date("date_established"),
  dateEnded: date("date_ended"),
  allocationMethod: varchar("allocation_method", { length: 100 }).default("By Commitment"),
  // ISO 4217 currency code (e.g. "USD", "EUR"). Set once at Vehicle creation and
  // never changed afterward — every investment into the Vehicle is denominated
  // in this currency. See updateVehicleSchema, which omits this field. Column
  // width is kept generous (rather than shrunk to 3) so existing legacy
  // values (e.g. "USD ($)") don't fail a width-reducing migration; they're
  // normalized to ISO codes in code (see server/currency.ts) instead.
  currency: varchar("currency", { length: 10 }).notNull().default("USD"),
  managementFeePercent: numeric("management_fee_percent", { precision: 5, scale: 2 }).default("0"),
  carriedInterestPercent: numeric("carried_interest_percent", { precision: 5, scale: 2 }).default("0"),
  preferredReturnPercent: numeric("preferred_return_percent", { precision: 5, scale: 2 }).default("0"),
  country: varchar("country", { length: 100 }).default(""),
  streetAddress: varchar("street_address", { length: 255 }).default(""),
  streetAddress2: varchar("street_address_2", { length: 255 }).default(""),
  city: varchar("city", { length: 100 }).default(""),
  stateProvince: varchar("state_province", { length: 100 }).default(""),
  zipPostalCode: varchar("zip_postal_code", { length: 20 }).default(""),
  county: varchar("county", { length: 100 }).default(""),
  managerId: integer("manager_id").references(() => accounts.id),
  signatoryId: integer("signatory_id").references(() => accounts.id),
  bankName: varchar("bank_name", { length: 255 }).default(""),
  bankAddress: text("bank_address").default(""),
  bankRoutingNumber: varchar("bank_routing_number", { length: 50 }).default(""),
  bankSwiftCode: varchar("bank_swift_code", { length: 20 }).default(""),
  bankAccountNumber: varchar("bank_account_number", { length: 50 }).default(""),
  bankAccountName: varchar("bank_account_name", { length: 255 }).default(""),
  forFurtherCreditTo: varchar("for_further_credit_to", { length: 255 }).default(""),
  wiringInstructions: text("wiring_instructions").default(""),
  investmentCompanyName: varchar("investment_company_name", { length: 255 }).default(""),
  investmentType: varchar("investment_type", { length: 100 }).default(""),
  totalBeingRaised: numeric("total_being_raised", { precision: 15, scale: 2 }).default("0"),
  minimumInvestment: numeric("minimum_investment", { precision: 15, scale: 2 }).default("0"),
  expectedClosingDate: date("expected_closing_date"),
  autoDeploy: boolean("auto_deploy").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const entities = pgTable("entities", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull().default("LLC"),
  dateEstablished: date("date_established"),
  currency: varchar("currency", { length: 20 }).default("USD ($)"),
  taxId: varchar("tax_id", { length: 50 }).default(""),
  ownershipAllocation: varchar("ownership_allocation", { length: 20 }).default("percent"),
  country: varchar("country", { length: 100 }).default(""),
  streetAddress: varchar("street_address", { length: 255 }).default(""),
  streetAddress2: varchar("street_address_2", { length: 255 }).default(""),
  city: varchar("city", { length: 100 }).default(""),
  stateProvince: varchar("state_province", { length: 100 }).default(""),
  zipPostalCode: varchar("zip_postal_code", { length: 20 }).default(""),
  disbursementMethod: varchar("disbursement_method", { length: 20 }).default("wire_transfer"),
  bankName: varchar("bank_name", { length: 255 }).default(""),
  bankAddress: text("bank_address").default(""),
  bankRoutingNumber: varchar("bank_routing_number", { length: 50 }).default(""),
  bankSwiftCode: varchar("bank_swift_code", { length: 20 }).default(""),
  bankAccountNumber: varchar("bank_account_number", { length: 50 }).default(""),
  bankAccountName: varchar("bank_account_name", { length: 255 }).default(""),
  forFurtherCreditTo: varchar("for_further_credit_to", { length: 255 }).default(""),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const entityOwners = pgTable("entity_owners", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  ownerType: varchar("owner_type", { length: 20 }).notNull().default("account"),
  ownerAccountId: integer("owner_account_id").references(() => accounts.id, { onDelete: "cascade" }),
  ownerEntityId: integer("owner_entity_id").references(() => entities.id, { onDelete: "cascade" }),
  ownershipPercent: numeric("ownership_percent", { precision: 7, scale: 4 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Who introduced whom. Exactly one of introducedAccountId / introducedEntityId
// is set. Rows with `viaAccountId` are inherited entity introductions: the
// introducer introduced that managing account, so its entities count too.
// They are kept in sync by the server and can't be edited directly.
export const introductions = pgTable("introductions", {
  id: serial("id").primaryKey(),
  introducerAccountId: integer("introducer_account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  introducedAccountId: integer("introduced_account_id").references(() => accounts.id, { onDelete: "cascade" }),
  introducedEntityId: integer("introduced_entity_id").references(() => entities.id, { onDelete: "cascade" }),
  viaAccountId: integer("via_account_id").references(() => accounts.id, { onDelete: "cascade" }),
  date: date("date"),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("introductions_account_unique").on(table.introducerAccountId, table.introducedAccountId),
  uniqueIndex("introductions_entity_unique").on(table.introducerAccountId, table.introducedEntityId),
  check("introductions_one_target", sql`(${table.introducedAccountId} IS NULL) <> (${table.introducedEntityId} IS NULL)`),
]);

// How much of the principal's data a delegate gets: an observer reads it, a
// manager may also change what the principal could change themselves.
export const DELEGATION_LEVELS = ["observer", "manager"] as const;
export type DelegationLevel = typeof DELEGATION_LEVELS[number];

// The principal — an account or an entity, exactly one — lets the delegate
// account (an attorney, family member, accountant…) act on its behalf. Only
// accounts can be delegates. Not transitive: a delegate of a delegate gets
// nothing. At most one row per principal → delegate. Entities can't act by
// themselves, so each keeps at least one manager-level delegation (enforced
// by the API). These rows used to be `entity_managers` (see db-renames).
export const delegations = pgTable("delegations", {
  id: serial("id").primaryKey(),
  principalAccountId: integer("principal_account_id").references(() => accounts.id, { onDelete: "cascade" }),
  principalEntityId: integer("principal_entity_id").references(() => entities.id, { onDelete: "cascade" }),
  delegateAccountId: integer("delegate_account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  level: varchar("level", { length: 20 }).notNull(),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("delegations_account_unique").on(table.principalAccountId, table.delegateAccountId),
  uniqueIndex("delegations_entity_unique").on(table.principalEntityId, table.delegateAccountId),
  check("delegations_one_principal", sql`(${table.principalAccountId} IS NULL) <> (${table.principalEntityId} IS NULL)`),
  check("delegations_not_self", sql`${table.principalAccountId} <> ${table.delegateAccountId}`),
]);

// Personal ties between two accounts, read as "<from> is the <description> of
// <to>" (e.g. "wife", "brother", "ex-husband"). Informational only — they
// grant no access.
export const relationships = pgTable("relationships", {
  id: serial("id").primaryKey(),
  fromAccountId: integer("from_account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  toAccountId: integer("to_account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  description: varchar("description", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("relationships_unique").on(table.fromAccountId, table.toAccountId),
  check("relationships_not_self", sql`${table.fromAccountId} <> ${table.toAccountId}`),
]);

// Vetted introducers under contract who earn commissions on what the
// accounts/entities they introduced pay us. One row per account. They start
// inactive and can only be active once a promoter agreement is signed.
export const promoters = pgTable("promoters", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().unique().references(() => accounts.id, { onDelete: "cascade" }),
  active: boolean("active").default(false).notNull(),
  contractDate: date("contract_date"),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const INCENTIVE_TYPES = ["management_fee", "success_fee"] as const;
export type IncentiveType = typeof INCENTIVE_TYPES[number];

// What a promoter earns: `percent` of the fee of `type` that their
// introductions pay us. At most one incentive per type and promoter.
export const promoterIncentives = pgTable("promoter_incentives", {
  id: serial("id").primaryKey(),
  promoterId: integer("promoter_id").notNull().references(() => promoters.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(),
  percent: numeric("percent", { precision: 5, scale: 2 }).notNull(),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("promoter_incentive_type_unique").on(table.promoterId, table.type),
  check("promoter_incentive_percent_range", sql`${table.percent} > 0 AND ${table.percent} <= 100`),
]);

// What a contract is for. Each kind links to its subject through its own
// nullable column (promoterId for now; investments, tax forms… later).
export const CONTRACT_KINDS = ["promoter_agreement"] as const;
export type ContractKind = typeof CONTRACT_KINDS[number];

// Contracts sent for e-signature through ConcordNow. `status` caches Concord's
// summary status (DRAFT, SIGNING, SIGNED, BROKEN…) as of `statusCheckedAt`.
// Once signed, Concord may move the document to a new uid; `concordUid`
// follows it.
export const contracts = pgTable("contracts", {
  id: serial("id").primaryKey(),
  kind: varchar("kind", { length: 50 }).notNull(),
  concordUid: varchar("concord_uid", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("SIGNING"),
  signers: text("signers").array().notNull().default(sql`'{}'::text[]`),
  promoterId: integer("promoter_id").references(() => promoters.id, { onDelete: "cascade" }),
  createdByAccountId: integer("created_by_account_id").references(() => accounts.id, { onDelete: "set null" }),
  statusCheckedAt: timestamp("status_checked_at"),
  signedAt: timestamp("signed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Share classes split a Vehicle into "sub-vehicles": each class has its own
// investors (vehicle_members) and assets (vehicle_assets), and so its own cash,
// value and ownership pool. Every Vehicle has at least one class (created with
// it), and every member and asset belongs to one; the UI only shows classes
// once a Vehicle has several. That a member's or asset's class is one of its
// own Vehicle's is checked by the API (resolveClassId).
export const vehicleClasses = pgTable("vehicle_classes", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("vehicle_classes_vehicle_name_unique").on(table.vehicleId, table.name),
]);

export const vehicleMembers = pgTable("vehicle_members", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
  classId: integer("class_id").notNull().references(() => vehicleClasses.id),
  accountId: integer("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  entityId: integer("entity_id").references(() => entities.id, { onDelete: "cascade" }),
  committed: numeric("committed", { precision: 15, scale: 2 }).default("0"),
  managementFee: numeric("management_fee", { precision: 15, scale: 2 }).default("0"),
  otherFee: numeric("other_fee", { precision: 15, scale: 2 }).default("0"),
  carry: numeric("carry", { precision: 5, scale: 2 }).default("0"),
  totalCalled: numeric("total_called", { precision: 15, scale: 2 }).default("0"),
  distributed: numeric("distributed", { precision: 15, scale: 2 }).default("0"),
  ownershipPercent: numeric("ownership_percent", { precision: 7, scale: 4 }),
  date: date("date"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  check("vehicle_member_investor_xor", sql`(account_id IS NOT NULL)::int + (entity_id IS NOT NULL)::int = 1`),
]);

export const vehicleAssets = pgTable("vehicle_assets", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
  classId: integer("class_id").notNull().references(() => vehicleClasses.id),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  instrumentType: varchar("instrument_type", { length: 100 }).notNull().default("Equity"),
  purchaseDate: date("purchase_date"),
  cost: numeric("cost", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes").default(""),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // One default asset (the AutoDeploy target) per class.
  uniqueIndex("vehicle_class_default_asset_unique").on(table.classId).where(sql`is_default = true`),
]);

export const vehicleAssetValuations = pgTable("vehicle_asset_valuations", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull().references(() => vehicleAssets.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  value: numeric("value", { precision: 15, scale: 2 }).notNull().default("0"),
  note: text("note").default(""),
  createdAt: timestamp("created_at").defaultNow(),
});

// Token lifetimes: "forgot password" links are short-lived; account-setup links
// (sent when an admin creates a user without a password) last a week.
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
export const ACCOUNT_SETUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  folderPath: varchar("folder_path", { length: 1000 }).notNull().default(""),
  ownerType: varchar("owner_type", { length: 20 }).notNull(),
  accountId: integer("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  entityId: integer("entity_id").references(() => entities.id, { onDelete: "cascade" }),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  storedPath: varchar("stored_path", { length: 1000 }).notNull(),
  mimeType: varchar("mime_type", { length: 200 }).default(""),
  sizeBytes: integer("size_bytes").notNull().default(0),
  uploadedBy: integer("uploaded_by").references(() => accounts.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  check("document_owner_xor", sql`(account_id IS NOT NULL)::int + (entity_id IS NOT NULL)::int = 1`),
]);

export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Catalog of currencies the platform knows about. `active` currencies are
// the ones selectable when creating a Vehicle and offered in the dashboard's
// "view in" dropdown. USD is the pivot currency for exchange rates and can
// never be deactivated (enforced in the route handler).
export const currencies = pgTable("currencies", {
  code: varchar("code", { length: 3 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  symbol: varchar("symbol", { length: 10 }).notNull().default(""),
  active: boolean("active").default(false).notNull(),
});

// Latest known exchange rate for each non-USD currency, expressed as "how
// many USD is 1 unit of this currency worth". Only the latest rate is kept
// (no history) and it's refreshed at most once a day — see server/currency.ts.
export const exchangeRates = pgTable("exchange_rates", {
  currency: varchar("currency", { length: 3 }).primaryKey(),
  rateToUsd: numeric("rate_to_usd", { precision: 18, scale: 8 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const apiTokens = pgTable("api_tokens", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  prefix: varchar("prefix", { length: 16 }).notNull(),
  tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const createApiTokenSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  expiresInDays: z.number().int().positive().max(3650).optional(),
});

// Forms send "" for a blank date input; Postgres rejects "" for a date column,
// so store it as null.
const optionalDate = z.preprocess(
  (v) => (v === "" ? null : v),
  z.string().nullable().optional(),
);

export const insertAccountSchema = createInsertSchema(accounts).omit({
  id: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // Optional: when omitted the account gets an unusable password and the user
  // sets their own via an account-setup link (see POST /api/accounts).
  password: z.string().min(1).optional(),
  roles: z.array(z.string()).optional(),
  language: z.enum(["en", "es", "fr"]).optional().default("en"),
  birthdate: optionalDate,
});

export const updateAccountSchema = createInsertSchema(accounts).omit({
  id: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true,
}).partial().extend({
  roles: z.array(z.string()).optional(),
  language: z.enum(["en", "es", "fr"]).optional(),
  birthdate: optionalDate,
});

export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
});

export const updateOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
}).partial();

export const insertVehicleSchema = createInsertSchema(vehicles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  dateEstablished: z.string().min(1, "Date established is required"),
  currency: z.string().trim().toUpperCase().length(3, "Currency must be a 3-letter code").optional(),
});

// `currency` is intentionally omitted here (not just made optional): it is
// fixed at Vehicle creation time and can never change afterward, since every
// investment into the Vehicle is denominated in it. Any `currency` sent in a
// PATCH body is silently ignored, same as `roles` on non-admin account
// updates.
export const updateVehicleSchema = createInsertSchema(vehicles).omit({
  id: true,
  organizationId: true,
  currency: true,
  createdAt: true,
  updatedAt: true,
}).partial();

export const insertVehicleClassSchema = z.object({
  name: z.string().trim().min(1, "Class name is required").max(100),
  notes: z.string().optional(),
});

export const updateVehicleClassSchema = insertVehicleClassSchema.partial();

export const insertEntitySchema = createInsertSchema(entities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// A fee percentage as stored (numeric(5,2)): accepts 5 or "5"; null clears it.
const feePercent = z.union([z.number(), z.string().regex(/^\s*\d+(\.\d+)?\s*$/, "must be a number")])
  .transform(v => Number(v))
  .refine(n => n >= 0 && n <= 100, "must be between 0 and 100")
  .transform(n => n.toFixed(2))
  .nullable()
  .optional();

// What organizers change on a membership: its status and/or the member's
// default fees in the organization.
export const updateMemberSchema = z.object({
  status: z.enum(["approved", "rejected"]).optional(),
  managementFeePercent: feePercent,
  successFeePercent: feePercent,
}).refine(d => d.status !== undefined || d.managementFeePercent !== undefined || d.successFeePercent !== undefined, {
  message: "Provide status, managementFeePercent and/or successFeePercent",
});

// An entity can't act by itself: it's created with at least one manager.
export const createEntitySchema = insertEntitySchema.extend({
  managerAccountIds: z.array(z.number().int().positive())
    .min(1, "An entity needs at least one manager")
    .transform(ids => Array.from(new Set(ids))),
});

export const updateEntitySchema = createInsertSchema(entities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).partial();

export type Role = typeof roles.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type AccountRole = typeof accountRoles.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type OrganizationOrganizer = typeof organizationOrganizers.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type OrganizationInvite = typeof organizationInvites.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type VehicleClass = typeof vehicleClasses.$inferSelect;
export type VehicleMember = typeof vehicleMembers.$inferSelect;
export type VehicleAsset = typeof vehicleAssets.$inferSelect;
export type VehicleAssetValuation = typeof vehicleAssetValuations.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type UpdateAccount = z.infer<typeof updateAccountSchema>;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type UpdateOrganization = z.infer<typeof updateOrganizationSchema>;
export type Entity = typeof entities.$inferSelect;
export type EntityOwner = typeof entityOwners.$inferSelect;
export type Introduction = typeof introductions.$inferSelect;
export type Delegation = typeof delegations.$inferSelect;
export type Relationship = typeof relationships.$inferSelect;
export type Promoter = typeof promoters.$inferSelect;
export type PromoterIncentive = typeof promoterIncentives.$inferSelect;
export type Contract = typeof contracts.$inferSelect;
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type UpdateVehicle = z.infer<typeof updateVehicleSchema>;
export type InsertEntity = z.infer<typeof insertEntitySchema>;
export type UpdateEntity = z.infer<typeof updateEntitySchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;
export type PublicApiToken = Omit<ApiToken, "tokenHash">;
export type Document = typeof documents.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type Currency = typeof currencies.$inferSelect;
export type ExchangeRate = typeof exchangeRates.$inferSelect;

export const updateCurrencySchema = z.object({
  active: z.boolean(),
});
export type UpdateCurrencyInput = z.infer<typeof updateCurrencySchema>;

export const createDocumentSchema = z.object({
  name: z.string().min(1).max(255),
  folderPath: z.string().max(1000).default(""),
  ownerType: z.enum(["account", "entity"]),
  accountId: z.number().int().positive().nullable().optional(),
  entityId: z.number().int().positive().nullable().optional(),
}).refine(d => (d.ownerType === "account" ? !!d.accountId : !!d.entityId), {
  message: "accountId required when ownerType=account; entityId required when ownerType=entity",
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

const introductionDetails = {
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD").nullable().optional(),
  notes: z.string().max(2000).optional(),
};

export const createIntroductionSchema = z.object({
  introducerAccountId: z.number().int().positive(),
  introducedAccountId: z.number().int().positive().optional(),
  introducedEntityId: z.number().int().positive().optional(),
  ...introductionDetails,
}).refine(d => (d.introducedAccountId === undefined) !== (d.introducedEntityId === undefined), {
  message: "Exactly one of introducedAccountId or introducedEntityId is required",
});

export const updateIntroductionSchema = z.object(introductionDetails);

export type CreateIntroductionInput = z.infer<typeof createIntroductionSchema>;
export type UpdateIntroductionInput = z.infer<typeof updateIntroductionSchema>;

const delegationDetails = {
  level: z.enum(DELEGATION_LEVELS),
  notes: z.string().max(2000).optional(),
};

export const createDelegationSchema = z.object({
  principalAccountId: z.number().int().positive().optional(),
  principalEntityId: z.number().int().positive().optional(),
  delegateAccountId: z.number().int().positive(),
  ...delegationDetails,
}).refine(d => (d.principalAccountId === undefined) !== (d.principalEntityId === undefined), {
  message: "Exactly one of principalAccountId or principalEntityId is required",
}).refine(d => d.principalAccountId !== d.delegateAccountId, {
  message: "An account can't delegate to itself",
});

export const updateDelegationSchema = z.object(delegationDetails).partial();

export type CreateDelegationInput = z.infer<typeof createDelegationSchema>;
export type UpdateDelegationInput = z.infer<typeof updateDelegationSchema>;

const relationshipDescription = z.string().trim().min(1, "description is required").max(100);

export const createRelationshipSchema = z.object({
  fromAccountId: z.number().int().positive(),
  toAccountId: z.number().int().positive(),
  description: relationshipDescription,
}).refine(d => d.fromAccountId !== d.toAccountId, {
  message: "An account can't have a relationship with itself",
});

export const updateRelationshipSchema = z.object({ description: relationshipDescription });

export type CreateRelationshipInput = z.infer<typeof createRelationshipSchema>;
export type UpdateRelationshipInput = z.infer<typeof updateRelationshipSchema>;

const incentiveDetails = {
  // Accepts 20 or "20"; stored as numeric(5,2).
  percent: z.coerce.number()
    .gt(0, "percent must be greater than 0")
    .max(100, "percent must be at most 100")
    .refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9, "percent allows at most 2 decimals"),
  notes: z.string().max(2000).optional(),
};

export const createIncentiveSchema = z.object({
  type: z.enum(INCENTIVE_TYPES),
  ...incentiveDetails,
});

export const updateIncentiveSchema = z.object(incentiveDetails).partial();

const promoterDetails = {
  contractDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "contractDate must be YYYY-MM-DD").nullable().optional(),
  notes: z.string().max(2000).optional(),
};

// New promoters are always inactive (no `active` here): they become active
// when their promoter agreement is signed.
export const createPromoterSchema = z.object({
  accountId: z.number().int().positive(),
  ...promoterDetails,
  incentives: z.array(createIncentiveSchema).optional()
    .refine(list => !list || new Set(list.map(i => i.type)).size === list.length, {
      message: "Each incentive type can only be given once",
    }),
});

export const updatePromoterSchema = z.object({ ...promoterDetails, active: z.boolean().optional() });

export type CreateIncentiveInput = z.infer<typeof createIncentiveSchema>;
export type UpdateIncentiveInput = z.infer<typeof updateIncentiveSchema>;
export type CreatePromoterInput = z.infer<typeof createPromoterSchema>;
export type UpdatePromoterInput = z.infer<typeof updatePromoterSchema>;

// Sending a promoter agreement. `variables` fill the Concord template's
// placeholders; `signers` fill its signature slots in order.
export const createPromoterContractSchema = z.object({
  title: z.string().trim().min(1).max(255),
  signers: z.array(z.string().trim().email()).min(1).max(10)
    .refine(list => new Set(list.map(e => e.toLowerCase())).size === list.length, {
      message: "Each signer can only be given once",
    }),
  variables: z.record(z.string(), z.string().max(2000)).default({}),
  /** Invitation email subject; defaults to the title. */
  subject: z.string().trim().max(255).optional(),
  message: z.string().max(5000).optional(),
});

export type CreatePromoterContractInput = z.infer<typeof createPromoterContractSchema>;

// Concord settings edited from the Settings page (the API key stays in the env).
// Every field is optional; an empty string clears it.
const optionalUrl = z.string().trim().max(500).refine(v => v === "" || /^https?:\/\/\S+$/.test(v), {
  message: "Must be an http(s) URL",
});
export const updateConcordSettingsSchema = z.object({
  orgId: z.string().trim().max(100).optional(),
  apiUrl: optionalUrl.optional(),
  appUrl: optionalUrl.optional(),
  signerEmail: z.union([z.literal(""), z.string().trim().email()]).optional(),
  promoterTemplateId: z.string().trim().max(100).optional(),
  promoterFolderId: z.string().trim().max(100).optional(),
}).strict();

export type UpdateConcordSettingsInput = z.infer<typeof updateConcordSettingsSchema>;
