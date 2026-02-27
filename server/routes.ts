import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { insertAccountSchema, updateAccountSchema } from "@shared/schema";
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

  return httpServer;
}
