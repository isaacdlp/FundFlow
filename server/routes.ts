import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import { readFileSync } from "fs";
import path from "path";
import yaml from "js-yaml";
import { storage } from "./storage";
import { insertAccountSchema, updateAccountSchema, insertOrganizationSchema, updateOrganizationSchema, insertSpvSchema, updateSpvSchema, insertEntitySchema, updateEntitySchema, createApiTokenSchema } from "@shared/schema";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import type { AccountWithRoles } from "./storage";
import { sendPasswordResetEmail } from "./email";
import { generateApiToken, hashApiToken, parseBearerToken } from "./api-tokens";

function stripPasswordHash(account: any) {
  const { passwordHash, ...rest } = account;
  return rest;
}

/**
 * Returns the authenticated account id from either the session cookie OR a
 * bearer-token-authenticated request. Bearer auth populates `req.apiAccountId`
 * via the `bearerAuth` middleware mounted at the top of the route stack.
 */
function getAuthAccountId(req: Request): number | undefined {
  return req.session.accountId ?? (req as any).apiAccountId;
}

/**
 * If the request carries a valid `Authorization: Bearer ff_...` header that
 * resolves to a non-revoked, non-expired API token, attaches the token's
 * account id to the request. A session cookie always wins if both are present.
 * Invalid / unknown tokens silently fall through (no 401 here — `requireAuth`
 * decides that based on the resulting auth state).
 */
async function bearerAuth(req: Request, _res: Response, next: NextFunction) {
  if (req.session.accountId) return next();
  const plaintext = parseBearerToken(req.headers.authorization);
  if (!plaintext) return next();
  const tokenHash = hashApiToken(plaintext);
  const tok = await storage.getApiTokenByHash(tokenHash);
  if (!tok) return next();
  if (tok.revokedAt) return next();
  if (tok.expiresAt && tok.expiresAt.getTime() < Date.now()) return next();
  // Verify the underlying account still exists. Tokens cascade-delete with
  // their account, but we re-check here so manual DB edits / replication lag
  // can't leave a token live with no owner.
  const account = await storage.getAccount(tok.accountId);
  if (!account) return next();
  (req as any).apiAccountId = tok.accountId;
  (req as any).apiTokenId = tok.id;
  // Fire-and-forget — don't block request on a metadata write
  storage.touchApiTokenLastUsed(tok.id).catch(() => {});
  next();
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!getAuthAccountId(req)) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const id = getAuthAccountId(req);
  if (!id) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const account = await storage.getAccount(id);
  if (!account || !account.roles.some(r => r.name === "admin")) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

/**
 * Stricter than `requireAuth` — only allows session-cookie auth. Used to gate
 * sensitive identity operations (creating / revoking API tokens) so that a
 * leaked token cannot be used to mint additional tokens or revoke siblings.
 */
function requireSession(req: Request, res: Response, next: NextFunction) {
  if (!req.session.accountId) {
    return res.status(401).json({ message: "Session authentication required for this operation" });
  }
  next();
}

/**
 * Strictest gate: requires session-cookie auth AND the admin role. Used by
 * the API token management routes — only admins can mint, list, or revoke
 * tokens, and they must do so from a real browser session (not via a token).
 */
async function requireSessionAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.accountId) {
    return res.status(401).json({ message: "Session authentication required for this operation" });
  }
  const account = await storage.getAccount(req.session.accountId);
  if (!account || !isAdmin(account)) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

function isAdmin(account: AccountWithRoles): boolean {
  return account.roles.some(r => r.name === "admin");
}

