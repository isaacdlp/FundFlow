import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import { readFileSync } from "fs";
import path from "path";
import yaml from "js-yaml";
import { storage } from "./storage";
import { insertAccountSchema, updateAccountSchema, insertOrganizationSchema, updateOrganizationSchema, insertVehicleSchema, updateVehicleSchema, insertEntitySchema, updateEntitySchema, createApiTokenSchema, createIntroductionSchema, updateIntroductionSchema, createPromoterSchema, updatePromoterSchema, createIncentiveSchema, updateIncentiveSchema, createPromoterContractSchema, updateConcordSettingsSchema, ACCOUNT_SETUP_TTL_MS } from "@shared/schema";
import { ConcordError, ConcordNotConfiguredError, getConcordClient } from "./concord";
import {
  buildPromoterContractDraft, concordConfigFrom, concordSettingsInfo, getConcordSettings, getContractTemplate,
  getOurSigner, serializeContract, updateConcordSettings,
} from "./contracts";
import { findIntroductionConflict, unavailableIntroductions, type IntroductionProposal } from "./introductions";
import { isLocale } from "@shared/i18n";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import type { AccountWithRoles } from "./storage";
import { sendPasswordResetEmail, sendWelcomeEmail, sendAccountSetupEmail } from "./email";
import { generateApiToken, hashApiToken, parseBearerToken } from "./api-tokens";
import { registerDocumentRoutes } from "./documents";
import { registerCurrencyRoutes } from "./currency";

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
  return req.session.impersonatedAccountId ?? req.session.accountId ?? (req as any).apiAccountId;
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

/**
 * Admins can manage any organization; non-admins only those they organize.
 * Approved membership alone is NOT enough — it grants read access only.
 */
async function canManageOrg(me: AccountWithRoles, orgId: number): Promise<boolean> {
  if (isAdmin(me)) return true;
  const organizerOrgIds = await storage.getOrganizationIdsAsOrganizer(me.id);
  return organizerOrgIds.includes(orgId);
}

