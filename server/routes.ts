import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { insertAccountSchema, updateAccountSchema, insertOrganizationSchema, updateOrganizationSchema } from "@shared/schema";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

function stripPasswordHash(account: any) {
  const { passwordHash, ...rest } = account;
  return rest;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/roles", async (_req, res) => {
    const roles = await storage.getRoles();
    res.json(roles);
  });

  app.get("/api/accounts", async (req, res) => {
    const search = req.query.search as string | undefined;
    const role = req.query.role as string | undefined;
    const accountsList = await storage.getAccounts(search, role);
    res.json(accountsList.map(stripPasswordHash));
  });

  app.get("/api/accounts/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const account = await storage.getAccount(id);
    if (!account) return res.status(404).json({ message: "Account not found" });
    res.json(stripPasswordHash(account));
  });

  app.post("/api/accounts", async (req, res) => {
    try {
      const data = insertAccountSchema.parse(req.body);
      const account = await storage.createAccount(data);
      res.status(201).json(stripPasswordHash(account));
    } catch (e) {
      if (e instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(e).message });
      }
      const err = e as Error;
      if (err.message?.includes("unique") || err.message?.includes("duplicate")) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }
      throw e;
    }
  });

  app.patch("/api/accounts/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    try {
      const data = updateAccountSchema.parse(req.body);
      const account = await storage.updateAccount(id, data);
      if (!account) return res.status(404).json({ message: "Account not found" });
      res.json(stripPasswordHash(account));
    } catch (e) {
      if (e instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(e).message });
      }
      const err = e as Error;
      if (err.message?.includes("unique") || err.message?.includes("duplicate")) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }
      throw e;
    }
  });

  app.delete("/api/accounts/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const deleted = await storage.deleteAccount(id);
    if (!deleted) return res.status(404).json({ message: "Account not found" });
    res.json({ message: "Account deleted" });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    const account = await storage.getAccountByEmail(email);
    if (!account) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const valid = await storage.verifyPassword(account.id, password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    res.json(stripPasswordHash(account));
  });

  app.get("/api/organizations", async (_req, res) => {
    const orgs = await storage.getOrganizations();
    res.json(orgs);
  });

  app.get("/api/organizations/by-slug/:slug", async (req, res) => {
    const org = await storage.getOrganizationBySlug(req.params.slug);
    if (!org) return res.status(404).json({ message: "Organization not found" });
    const { organizers, ...publicData } = org;
    res.json(publicData);
  });

  app.get("/api/organizations/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const org = await storage.getOrganization(id);
    if (!org) return res.status(404).json({ message: "Organization not found" });
    res.json(org);
  });

  app.post("/api/organizations", async (req, res) => {
    try {
      const data = insertOrganizationSchema.parse(req.body);
      const org = await storage.createOrganization(data);
      res.status(201).json(org);
    } catch (e) {
      if (e instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(e).message });
      }
      throw e;
    }
  });

  app.patch("/api/organizations/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    try {
      const data = updateOrganizationSchema.parse(req.body);
      const org = await storage.updateOrganization(id, data);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      res.json(org);
    } catch (e) {
      if (e instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(e).message });
      }
      throw e;
    }
  });

  app.delete("/api/organizations/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const deleted = await storage.deleteOrganization(id);
    if (!deleted) return res.status(404).json({ message: "Organization not found" });
    res.json({ message: "Organization deleted" });
  });

  app.post("/api/organizations/:id/organizers", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const { accountId } = req.body;
    if (!accountId || isNaN(parseInt(accountId))) {
      return res.status(400).json({ message: "Valid accountId is required" });
    }
    const org = await storage.getOrganization(id);
    if (!org) return res.status(404).json({ message: "Organization not found" });
    const account = await storage.getAccount(parseInt(accountId));
    if (!account) return res.status(404).json({ message: "Account not found" });
    await storage.addOrganizer(id, parseInt(accountId));
    const updated = await storage.getOrganization(id);
    res.json(updated);
  });

  app.delete("/api/organizations/:id/organizers/:accountId", async (req, res) => {
    const id = parseInt(req.params.id);
    const accountId = parseInt(req.params.accountId);
    if (isNaN(id) || isNaN(accountId)) return res.status(400).json({ message: "Invalid ID" });
    const removed = await storage.removeOrganizer(id, accountId);
    if (!removed) return res.status(404).json({ message: "Organizer assignment not found" });
    const updated = await storage.getOrganization(id);
    res.json(updated);
  });

  app.get("/api/organizations/:id/members", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const members = await storage.getMembers(id);
    res.json(members);
  });

  app.post("/api/organizations/:id/members/request", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const { accountId } = req.body;
    if (!accountId) return res.status(400).json({ message: "accountId is required" });

    const org = await storage.getOrganization(id);
    if (!org) return res.status(404).json({ message: "Organization not found" });

    const existing = await storage.getMember(id, parseInt(accountId));
    if (existing) {
      return res.json(existing);
    }

    const member = await storage.createMemberRequest(id, parseInt(accountId));
    res.status(201).json(member);
  });

  app.patch("/api/organizations/:id/members/:accountId", async (req, res) => {
    const id = parseInt(req.params.id);
    const accountId = parseInt(req.params.accountId);
    if (isNaN(id) || isNaN(accountId)) return res.status(400).json({ message: "Invalid ID" });
    const { status } = req.body;
    if (!status || !["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Status must be 'approved' or 'rejected'" });
    }
    const member = await storage.updateMemberStatus(id, accountId, status);
    if (!member) return res.status(404).json({ message: "Member not found" });
    res.json(member);
  });

  app.delete("/api/organizations/:id/members/:accountId", async (req, res) => {
    const id = parseInt(req.params.id);
    const accountId = parseInt(req.params.accountId);
    if (isNaN(id) || isNaN(accountId)) return res.status(400).json({ message: "Invalid ID" });
    const removed = await storage.removeMember(id, accountId);
    if (!removed) return res.status(404).json({ message: "Member not found" });
    res.json({ message: "Member removed" });
  });

  app.get("/api/organizations/:id/invites", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const invites = await storage.getInvites(id);
    res.json(invites);
  });

  app.post("/api/organizations/:id/invites", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const org = await storage.getOrganization(id);
    if (!org) return res.status(404).json({ message: "Organization not found" });
    const invite = await storage.createInvite(id);
    res.status(201).json(invite);
  });

  app.get("/api/invites/:token", async (req, res) => {
    const invite = await storage.getInviteByToken(req.params.token);
    if (!invite) return res.status(404).json({ message: "Invite not found" });
    if (invite.used) return res.status(410).json({ message: "This invite has already been used" });
    const org = await storage.getOrganization(invite.organizationId);
    if (!org) return res.status(404).json({ message: "Organization not found" });
    const { organizers, ...publicData } = org;
    res.json({ invite, organization: publicData });
  });

  app.post("/api/invites/:token/accept", async (req, res) => {
    const invite = await storage.getInviteByToken(req.params.token);
    if (!invite) return res.status(404).json({ message: "Invite not found" });
    if (invite.used) return res.status(410).json({ message: "This invite has already been used" });

    let accountId: number;

    if (req.body.accountId) {
      accountId = parseInt(req.body.accountId);
      if (isNaN(accountId)) return res.status(400).json({ message: "Invalid accountId" });
    } else if (req.body.email && req.body.password && req.body.firstName && req.body.lastName) {
      try {
        const newAccount = await storage.createAccount({
          email: req.body.email,
          password: req.body.password,
          firstName: req.body.firstName,
          lastName: req.body.lastName,
        });
        accountId = newAccount.id;
      } catch (e) {
        const err = e as Error;
        if (err.message?.includes("unique") || err.message?.includes("duplicate")) {
          return res.status(409).json({ message: "An account with this email already exists. Please sign in instead." });
        }
        throw e;
      }
    } else {
      return res.status(400).json({ message: "Provide accountId or new account details (email, password, firstName, lastName)" });
    }

    await storage.useInvite(req.params.token, accountId);
    const member = await storage.createMemberRequest(invite.organizationId, accountId, invite.id);
    res.json({ member, message: "Invite accepted. You are now a member of this organization." });
  });

  return httpServer;
}
