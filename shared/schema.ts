import { sql } from "drizzle-orm";
import { pgTable, serial, text, varchar, date, boolean, timestamp, integer, uniqueIndex, numeric } from "drizzle-orm/pg-core";
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
  taxId: varchar("tax_id", { length: 50 }).default(""),
  streetAddress1: varchar("street_address_1", { length: 255 }).default(""),
  streetAddress2: varchar("street_address_2", { length: 255 }).default(""),
  country: varchar("country", { length: 100 }).default(""),
  city: varchar("city", { length: 100 }).default(""),
  stateProvince: varchar("state_province", { length: 100 }).default(""),
  zipPostalCode: varchar("zip_postal_code", { length: 20 }).default(""),
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
  allocationMethod: varchar("allocation_method", { length: 100 }).default("By capital invested"),
  currency: varchar("currency", { length: 10 }).default("USD ($)"),
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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const spvMembers = pgTable("spv_members", {
  id: serial("id").primaryKey(),
  spvId: integer("spv_id").notNull().references(() => spvs.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("spv_member_unique").on(table.spvId, table.accountId),
]);

export const insertAccountSchema = createInsertSchema(accounts).omit({
  id: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  password: z.string().min(1),
  roles: z.array(z.string()).optional(),
});

export const updateAccountSchema = createInsertSchema(accounts).omit({
  id: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true,
}).partial().extend({
  roles: z.array(z.string()).optional(),
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
});

export const updateSpvSchema = createInsertSchema(spvs).omit({
  id: true,
  organizationId: true,
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
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type UpdateAccount = z.infer<typeof updateAccountSchema>;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type UpdateOrganization = z.infer<typeof updateOrganizationSchema>;
export type InsertSpv = z.infer<typeof insertSpvSchema>;
export type UpdateSpv = z.infer<typeof updateSpvSchema>;
