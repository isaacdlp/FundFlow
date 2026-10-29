import { sql } from "drizzle-orm";
import { pgTable, serial, text, varchar, date, boolean, timestamp, integer, uniqueIndex, numeric, check } from "drizzle-orm/pg-core";
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

export const spvs = pgTable("spvs", {
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
  // ISO 4217 currency code (e.g. "USD", "EUR"). Set once at SPV creation and
  // never changed afterward — every investment into the SPV is denominated
  // in this currency. See updateSpvSchema, which omits this field. Column
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

export const entityManagers = pgTable("entity_managers", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("entity_manager_unique").on(table.entityId, table.accountId),
]);

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

// Vetted introducers under contract who earn commissions on what the
// accounts/entities they introduced pay us. One row per account.
export const promoters = pgTable("promoters", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().unique().references(() => accounts.id, { onDelete: "cascade" }),
  active: boolean("active").default(true).notNull(),
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

export const spvMembers = pgTable("spv_members", {
  id: serial("id").primaryKey(),
  spvId: integer("spv_id").notNull().references(() => spvs.id, { onDelete: "cascade" }),
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
  check("spv_member_investor_xor", sql`(account_id IS NOT NULL)::int + (entity_id IS NOT NULL)::int = 1`),
]);

export const spvAssets = pgTable("spv_assets", {
  id: serial("id").primaryKey(),
  spvId: integer("spv_id").notNull().references(() => spvs.id, { onDelete: "cascade" }),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  instrumentType: varchar("instrument_type", { length: 100 }).notNull().default("Equity"),
  purchaseDate: date("purchase_date"),
  cost: numeric("cost", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes").default(""),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("spv_default_asset_unique").on(table.spvId).where(sql`is_default = true`),
]);

export const spvAssetValuations = pgTable("spv_asset_valuations", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull().references(() => spvAssets.id, { onDelete: "cascade" }),
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
// the ones selectable when creating an SPV and offered in the dashboard's
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
});

export const updateAccountSchema = createInsertSchema(accounts).omit({
  id: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true,
}).partial().extend({
  roles: z.array(z.string()).optional(),
  language: z.enum(["en", "es", "fr"]).optional(),
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

export const insertSpvSchema = createInsertSchema(spvs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  dateEstablished: z.string().min(1, "Date established is required"),
  currency: z.string().trim().toUpperCase().length(3, "Currency must be a 3-letter code").optional(),
});

// `currency` is intentionally omitted here (not just made optional): it is
// fixed at SPV creation time and can never change afterward, since every
// investment into the SPV is denominated in it. Any `currency` sent in a
// PATCH body is silently ignored, same as `roles` on non-admin account
// updates.
export const updateSpvSchema = createInsertSchema(spvs).omit({
  id: true,
  organizationId: true,
  currency: true,
  createdAt: true,
  updatedAt: true,
}).partial();

export const insertEntitySchema = createInsertSchema(entities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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
export type Spv = typeof spvs.$inferSelect;
export type SpvMember = typeof spvMembers.$inferSelect;
export type SpvAsset = typeof spvAssets.$inferSelect;
export type SpvAssetValuation = typeof spvAssetValuations.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type UpdateAccount = z.infer<typeof updateAccountSchema>;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type UpdateOrganization = z.infer<typeof updateOrganizationSchema>;
export type Entity = typeof entities.$inferSelect;
export type EntityOwner = typeof entityOwners.$inferSelect;
export type EntityManager = typeof entityManagers.$inferSelect;
export type Introduction = typeof introductions.$inferSelect;
export type Promoter = typeof promoters.$inferSelect;
export type PromoterIncentive = typeof promoterIncentives.$inferSelect;
export type Contract = typeof contracts.$inferSelect;
export type InsertSpv = z.infer<typeof insertSpvSchema>;
export type UpdateSpv = z.infer<typeof updateSpvSchema>;
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
  active: z.boolean().optional(),
  contractDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "contractDate must be YYYY-MM-DD").nullable().optional(),
  notes: z.string().max(2000).optional(),
};

export const createPromoterSchema = z.object({
  accountId: z.number().int().positive(),
  ...promoterDetails,
  incentives: z.array(createIncentiveSchema).optional()
    .refine(list => !list || new Set(list.map(i => i.type)).size === list.length, {
      message: "Each incentive type can only be given once",
    }),
});

export const updatePromoterSchema = z.object(promoterDetails);

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