async function canManageVehicle(me: AccountWithRoles, vehicleId: number): Promise<boolean> {
  if (isAdmin(me)) return true;
  const vehicle = await storage.getVehicle(vehicleId);
  if (!vehicle) return false;
  const org = await storage.getOrganization(vehicle.organizationId);
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
  const openapiYamlPath = path.resolve(process.cwd(), "docs", "openapi.yaml");
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

  app.post("/api/auth/impersonate/stop", requireSession, (req, res) => {
    delete req.session.impersonatedAccountId;
    res.json({ message: "Returned to self" });
  });

  app.post("/api/auth/impersonate/:accountId", requireSessionAdmin, async (req, res) => {
    const targetId = parseInt(req.params.accountId, 10);
    if (isNaN(targetId)) return res.status(400).json({ message: "Invalid account id" });
    if (targetId === req.session.accountId) return res.status(400).json({ message: "Cannot impersonate yourself" });
    const target = await storage.getAccount(targetId);
    if (!target) return res.status(404).json({ message: "Account not found" });
    req.session.impersonatedAccountId = targetId;
    res.json({ message: "Now impersonating", accountId: targetId });
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
    const base = stripPasswordHash(account);
    if (req.session.impersonatedAccountId && req.session.accountId) {
      const realAccount = await storage.getAccount(req.session.accountId);
      if (realAccount) {
        base.impersonatedBy = { id: realAccount.id, firstName: realAccount.firstName, lastName: realAccount.lastName };
      }
    }
    res.json(base);
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

    // Either create a new account from the body, or accept for the logged-in
    // account. A client-supplied `accountId` is never trusted.
    const authAccountId = getAuthAccountId(req);
    if (req.body.email && req.body.password && req.body.firstName && req.body.lastName) {
      try {
        const newAccount = await storage.createAccount({
          email: req.body.email,
          password: req.body.password,
          firstName: req.body.firstName,
          lastName: req.body.lastName,
          language: "en",
        });
        accountId = newAccount.id;
      } catch (e) {
        const err = e as Error;
        if (err.message?.includes("unique") || err.message?.includes("duplicate")) {
          return res.status(409).json({ message: "An account with this email already exists. Please sign in instead." });
        }
        throw e;
      }
    } else if (authAccountId) {
      accountId = authAccountId;
    } else {
      return res.status(400).json({ message: "Sign in, or provide new account details (email, password, firstName, lastName)" });
    }

    await storage.useInvite(req.params.token, accountId);
    const member = await storage.createMemberRequest(invite.organizationId, accountId, invite.id);
    res.json({ member, message: "Invite accepted. You are now a member of this organization." });
  });

  // Without `accountId` (or with the caller's own id): request membership for
  // the logged-in account — created as "pending".
  // With another `accountId`: only admins or organizers of this org may do it,
  // and the membership is created already "approved" (they are the approvers).
  app.post("/api/organizations/:id/members/request", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const callerId = getAuthAccountId(req)!;

    let accountId = callerId;
    let addedByManager = false;
    if (req.body?.accountId !== undefined && req.body.accountId !== null) {
      const target = parseInt(req.body.accountId);
      if (isNaN(target)) return res.status(400).json({ message: "Invalid accountId" });
      if (target !== callerId) {
        const me = await storage.getAccount(callerId);
        if (!me) return res.status(401).json({ message: "Account not found" });
        if (!(await canManageOrg(me, id))) {
          return res.status(403).json({ message: "Only admins or organizers of this organization can add other members" });
        }
        accountId = target;
        addedByManager = true;
      }
    }

    const org = await storage.getOrganization(id);
    if (!org) return res.status(404).json({ message: "Organization not found" });
    if (addedByManager && !(await storage.getAccount(accountId))) {
      return res.status(404).json({ message: "Account not found" });
    }

    const existing = await storage.getMember(id, accountId);
    if (existing) {
      // A manager adding someone with a pending/rejected request approves it.
      if (addedByManager && existing.status !== "approved") {
        const approved = await storage.updateMemberStatus(id, accountId, "approved");
        return res.json(approved);
      }
      return res.json(existing);
    }

    const member = await storage.createMemberRequest(id, accountId, undefined, addedByManager ? "approved" : "pending");
    res.status(201).json(member);
  });

  // Admin-only: there is no self-signup. New users join via admin creation or
  // an invite link (`/api/invites/:token/accept`). Gating this also keeps
  // anonymous callers from assigning themselves roles (e.g. "admin").
  app.post("/api/accounts", requireAdmin, async (req, res) => {
    try {
      // Welcome email is ON by default; opt out with `welcome_email: false`.
      // With a password it contains the credentials; without one it contains
      // a link (valid 7 days) for the user to create their own password.
      const welcome_email = req.body.welcome_email !== false;
      const data = insertAccountSchema.parse(req.body);
      if (!data.password && !welcome_email) {
        return res.status(400).json({
          message: "Either provide a password or leave welcome_email enabled so the user can set their own password",
        });
      }
      const account = await storage.createAccount(data);
      // Reported back so the admin knows if the user never got the email
      // (critical when no password was set: the email is their only way in).
      let welcomeEmail: "sent" | "failed" | "skipped" = "skipped";
      if (welcome_email) {
        let sent: boolean;
        if (data.password) {
          sent = await sendWelcomeEmail(account.email, account.firstName, data.password, account.language);
        } else {
          const token = await storage.createPasswordResetToken(account.id, ACCOUNT_SETUP_TTL_MS);
          sent = await sendAccountSetupEmail(account.email, account.firstName, token, account.language);
        }
        welcomeEmail = sent ? "sent" : "failed";
      }
      res.status(201).json({ ...stripPasswordHash(account), welcomeEmail });
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
    const { email, language } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    const account = await storage.getAccountByEmail(email);
    if (account) {
      const token = await storage.createPasswordResetToken(account.id);
      // Use the language of the page the request came from, not the account's saved
      // preference, so the email matches what the user is currently looking at.
      const requestLanguage = isLocale(language) ? language : account.language;
      await sendPasswordResetEmail(account.email, account.firstName, token, requestLanguage);
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

    const setPassword = req.body.password as string | undefined;
    const welcome_email = !!req.body.welcome_email;

    if (setPassword !== undefined && !isAdmin(me)) {
      return res.status(403).json({ message: "Only admins can set passwords directly" });
    }
    if (setPassword !== undefined && setPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    try {
      const data = updateAccountSchema.parse(req.body);
      if (!isAdmin(me)) {
        delete data.roles;
      }
      const account = await storage.updateAccount(id, data);
      if (!account) return res.status(404).json({ message: "Account not found" });

      if (setPassword) {
        await storage.updatePassword(id, setPassword);
        // Only reported when a password is set, so plain profile edits keep
        // the usual Account response shape.
        let welcomeEmail: "sent" | "failed" | "skipped" = "skipped";
        if (welcome_email) {
          const sent = await sendWelcomeEmail(account.email, account.firstName, setPassword, account.language);
          welcomeEmail = sent ? "sent" : "failed";
        }
        return res.json({ ...stripPasswordHash(account), welcomeEmail });
      }

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
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (me && me.id === id) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }
    const deleted = await storage.deleteAccount(id);
    if (!deleted) return res.status(404).json({ message: "Account not found" });
    res.json({ message: "Account deleted" });
  });

  // ──── Introductions (admin-only) ──────────────────────────────────────────
  app.get("/api/accounts/:id/introductions", requireAdmin as any, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    if (!(await storage.getAccount(id))) return res.status(404).json({ message: "Account not found" });
    const [intros, graph] = await Promise.all([
      storage.getIntroductionsForAccount(id),
      storage.getIntroductionGraph(),
    ]);
    res.json({ ...intros, unavailable: unavailableIntroductions(graph, id) });
  });

  app.get("/api/entities/:id/introductions", requireAdmin as any, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    if (!(await storage.getEntity(id))) return res.status(404).json({ message: "Entity not found" });
    res.json(await storage.getIntroductionsForEntity(id));
  });

  app.post("/api/introductions", requireAdmin as any, async (req: Request, res: Response) => {
    let data;
    try {
      data = createIntroductionSchema.parse(req.body);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: fromZodError(e).message });
      throw e;
    }
    if (!(await storage.getAccount(data.introducerAccountId))) {
      return res.status(404).json({ message: "Introducer account not found" });
    }
    if (data.introducedAccountId !== undefined && !(await storage.getAccount(data.introducedAccountId))) {
      return res.status(404).json({ message: "Introduced account not found" });
    }
    if (data.introducedEntityId !== undefined && !(await storage.getEntity(data.introducedEntityId))) {
      return res.status(404).json({ message: "Introduced entity not found" });
    }
    const conflict = findIntroductionConflict(await storage.getIntroductionGraph(), data as IntroductionProposal);
    if (conflict) return res.status(400).json({ message: conflict });
    const created = await storage.createIntroduction(data);
    if (!created) return res.status(409).json({ message: "This introduction already exists" });
    res.status(201).json(created);
  });

  app.patch("/api/introductions/:id", requireAdmin as any, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    let data;
    try {
      data = updateIntroductionSchema.parse(req.body);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: fromZodError(e).message });
      throw e;
    }
    const existing = await storage.getIntroduction(id);
    if (!existing) return res.status(404).json({ message: "Introduction not found" });
    if (existing.viaAccountId !== null) {
      return res.status(400).json({ message: "Inherited introductions follow the managing account's introduction and can't be edited" });
    }
    res.json(await storage.updateIntroduction(id, data));
  });

  app.delete("/api/introductions/:id", requireAdmin as any, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const existing = await storage.getIntroduction(id);
    if (!existing) return res.status(404).json({ message: "Introduction not found" });
    if (existing.viaAccountId !== null) {
      return res.status(400).json({ message: "Inherited introductions follow the managing account's introduction; remove that introduction instead" });
    }
    await storage.deleteIntroduction(id);
    res.json({ message: "Introduction removed" });
  });

  // ──── Promoters (admin-only) ─────────────────────────────────────────────
  app.get("/api/promoters", requireAdmin as any, async (_req: Request, res: Response) => {
    res.json(await storage.getPromoters());
  });

  app.post("/api/promoters", requireAdmin as any, async (req: Request, res: Response) => {
    let data;
    try {
      data = createPromoterSchema.parse(req.body);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: fromZodError(e).message });
      throw e;
    }
    if (!(await storage.getAccount(data.accountId))) return res.status(404).json({ message: "Account not found" });
    const created = await storage.createPromoter(data);
    if (!created) return res.status(409).json({ message: "This account is already a promoter" });
    res.status(201).json(created);
  });

  app.get("/api/promoters/:id", requireAdmin as any, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const promoter = await storage.getPromoter(id);
    if (!promoter) return res.status(404).json({ message: "Promoter not found" });
    res.json(promoter);
  });

  app.patch("/api/promoters/:id", requireAdmin as any, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    let data;
    try {
      data = updatePromoterSchema.parse(req.body);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: fromZodError(e).message });
      throw e;
    }
    const promoter = await storage.getPromoter(id);
    if (!promoter) return res.status(404).json({ message: "Promoter not found" });
    if (data.active && !promoter.active && !promoter.hasSignedContract) {
      return res.status(409).json({ message: "A promoter can only be active once their promoter agreement is signed" });
    }
    const updated = await storage.updatePromoter(id, data);
    if (!updated) return res.status(404).json({ message: "Promoter not found" });
    res.json(updated);
  });

  app.delete("/api/promoters/:id", requireAdmin as any, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    if (!(await storage.deletePromoter(id))) return res.status(404).json({ message: "Promoter not found" });
    res.json({ message: "Promoter removed" });
  });

  app.post("/api/promoters/:id/incentives", requireAdmin as any, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    let data;
    try {
      data = createIncentiveSchema.parse(req.body);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: fromZodError(e).message });
      throw e;
    }
    if (!(await storage.getPromoter(id))) return res.status(404).json({ message: "Promoter not found" });
    const created = await storage.createPromoterIncentive(id, data);
    if (!created) return res.status(409).json({ message: "This promoter already has an incentive of that type" });
    res.status(201).json(created);
  });

  /** Resolves :incentiveId only when it belongs to :id, so URLs can't cross promoters. */
  const findIncentive = async (req: Request) => {
    const promoterId = parseInt(req.params.id);
    const incentiveId = parseInt(req.params.incentiveId);
    if (isNaN(promoterId) || isNaN(incentiveId)) return undefined;
    const incentive = await storage.getPromoterIncentive(incentiveId);
    return incentive?.promoterId === promoterId ? incentive : undefined;
  };

  app.patch("/api/promoters/:id/incentives/:incentiveId", requireAdmin as any, async (req: Request, res: Response) => {
    let data;
    try {
      data = updateIncentiveSchema.parse(req.body);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: fromZodError(e).message });
      throw e;
    }
    const incentive = await findIncentive(req);
    if (!incentive) return res.status(404).json({ message: "Incentive not found" });
    res.json(await storage.updatePromoterIncentive(incentive.id, data));
  });

  app.delete("/api/promoters/:id/incentives/:incentiveId", requireAdmin as any, async (req: Request, res: Response) => {
    const incentive = await findIncentive(req);
    if (!incentive) return res.status(404).json({ message: "Incentive not found" });
    await storage.deletePromoterIncentive(incentive.id);
    res.json({ message: "Incentive removed" });
  });

  // ──── Contracts (ConcordNow e-signature, admin-only) ──────────────────────
  /** Maps Concord failures to 503 (not configured) / 502 (Concord refused); rethrows the rest. */
  const concordFailure = (res: Response, e: unknown) => {
    if (e instanceof ConcordNotConfiguredError) return res.status(503).json({ message: e.message });
    if (e instanceof ConcordError) return res.status(502).json({ message: e.message });
    throw e;
  };

  app.get("/api/settings/concord", requireAdmin as any, async (_req: Request, res: Response) => {
    res.json(concordSettingsInfo(await getConcordSettings()));
  });

  app.patch("/api/settings/concord", requireAdmin as any, async (req: Request, res: Response) => {
    let data;
    try {
      data = updateConcordSettingsSchema.parse(req.body);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: fromZodError(e).message });
      throw e;
    }
    res.json(concordSettingsInfo(await updateConcordSettings(data)));
  });

  app.get("/api/promoters/:id/contracts", requireAdmin as any, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    if (!(await storage.getPromoter(id))) return res.status(404).json({ message: "Promoter not found" });
    const config = concordConfigFrom(await getConcordSettings());
    res.json((await storage.getContractsForPromoter(id)).map(c => serializeContract(c, config)));
  });

  app.get("/api/promoters/:id/contracts/draft", requireAdmin as any, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const promoter = await storage.getPromoter(id);
    if (!promoter) return res.status(404).json({ message: "Promoter not found" });
    const account = await storage.getAccount(promoter.accountId);
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!account || !me) return res.status(404).json({ message: "Account not found" });
    const settings = await getConcordSettings();
    const ready = !!concordConfigFrom(settings) && !!getContractTemplate("promoter_agreement", settings).templateId;
    res.json(buildPromoterContractDraft(account, promoter.incentives, getOurSigner(me.email, settings), ready));
  });

  app.post("/api/promoters/:id/contracts", requireAdmin as any, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    let data;
    try {
      data = createPromoterContractSchema.parse(req.body);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: fromZodError(e).message });
      throw e;
    }
    const promoter = await storage.getPromoter(id);
    if (!promoter) return res.status(404).json({ message: "Promoter not found" });
    const settings = await getConcordSettings();
    const config = concordConfigFrom(settings);
    const { templateId, folderId } = getContractTemplate("promoter_agreement", settings);
    if (!templateId) {
      return res.status(503).json({ message: "No Concord template for promoter agreements (set it in Settings)" });
    }
    const me = await storage.getAccount(getAuthAccountId(req)!);
    const ourSigner = getOurSigner(me!.email, settings).toLowerCase();
    let concordUid: string;
    try {
      concordUid = await getConcordClient(config).createFromTemplate({
        templateId,
        folderId: folderId ?? undefined,
        title: data.title,
        variables: data.variables,
        signers: data.signers,
        invite: {
          // Our own signer works in Concord already; everyone else gets an email.
          emails: data.signers.filter(email => email.toLowerCase() !== ourSigner),
          subject: data.subject || data.title,
          message: data.message ?? "",
        },
      });
    } catch (e) {
      return concordFailure(res, e);
    }
    const contract = await storage.createContract({
      kind: "promoter_agreement",
      concordUid,
      title: data.title,
      status: "SIGNING",
      signers: data.signers,
      promoterId: id,
      createdByAccountId: me!.id,
      statusCheckedAt: new Date(),
    });
    res.status(201).json(serializeContract(contract, config));
  });

  app.get("/api/contracts/:id", requireAdmin as any, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const contract = await storage.getContract(id);
    if (!contract) return res.status(404).json({ message: "Contract not found" });
    res.json(serializeContract(contract, concordConfigFrom(await getConcordSettings())));
  });

  app.post("/api/contracts/:id/refresh", requireAdmin as any, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const contract = await storage.getContract(id);
    if (!contract) return res.status(404).json({ message: "Contract not found" });
    const config = concordConfigFrom(await getConcordSettings());
    let current;
    try {
      current = await getConcordClient(config).getStatus(contract.concordUid);
    } catch (e) {
      return concordFailure(res, e);
    }
    const now = new Date();
    const status = current?.status ?? "DELETED";
    const newlySigned = status === "SIGNED" && !contract.signedAt;
    const updated = await storage.updateContract(id, {
      status,
      concordUid: current?.uid ?? contract.concordUid,
      statusCheckedAt: now,
      signedAt: newlySigned ? now : contract.signedAt,
    });
    // Once all parties sign a promoter agreement, the promoter becomes active and
    // its contract is dated (unless an admin already set the date). This only
    // happens on the first signature, so a later manual deactivation sticks.
    if (newlySigned && contract.promoterId !== null) {
      const promoter = await storage.getPromoter(contract.promoterId);
      if (promoter) {
        await storage.updatePromoter(promoter.id, {
          active: true,
          ...(promoter.contractDate ? {} : { contractDate: now.toISOString().slice(0, 10) }),
        });
      }
    }
    res.json(serializeContract(updated!, config));
  });

  app.delete("/api/contracts/:id", requireAdmin as any, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const contract = await storage.getContract(id);
    if (!contract) return res.status(404).json({ message: "Contract not found" });
    try {
      const client = getConcordClient(concordConfigFrom(await getConcordSettings()));
      // Check live: the cached status may predate the last signature.
      const current = await client.getStatus(contract.concordUid);
      if (current?.status === "SIGNED") {
        await storage.updateContract(id, { status: "SIGNED", concordUid: current.uid, statusCheckedAt: new Date(), signedAt: contract.signedAt ?? new Date() });
        return res.status(409).json({ message: "Signed contracts can't be deleted" });
      }
      if (current) await client.deleteAgreement(current.uid);
    } catch (e) {
      return concordFailure(res, e);
    }
    await storage.deleteContract(id);
    res.json({ message: "Contract deleted" });
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

    if (!(await canManageOrg(me, id))) {
      return res.status(403).json({ message: "Only admins or organizers of this organization can edit it" });
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

    if (!(await canManageOrg(me, id))) {
      return res.status(403).json({ message: "Only admins or organizers of this organization can manage organizers" });
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

    if (!(await canManageOrg(me, id))) {
      return res.status(403).json({ message: "Only admins or organizers of this organization can manage organizers" });
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

    if (!(await canManageOrg(me, id))) {
      return res.status(403).json({ message: "Only admins or organizers of this organization can view its members" });
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

    if (!(await canManageOrg(me, id))) {
      return res.status(403).json({ message: "Only admins or organizers of this organization can manage members" });
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

    if (!(await canManageOrg(me, id))) {
      return res.status(403).json({ message: "Only admins or organizers of this organization can manage members" });
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

    if (!(await canManageOrg(me, id))) {
      return res.status(403).json({ message: "Only admins or organizers of this organization can view invites" });
    }

    const invites = await storage.getInvites(id);
    res.json(invites);
  });

  app.post("/api/organizations/:id/invites", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!(await canManageOrg(me, id))) {
      return res.status(403).json({ message: "Only admins or organizers of this organization can create invites" });
    }

    const org = await storage.getOrganization(id);
    if (!org) return res.status(404).json({ message: "Organization not found" });
    const invite = await storage.createInvite(id);
    res.status(201).json(invite);
  });

  app.get("/api/vehicles", async (req, res) => {
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (isAdmin(me)) {
      const vehiclesList = await storage.getAllVehicles();
      return res.json(vehiclesList);
    }

    const [vehicleIds, organizerOrgIds, allVehicles] = await Promise.all([
      storage.getVehicleIdsForAccount(me.id),
      storage.getOrganizationIdsAsOrganizer(me.id),
      storage.getAllVehicles(),
    ]);
    const investedSet = new Set(vehicleIds);
    const organizerOrgSet = new Set(organizerOrgIds);
    return res.json(allVehicles.filter(s => investedSet.has(s.id) || organizerOrgSet.has(s.organizationId)));
  });

  app.get("/api/organizations/:id/vehicles", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    const vehiclesList = await storage.getVehicles(id);
    if (isAdmin(me)) return res.json(vehiclesList);

    const orgIds = await storage.getOrganizationIdsForAccount(me.id);
    if (!orgIds.includes(id)) {
      return res.status(403).json({ message: "Access denied" });
    }
    // Organizers of the org see every Vehicle in the org. Plain members see only
    // Vehicles they invest in (directly or via owned entities).
    const organizerOrgIds = await storage.getOrganizationIdsAsOrganizer(me.id);
    if (organizerOrgIds.includes(id)) return res.json(vehiclesList);
    const investedVehicleIds = await storage.getVehicleIdsForAccount(me.id);
    res.json(vehiclesList.filter(s => investedVehicleIds.includes(s.id)));
  });

  app.get("/api/vehicles/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const vehicleIds = await storage.getVehicleIdsForAccount(me.id);
      if (!vehicleIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const vehicle = await storage.getVehicle(id);
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
    res.json(vehicle);
  });

  app.post("/api/organizations/:id/vehicles", async (req, res) => {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!(await canManageOrg(me, orgId))) {
      return res.status(403).json({ message: "Only admins or organizers of this organization can create Vehicles" });
    }

    const org = await storage.getOrganization(orgId);
    if (!org) return res.status(404).json({ message: "Organization not found" });
    try {
      const data = insertVehicleSchema.parse({ ...req.body, organizationId: orgId });
      const currency = data.currency || "USD";
      const activeCodes = await storage.getActiveCurrencyCodes();
      if (!activeCodes.includes(currency)) {
        return res.status(400).json({ message: `Currency must be one of the active currencies: ${activeCodes.join(", ")}` });
      }
      const vehicle = await storage.createVehicle({ ...data, currency });
      res.status(201).json(vehicle);
    } catch (e) {
      if (e instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(e).message });
      }
      throw e;
    }
  });

  app.patch("/api/vehicles/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!isAdmin(me)) {
      const vehicleIds = await storage.getVehicleIdsForAccount(me.id);
      if (!vehicleIds.includes(id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    try {
      const data = updateVehicleSchema.parse(req.body);
      const vehicle = await storage.updateVehicle(id, data);
      if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
      res.json(vehicle);
    } catch (e) {
      if (e instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(e).message });
      }
      throw e;
    }
  });

  app.delete("/api/vehicles/:id", requireAdmin as any, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const deleted = await storage.deleteVehicle(id);
    if (!deleted) return res.status(404).json({ message: "Vehicle not found" });
    res.json({ message: "Vehicle deleted" });
  });

  app.get("/api/vehicles/:id/members", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    const members = await storage.getVehicleMembers(id);
    if (isAdmin(me) || (await canManageVehicle(me, id))) {
      return res.json(members);
    }

    const vehicleIds = await storage.getVehicleIdsForAccount(me.id);
    if (!vehicleIds.includes(id)) {
      return res.status(403).json({ message: "Access denied" });
    }
    const [ownedEntityIds, managedEntityIds] = await Promise.all([
      storage.getEntityIdsOwnedByAccount(me.id),
      storage.getEntityIdsForAccount(me.id),
    ]);
    const allEntityIds = new Set([...ownedEntityIds, ...managedEntityIds]);
    const visible = members.filter(m =>
      m.accountId === me.id || (m.entityId !== null && allEntityIds.has(m.entityId))
    );
    res.json(visible);
  });

  function validateInvestmentFields(body: any): { ok: true; data: { committed?: string; managementFee?: string; otherFee?: string; carry?: string; totalCalled?: string; distributed?: string; ownershipPercent?: string | null; date?: string | null } } | { ok: false; error: string } {
    const out: any = {};
    for (const f of ["committed", "managementFee", "otherFee", "totalCalled", "distributed"] as const) {
      if (body[f] === undefined || body[f] === null || body[f] === "") continue;
      const n = parseFloat(String(body[f]));
      if (!isFinite(n) || n < 0) {
        return { ok: false, error: `${f} must be a non-negative number` };
      }
      out[f] = n.toFixed(2);
    }
    if (body.carry !== undefined && body.carry !== null && body.carry !== "") {
      const n = parseFloat(String(body.carry));
      if (!isFinite(n) || n < 0 || n > 100) {
        return { ok: false, error: "carry must be a percentage between 0 and 100" };
      }
      out.carry = n.toFixed(2);
    }
    if (body.ownershipPercent !== undefined) {
      if (body.ownershipPercent === null || body.ownershipPercent === "") {
        out.ownershipPercent = null;
      } else {
        const n = parseFloat(String(body.ownershipPercent));
        if (!isFinite(n) || n < 0 || n > 100) {
          return { ok: false, error: "ownershipPercent must be between 0 and 100" };
        }
        out.ownershipPercent = n.toFixed(4);
      }
    }
    if (body.date !== undefined) {
      if (body.date === null || body.date === "") {
        out.date = null;
      } else {
        const d = new Date(String(body.date));
        if (isNaN(d.getTime())) {
          return { ok: false, error: "date must be a valid date (YYYY-MM-DD)" };
        }
        out.date = String(body.date);
      }
    }
    return { ok: true, data: out };
  }

  app.post("/api/vehicles/:id/members", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!(await canManageVehicle(me, id))) {
      return res.status(403).json({ message: "Only admins or organization organizers can add Vehicle investments" });
    }

    const { accountId, entityId } = req.body;
    const hasAccount = accountId !== undefined && accountId !== null && accountId !== "";
    const hasEntity = entityId !== undefined && entityId !== null && entityId !== "";
    if (hasAccount === hasEntity) {
      return res.status(400).json({ message: "Provide exactly one of accountId or entityId" });
    }

    const validation = validateInvestmentFields(req.body);
    if (!validation.ok) return res.status(400).json({ message: validation.error });
    if (!validation.data.date) return res.status(400).json({ message: "date is required" });

    const vehicle = await storage.getVehicle(id);
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });

    if (vehicle.autoDeploy) {
      const assets = await storage.getVehicleAssets(id);
      const hasDefault = assets.some(a => a.isDefault);
      if (!hasDefault) {
        return res.status(400).json({ message: "AutoDeploy is enabled but the Vehicle has no default asset. Mark an asset as default before adding investors." });
      }
    }

    let investor: { accountId: number } | { entityId: number };
    if (hasAccount) {
      const aid = parseInt(accountId);
      if (!Number.isInteger(aid) || aid <= 0) return res.status(400).json({ message: "Invalid accountId" });
      const acct = await storage.getAccount(aid);
      if (!acct) return res.status(404).json({ message: "Account not found" });
      const orgMembership = await storage.getMember(vehicle.organizationId, aid);
      if (!orgMembership || orgMembership.status !== "approved") {
        return res.status(400).json({ message: "Account must be an approved member of the Vehicle's organization" });
      }
      investor = { accountId: aid };
    } else {
      const eid = parseInt(entityId);
      if (!Number.isInteger(eid) || eid <= 0) return res.status(400).json({ message: "Invalid entityId" });
      const ent = await storage.getEntity(eid);
      if (!ent) return res.status(404).json({ message: "Entity not found" });
      investor = { entityId: eid };
    }

    const member = await storage.addVehicleMember(id, investor, validation.data);
    res.status(201).json(member);
  });

  app.patch("/api/vehicles/:id/members/:memberId", async (req, res) => {
    const id = parseInt(req.params.id);
    const memberId = parseInt(req.params.memberId);
    if (isNaN(id) || isNaN(memberId)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!(await canManageVehicle(me, id))) {
      return res.status(403).json({ message: "Only admins or organization organizers can edit Vehicle investments" });
    }

    const validation = validateInvestmentFields(req.body);
    if (!validation.ok) return res.status(400).json({ message: validation.error });

    const member = await storage.updateVehicleMemberById(id, memberId, validation.data);
    if (!member) return res.status(404).json({ message: "Vehicle member not found" });
    res.json(member);
  });

  // === Vehicle Assets ===
  app.get("/api/vehicles/:id/assets", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });
    if (!isAdmin(me)) {
      const vehicleIds = await storage.getVehicleIdsForAccount(me.id);
      if (!vehicleIds.includes(id)) return res.status(403).json({ message: "Access denied" });
    }
    const assets = await storage.getVehicleAssets(id);
    res.json(assets);
  });

  function validateAssetFields(body: any, requireCompany: boolean): { ok: true; data: any } | { ok: false; error: string } {
    const out: any = {};
    if (body.isDefault !== undefined) {
      out.isDefault = body.isDefault === true || body.isDefault === "true";
    }
    if (body.companyName !== undefined) {
      const s = String(body.companyName).trim();
      if (s === "") return { ok: false, error: "companyName is required" };
      out.companyName = s;
    } else if (requireCompany) {
      return { ok: false, error: "companyName is required" };
    }
    if (body.instrumentType !== undefined) {
      const s = String(body.instrumentType).trim();
      if (s === "") return { ok: false, error: "instrumentType cannot be empty" };
      out.instrumentType = s;
    }
    if (body.cost !== undefined && body.cost !== null && body.cost !== "") {
      const n = parseFloat(String(body.cost));
      if (!isFinite(n) || n < 0) return { ok: false, error: "cost must be a non-negative number" };
      out.cost = n.toFixed(2);
    }
    if (body.purchaseDate !== undefined) {
      if (body.purchaseDate === null || body.purchaseDate === "") out.purchaseDate = null;
      else {
        const d = new Date(String(body.purchaseDate));
        if (isNaN(d.getTime())) return { ok: false, error: "purchaseDate must be a valid date (YYYY-MM-DD)" };
        out.purchaseDate = String(body.purchaseDate);
      }
    }
    if (body.notes !== undefined) out.notes = String(body.notes ?? "");
    return { ok: true, data: out };
  }

  app.post("/api/vehicles/:id/assets", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });
    if (!(await canManageVehicle(me, id))) {
      return res.status(403).json({ message: "Only admins or organization organizers can add Vehicle assets" });
    }
    const vehicle = await storage.getVehicle(id);
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
    const v = validateAssetFields(req.body, true);
    if (!v.ok) return res.status(400).json({ message: v.error });
    const asset = await storage.createVehicleAsset(id, v.data);
    res.status(201).json(asset);
  });

  app.patch("/api/vehicles/:id/assets/:assetId", async (req, res) => {
    const id = parseInt(req.params.id);
    const assetId = parseInt(req.params.assetId);
    if (isNaN(id) || isNaN(assetId)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });
    if (!(await canManageVehicle(me, id))) {
      return res.status(403).json({ message: "Only admins or organization organizers can edit Vehicle assets" });
    }
    const v = validateAssetFields(req.body, false);
    if (!v.ok) return res.status(400).json({ message: v.error });
    const asset = await storage.updateVehicleAsset(id, assetId, v.data);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    res.json(asset);
  });

  app.delete("/api/vehicles/:id/assets/:assetId", async (req, res) => {
    const id = parseInt(req.params.id);
    const assetId = parseInt(req.params.assetId);
    if (isNaN(id) || isNaN(assetId)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });
    if (!(await canManageVehicle(me, id))) {
      return res.status(403).json({ message: "Only admins or organization organizers can remove Vehicle assets" });
    }
    const removed = await storage.deleteVehicleAsset(id, assetId);
    if (!removed) return res.status(404).json({ message: "Asset not found" });
    res.json({ message: "Asset removed" });
  });

  app.get("/api/vehicles/:id/assets/:assetId/valuations", async (req, res) => {
    const id = parseInt(req.params.id);
    const assetId = parseInt(req.params.assetId);
    if (isNaN(id) || isNaN(assetId)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });
    if (!isAdmin(me)) {
      const vehicleIds = await storage.getVehicleIdsForAccount(me.id);
      if (!vehicleIds.includes(id)) return res.status(403).json({ message: "Access denied" });
    }
    const asset = await storage.getVehicleAsset(id, assetId);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    const vals = await storage.getAssetValuations(assetId);
    res.json(vals);
  });

  app.post("/api/vehicles/:id/assets/:assetId/valuations", async (req, res) => {
    const id = parseInt(req.params.id);
    const assetId = parseInt(req.params.assetId);
    if (isNaN(id) || isNaN(assetId)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });
    if (!(await canManageVehicle(me, id))) {
      return res.status(403).json({ message: "Only admins or organization organizers can add valuations" });
    }
    const asset = await storage.getVehicleAsset(id, assetId);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    const { date, value, note } = req.body || {};
    if (!date) return res.status(400).json({ message: "date is required" });
    const d = new Date(String(date));
    if (isNaN(d.getTime())) return res.status(400).json({ message: "date must be a valid date (YYYY-MM-DD)" });
    if (value === undefined || value === null || value === "") return res.status(400).json({ message: "value is required" });
    const n = parseFloat(String(value));
    if (!isFinite(n) || n < 0) return res.status(400).json({ message: "value must be a non-negative number" });
    const v = await storage.addAssetValuation(assetId, { date: String(date), value: n.toFixed(2), note: note != null ? String(note) : "" });
    res.status(201).json(v);
  });

  app.delete("/api/vehicles/:id/assets/:assetId/valuations/:valuationId", async (req, res) => {
    const id = parseInt(req.params.id);
    const assetId = parseInt(req.params.assetId);
    const valuationId = parseInt(req.params.valuationId);
    if (isNaN(id) || isNaN(assetId) || isNaN(valuationId)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });
    if (!(await canManageVehicle(me, id))) {
      return res.status(403).json({ message: "Only admins or organization organizers can remove valuations" });
    }
    const removed = await storage.removeAssetValuation(assetId, valuationId);
    if (!removed) return res.status(404).json({ message: "Valuation not found" });
    res.json({ message: "Valuation removed" });
  });

  app.delete("/api/vehicles/:id/members/:memberId", async (req, res) => {
    const id = parseInt(req.params.id);
    const memberId = parseInt(req.params.memberId);
    if (isNaN(id) || isNaN(memberId)) return res.status(400).json({ message: "Invalid ID" });
    const me = await storage.getAccount(getAuthAccountId(req)!);
    if (!me) return res.status(401).json({ message: "Account not found" });

    if (!(await canManageVehicle(me, id))) {
      return res.status(403).json({ message: "Only admins or organization organizers can remove Vehicle investments" });
    }

    const removed = await storage.removeVehicleMemberById(id, memberId);
    if (!removed) return res.status(404).json({ message: "Vehicle member not found" });
    res.json({ message: "Member removed from Vehicle" });
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
    const [ownedEntities, managedEntities] = await Promise.all([
      storage.getEntityIdsOwnedByAccount(me.id),
      storage.getEntityIdsForAccount(me.id),
    ]);
    const entityIds = Array.from(new Set([...ownedEntities, ...managedEntities]));
    const investments = await storage.getPortfolio({ accountIds: [me.id], entityIds });
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

    const { ownerType, ownerAccountId, ownerEntityId, ownershipPercent } = req.body;
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
      String(pct)
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

  registerDocumentRoutes(app);
  registerCurrencyRoutes(app);

  return httpServer;
}
