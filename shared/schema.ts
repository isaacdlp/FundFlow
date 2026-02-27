import { sql } from "drizzle-orm";
import { pgTable, serial, text, varchar, date, boolean, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
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
  createdAt: true,
  updatedAt: true,
});

export const updateOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).partial();

export type Role = typeof roles.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type AccountRole = typeof accountRoles.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type OrganizationOrganizer = typeof organizationOrganizers.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type UpdateAccount = z.infer<typeof updateAccountSchema>;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type UpdateOrganization = z.infer<typeof updateOrganizationSchema>;