async function canManageSpv(me: AccountWithRoles, spvId: number): Promise<boolean> {
  if (isAdmin(me)) return true;
  const spv = await storage.getSpv(spvId);
  if (!spv) return false;
  const org = await storage.getOrganization(spv.organizationId);
  if (!org) return false;
  return org.organizers.some(o => o.accountId === me.id);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Bearer token auth runs before everything else so that programmatic API
  // clients can hit any /api/* endpoint with `Authorization: Bearer ff_...`
  // and have all downstream permission checks see them as the token's owner.
  app.use(bearerAuth);

  // ─────────────────────────────────────────────────────────────────────────
  // OpenAPI spec + Redoc viewer (public — no auth required so external agents
  // and SDK generators can discover the API before authenticating).
  // Source of truth is docs/openapi.yaml; we parse it once at boot.
  // ─────────────────────────────────────────────────────────────────────────
  const openapiYamlPath = path.resolve(import.meta.dirname, "..", "docs", "openapi.yaml");
  let openapiYamlText = "";
  let openapiJson: unknown = {};
  try {
    openapiYamlText = readFileSync(openapiYamlPath, "utf8");
    openapiJson = yaml.load(openapiYamlText) ?? {};
  } catch (e) {
    console.error("[openapi] failed to load docs/openapi.yaml:", e);
  }

  app.get("/api/openapi.yaml", (_req, res) => {
    res.type("application/yaml").send(openapiYamlText);
  });

  app.get("/api/openapi.json", (_req, res) => {
    res.json(openapiJson);
  });

  // Redoc — single-page HTML viewer that renders the spec for humans.
  // Loaded from a CDN so we don't add another npm dep.
  app.get("/docs", (_req, res) => {
    res.type("html").send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>FundFlow API</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet" />
    <style>body { margin: 0; padding: 0; }</style>
  </head>
  <body>
    <redoc spec-url="/api/openapi.json"></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  </body>
</html>`);
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
    req.session.accountId = account.id;
    const full = await storage.getAccount(account.id);
    res.json(stripPasswordHash(full));
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    const id = getAuthAccountId(req);
    if (!id) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const account = await storage.getAccount(id);
    if (!account) {
      // Only destroy the cookie session — bearer auth has nothing to clean up.
      if (req.session.accountId) req.session.destroy(() => {});
      return res.status(401).json({ message: "Account not found" });
    }
    res.json(stripPasswordHash(account));
  });

  app.get("/api/organizations/by-slug/:slug", async (req, res) => {
    const org = await storage.getOrganizationBySlug(req.params.slug);
    if (!org) return res.status(404).json({ message: "Organization not found" });
    const { organizers, ...publicData } = org;
    res.json(publicData);
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

  app.post("/api/auth/forgot-password", async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    const account = await storage.getAccountByEmail(email);
    if (account) {
      const token = await storage.createPasswordResetToken(account.id);
      await sendPasswordResetEmail(account.email, account.firstName, token);
    }
    res.json({ message: "If an account with that email exists, a password reset link has been sent." });
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: "Token and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    const resetToken = await storage.getPasswordResetToken(token);
    if (!resetToken) {
      return res.status(400).json({ message: "Invalid or expired reset link" });
    }
    if (resetToken.used) {
      return res.status(400).json({ message: "This reset link has already been used" });
    }
    if (new Date() > resetToken.expiresAt) {
      return res.status(400).json({ message: "This reset link has expired" });
    }
    await storage.updatePassword(resetToken.accountId, password);
    await storage.usePasswordResetToken(token);
    res.json({ message: "Password has been reset successfully" });
  });


  app.use("/api", requireAuth);


  // ─────────────────────────────────────────────────────────────────────────
  // API token management
  // Token CRUD requires session auth (not bearer) so a leaked token cannot be
  // used to mint additional tokens or revoke siblings — see `requireSession`.
  // The plaintext token is returned ONLY in the POST response and never again.
  // ─────────────────────────────────────────────────────────────────────────

  app.get("/api/auth/tokens", requireSessionAdmin, async (req, res) => {
    const id = req.session.accountId!;
    const tokens = await storage.listApiTokensForAccount(id);
    res.json(tokens);
  });

  app.post("/api/auth/tokens", requireSessionAdmin, async (req: Request, res: Response) => {
    try {
      const data = createApiTokenSchema.parse(req.body);
      const id = req.session.accountId!;
      const expiresAt = data.expiresInDays
        ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
        : null;
      const generated = generateApiToken();
      const stored = await storage.createApiToken(id, data.name, generated.prefix, generated.hash, expiresAt);
      // CRITICAL: this is the only place the plaintext token is ever returned.
      res.status(201).json({ ...stored, token: generated.plaintext });
    } catch (e) {
      if (e instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(e).message });
      }
      throw e;
    }
  });

  app.delete("/api/auth/tokens/:id", requireSessionAdmin, async (req: Request, res: Response) => {
    const tokenId = parseInt(req.params.id);
    if (isNaN(tokenId)) return res.status(400).json({ message: "Invalid ID" });
    const accountId = req.session.accountId!;
    const revoked = await storage.revokeApiToken(tokenId, accountId);
    if (!revoked) return res.status(404).json({ message: "Token not found" });
    res.json({ message: "Token revoked" });
  });

  // Password changes are session-only by design: a leaked API token must not
  // be able to lock the account owner out of their own account.
  app.post("/api/auth/change-password", requireSession, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }
    const valid = await storage.verifyPassword(getAuthAccountId(req)!, currentPassword);
    if (!valid) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }
    await storage.updatePassword(getAuthAccountId(req)!, newPassword);
    res.json({ message: "Password changed successfully" });
  });


  app.get("/api/roles", async (_req, res) => {
    const rolesList = await storage.getRoles();
    res.json(rolesList);
  });

  app.get("/api/accounts", async (req, res) => {
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (isAdmin(me)) {
      const search = req.query.search as string | undefined;
      const accountsList = await storage.getAccounts(search);
      return res.json(accountsList.map(stripPasswordHash));
    }

    return res.json([stripPasswordHash(me)]);
  });

  app.get("/api/accounts/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me) && me.id !== id) {
      return res.status(403).json({ message: "Access denied" });
    }

    const account = await storage.getAccount(id);
    if (!account) return res.status(404).json({ message: "Account not found" });
    res.json(stripPasswordHash(account));
  });

  app.patch("/api/accounts/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me) && me.id !== id) {
      return res.status(403).json({ message: "Access denied" });
    }

    try {
      const data = updateAccountSchema.parse(req.body);
      if (!isAdmin(me) && data.roles) {
        return res.status(403).json({ message: "Only admins can change roles" });
      }
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

  app.delete("/api/accounts/:id", requireAdmin as any, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const deleted = await storage.deleteAccount(id);
    if (!deleted) return res.status(404).json({ message: "Account not found" });
    res.json({ message: "Account deleted" });
  });

  app.get("/api/organizations", async (req, res) => {
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (isAdmin(me)) {
      const orgs = await storage.getOrganizations();
      return res.json(orgs);
    }

    const orgIds = await storage.getOrganizationIdsForAccount(me.id);
    const allOrgs = await storage.getOrganizations();
    return res.json(allOrgs.filter(o => orgIds.includes(o.id)));
  });

  app.get("/api/organizations/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const orgIds = await storage.getOrganizationIdsForAccount(me.id);
      if (!orgIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const org = await storage.getOrganization(id);
    if (!org) return res.status(404).json({ message: "Organization not found" });
    res.json(org);
  });

  app.post("/api/organizations", requireAdmin as any, async (req: Request, res: Response) => {
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
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const orgIds = await storage.getOrganizationIdsForAccount(me.id);
      if (!orgIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

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

  app.delete("/api/organizations/:id", requireAdmin as any, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const deleted = await storage.deleteOrganization(id);
    if (!deleted) return res.status(404).json({ message: "Organization not found" });
    res.json({ message: "Organization deleted" });
  });

  app.post("/api/organizations/:id/organizers", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const orgIds = await storage.getOrganizationIdsForAccount(me.id);
      if (!orgIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

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
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const orgIds = await storage.getOrganizationIdsForAccount(me.id);
      if (!orgIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const removed = await storage.removeOrganizer(id, accountId);
    if (!removed) return res.status(404).json({ message: "Organizer assignment not found" });
    const updated = await storage.getOrganization(id);
    res.json(updated);
  });

  app.get("/api/organizations/:id/members", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const orgIds = await storage.getOrganizationIdsForAccount(me.id);
      if (!orgIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const members = await storage.getMembers(id);
    res.json(members);
  });

  app.patch("/api/organizations/:id/members/:accountId", async (req, res) => {
    const id = parseInt(req.params.id);
    const accountId = parseInt(req.params.accountId);
    if (isNaN(id) || isNaN(accountId)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const orgIds = await storage.getOrganizationIdsForAccount(me.id);
      if (!orgIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

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
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const orgIds = await storage.getOrganizationIdsForAccount(me.id);
      if (!orgIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const removed = await storage.removeMember(id, accountId);
    if (!removed) return res.status(404).json({ message: "Member not found" });
    res.json({ message: "Member removed" });
  });

  app.get("/api/organizations/:id/invites", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const orgIds = await storage.getOrganizationIdsForAccount(me.id);
      if (!orgIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const invites = await storage.getInvites(id);
    res.json(invites);
  });

  app.post("/api/organizations/:id/invites", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const orgIds = await storage.getOrganizationIdsForAccount(me.id);
      if (!orgIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const org = await storage.getOrganization(id);
    if (!org) return res.status(404).json({ message: "Organization not found" });
    const invite = await storage.createInvite(id);
    res.status(201).json(invite);
  });

  app.get("/api/spvs", async (req, res) => {
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (isAdmin(me)) {
      const spvsList = await storage.getAllSpvs();
      return res.json(spvsList);
    }

    const spvIds = await storage.getSpvIdsForAccount(me.id);
    const allSpvs = await storage.getAllSpvs();
    return res.json(allSpvs.filter(s => spvIds.includes(s.id)));
  });

  app.get("/api/organizations/:id/spvs", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const orgIds = await storage.getOrganizationIdsForAccount(me.id);
      if (!orgIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const spvsList = await storage.getSpvs(id);
    res.json(spvsList);
  });

  app.get("/api/spvs/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const spvIds = await storage.getSpvIdsForAccount(me.id);
      if (!spvIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const spv = await storage.getSpv(id);
    if (!spv) return res.status(404).json({ message: "SPV not found" });
    res.json(spv);
  });

  app.post("/api/organizations/:id/spvs", async (req, res) => {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const orgIds = await storage.getOrganizationIdsForAccount(me.id);
      if (!orgIds.includes(orgId)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const org = await storage.getOrganization(orgId);
    if (!org) return res.status(404).json({ message: "Organization not found" });
    try {
      const data = insertSpvSchema.parse({ ...req.body, organizationId: orgId });
      const spv = await storage.createSpv(data);
      res.status(201).json(spv);
    } catch (e) {
      if (e instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(e).message });
      }
      throw e;
    }
  });

  app.patch("/api/spvs/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const spvIds = await storage.getSpvIdsForAccount(me.id);
      if (!spvIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    try {
      const data = updateSpvSchema.parse(req.body);
      const spv = await storage.updateSpv(id, data);
      if (!spv) return res.status(404).json({ message: "SPV not found" });
      res.json(spv);
    } catch (e) {
      if (e instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(e).message });
      }
      throw e;
    }
  });

  app.delete("/api/spvs/:id", requireAdmin as any, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const deleted = await storage.deleteSpv(id);
    if (!deleted) return res.status(404).json({ message: "SPV not found" });
    res.json({ message: "SPV deleted" });
  });

  app.get("/api/spvs/:id/members", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const spvIds = await storage.getSpvIdsForAccount(me.id);
      if (!spvIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const members = await storage.getSpvMembers(id);
    res.json(members);
  });

  function validateInvestmentFields(body: any): { ok: true; data: { initialValue?: string; currentValue?: string; distributions?: string; purchaseDate?: string | null } } | { ok: false; error: string } {
    const out: any = {};
    for (const f of ["initialValue", "currentValue", "distributions"] as const) {
      if (body[f] === undefined || body[f] === null || body[f] === "") continue;
      const n = parseFloat(String(body[f]));
      if (!isFinite(n) || n < 0) {
        return { ok: false, error: `${f} must be a non-negative number` };
      }
      out[f] = n.toFixed(2);
    }
    if (body.purchaseDate !== undefined) {
      if (body.purchaseDate === null || body.purchaseDate === "") {
        out.purchaseDate = null;
      } else {
        const d = new Date(String(body.purchaseDate));
        if (isNaN(d.getTime())) {
          return { ok: false, error: "purchaseDate must be a valid date (YYYY-MM-DD)" };
        }
        out.purchaseDate = String(body.purchaseDate);
      }
    }
    return { ok: true, data: out };
  }

  app.post("/api/spvs/:id/members", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!(await canManageSpv(me, id))) {
      return res.status(403).json({ message: "Only admins or organization organizers can add SPV investments" });
    }

    const { accountId, entityId } = req.body;
    const hasAccount = accountId !== undefined && accountId !== null && accountId !== "";
    const hasEntity = entityId !== undefined && entityId !== null && entityId !== "";
    if (hasAccount === hasEntity) {
      return res.status(400).json({ message: "Provide exactly one of accountId or entityId" });
    }

    const validation = validateInvestmentFields(req.body);
    if (!validation.ok) return res.status(400).json({ message: validation.error });

    const spv = await storage.getSpv(id);
    if (!spv) return res.status(404).json({ message: "SPV not found" });

    let investor: { accountId: number } | { entityId: number };
    if (hasAccount) {
      const aid = parseInt(accountId);
      if (!Number.isInteger(aid) || aid <= 0) return res.status(400).json({ message: "Invalid accountId" });
      const acct = await storage.getAccount(aid);
      if (!acct) return res.status(404).json({ message: "Account not found" });
      const orgMembership = await storage.getMember(spv.organizationId, aid);
      if (!orgMembership || orgMembership.status !== "approved") {
        return res.status(400).json({ message: "Account must be an approved member of the SPV's organization" });
      }
      investor = { accountId: aid };
    } else {
      const eid = parseInt(entityId);
      if (!Number.isInteger(eid) || eid <= 0) return res.status(400).json({ message: "Invalid entityId" });
      const ent = await storage.getEntity(eid);
      if (!ent) return res.status(404).json({ message: "Entity not found" });
      investor = { entityId: eid };
    }

    const member = await storage.addSpvMember(id, investor, validation.data);
    res.status(201).json(member);
  });

  app.patch("/api/spvs/:id/members/:memberId", async (req, res) => {
    const id = parseInt(req.params.id);
    const memberId = parseInt(req.params.memberId);
    if (isNaN(id) || isNaN(memberId)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!(await canManageSpv(me, id))) {
      return res.status(403).json({ message: "Only admins or organization organizers can edit SPV investments" });
    }

    const existing = (await storage.getSpvMembers(id)).find(m => m.id === memberId);
    if (!existing) return res.status(404).json({ message: "SPV member not found" });

    const validation = validateInvestmentFields(req.body);
    if (!validation.ok) return res.status(400).json({ message: validation.error });

    const investor: { accountId: number } | { entityId: number } = existing.accountId !== null
      ? { accountId: existing.accountId }
      : { entityId: existing.entityId! };
    const member = await storage.updateSpvMember(id, investor, validation.data);
    if (!member) return res.status(404).json({ message: "SPV member not found" });
    res.json(member);
  });

  app.delete("/api/spvs/:id/members/:memberId", async (req, res) => {
    const id = parseInt(req.params.id);
    const memberId = parseInt(req.params.memberId);
    if (isNaN(id) || isNaN(memberId)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!(await canManageSpv(me, id))) {
      return res.status(403).json({ message: "Only admins or organization organizers can remove SPV investments" });
    }

    const existing = (await storage.getSpvMembers(id)).find(m => m.id === memberId);
    if (!existing) return res.status(404).json({ message: "SPV member not found" });

    const investor: { accountId: number } | { entityId: number } = existing.accountId !== null
      ? { accountId: existing.accountId }
      : { entityId: existing.entityId! };
    const removed = await storage.removeSpvMember(id, investor);
    if (!removed) return res.status(404).json({ message: "SPV member not found" });
    res.json({ message: "Member removed from SPV" });
  });

  app.get("/api/portfolio", async (req, res) => {
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    const accountIdQ = req.query.accountId ? parseInt(req.query.accountId as string) : null;
    const entityIdQ = req.query.entityId ? parseInt(req.query.entityId as string) : null;

    if (accountIdQ !== null && entityIdQ !== null) {
      return res.status(400).json({ message: "Provide either accountId or entityId, not both" });
    }

    if (accountIdQ !== null) {
      if (isNaN(accountIdQ)) return res.status(400).json({ message: "Invalid accountId" });
      if (!isAdmin(me) && me.id !== accountIdQ) {
        return res.status(403).json({ message: "Access denied" });
      }
      const ownedEntities = await storage.getEntityIdsOwnedByAccount(accountIdQ);
      const investments = await storage.getPortfolio({ accountIds: [accountIdQ], entityIds: ownedEntities });
      return res.json(investments);
    }

    if (entityIdQ !== null) {
      if (isNaN(entityIdQ)) return res.status(400).json({ message: "Invalid entityId" });
      if (!isAdmin(me)) {
        const ownedEntities = await storage.getEntityIdsOwnedByAccount(me.id);
        const managedEntities = await storage.getEntityIdsForAccount(me.id);
        if (!ownedEntities.includes(entityIdQ) && !managedEntities.includes(entityIdQ)) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      const investments = await storage.getPortfolio({ entityIds: [entityIdQ] });
      return res.json(investments);
    }

    if (isAdmin(me)) {
      const investments = await storage.getPortfolio();
      return res.json(investments);
    }
    const ownedEntities = await storage.getEntityIdsOwnedByAccount(me.id);
    const investments = await storage.getPortfolio({ accountIds: [me.id], entityIds: ownedEntities });
    res.json(investments);
  });

  app.get("/api/entities", async (req, res) => {
    const search = req.query.search as string | undefined;
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (isAdmin(me)) {
      const entitiesList = await storage.getAllEntities(search);
      return res.json(entitiesList);
    }

    const entityIds = await storage.getEntityIdsForAccount(me.id);
    const allEntities = await storage.getAllEntities(search);
    return res.json(allEntities.filter(e => entityIds.includes(e.id)));
  });

  app.get("/api/entities/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const entityIds = await storage.getEntityIdsForAccount(me.id);
      if (!entityIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const entity = await storage.getEntity(id);
    if (!entity) return res.status(404).json({ message: "Entity not found" });
    res.json(entity);
  });

  app.post("/api/entities", async (req, res) => {
    try {
      const data = insertEntitySchema.parse(req.body);
      const entity = await storage.createEntity(data);
      res.status(201).json(entity);
    } catch (e) {
      if (e instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(e).message });
      }
      throw e;
    }
  });

  app.patch("/api/entities/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const entityIds = await storage.getEntityIdsForAccount(me.id);
      if (!entityIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    try {
      const data = updateEntitySchema.parse(req.body);
      const entity = await storage.updateEntity(id, data);
      if (!entity) return res.status(404).json({ message: "Entity not found" });
      res.json(entity);
    } catch (e) {
      if (e instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(e).message });
      }
      throw e;
    }
  });

  app.delete("/api/entities/:id", requireAdmin as any, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const deleted = await storage.deleteEntity(id);
    if (!deleted) return res.status(404).json({ message: "Entity not found" });
    res.json({ message: "Entity deleted" });
  });

  app.get("/api/entities/:id/owners", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const entityIds = await storage.getEntityIdsForAccount(me.id);
      if (!entityIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const owners = await storage.getEntityOwners(id);
    res.json(owners);
  });

  app.post("/api/entities/:id/owners", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const entityIds = await storage.getEntityIdsForAccount(me.id);
      if (!entityIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const { ownerType, ownerAccountId, ownerEntityId, ownershipPercent, date } = req.body;
    if (!ownerType || !["account", "entity"].includes(ownerType)) {
      return res.status(400).json({ message: "ownerType must be 'account' or 'entity'" });
    }
    if (ownerType === "account" && !ownerAccountId) {
      return res.status(400).json({ message: "ownerAccountId is required when ownerType is 'account'" });
    }
    if (ownerType === "entity" && !ownerEntityId) {
      return res.status(400).json({ message: "ownerEntityId is required when ownerType is 'entity'" });
    }
    const pct = parseFloat(ownershipPercent || "0");
    if (isNaN(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ message: "ownershipPercent must be between 0 and 100" });
    }
    const owner = await storage.addEntityOwner(
      id,
      ownerType,
      ownerType === "account" ? ownerAccountId : null,
      ownerType === "entity" ? ownerEntityId : null,
      String(pct),
      date || null
    );
    res.status(201).json(owner);
  });

  app.delete("/api/entities/:id/owners/:ownerId", async (req, res) => {
    const id = parseInt(req.params.id);
    const ownerId = parseInt(req.params.ownerId);
    if (isNaN(ownerId)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const entityIds = await storage.getEntityIdsForAccount(me.id);
      if (!entityIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const removed = await storage.removeEntityOwner(ownerId);
    if (!removed) return res.status(404).json({ message: "Owner not found" });
    res.json({ message: "Owner removed" });
  });

  app.get("/api/entities/:id/managers", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const entityIds = await storage.getEntityIdsForAccount(me.id);
      if (!entityIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const managers = await storage.getEntityManagers(id);
    res.json(managers);
  });

  app.post("/api/entities/:id/managers", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const entityIds = await storage.getEntityIdsForAccount(me.id);
      if (!entityIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const { accountId } = req.body;
    if (!accountId) return res.status(400).json({ message: "accountId is required" });
    const manager = await storage.addEntityManager(id, accountId);
    res.json(manager);
  });

  app.delete("/api/entities/:id/managers/:accountId", async (req, res) => {
    const id = parseInt(req.params.id);
    const accountId = parseInt(req.params.accountId);
    if (isNaN(id) || isNaN(accountId)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const entityIds = await storage.getEntityIdsForAccount(me.id);
      if (!entityIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const removed = await storage.removeEntityManager(id, accountId);
    if (!removed) return res.status(404).json({ message: "Manager not found" });
    res.json({ message: "Manager removed" });
  });

  return httpServer;
}
