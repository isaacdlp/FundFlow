import type { Express, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import crypto from "crypto";
import { eq, and, or, inArray, desc } from "drizzle-orm";
import { db, storage } from "./storage";
import {
  documents, appSettings, accounts, entities,
  type Document,
} from "@shared/schema";

const SETTING_KEY = "documents_storage_path";
const DEFAULT_PATH = path.resolve(process.cwd(), "uploads", "documents");

export async function getStoragePath(): Promise<string> {
  const row = await db.select().from(appSettings).where(eq(appSettings.key, SETTING_KEY)).limit(1);
  const configured = row[0]?.value?.trim();
  const target = configured && configured.length > 0 ? configured : DEFAULT_PATH;
  const resolved = path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
  if (!existsSync(resolved)) {
    mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

export async function setStoragePath(value: string): Promise<string> {
  const trimmed = (value ?? "").trim();
  await db.insert(appSettings)
    .values({ key: SETTING_KEY, value: trimmed })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: trimmed, updatedAt: new Date() } });
  return getStoragePath();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

function getAuthAccountId(req: Request): number | undefined {
  return (req.session as any).accountId ?? (req as any).apiAccountId;
}

function isAdminAccount(roles: { name: string }[]): boolean {
  return roles.some(r => r.name === "admin");
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const id = getAuthAccountId(req);
  if (!id) return res.status(401).json({ message: "Authentication required" });
  const acc = await storage.getAccount(id);
  if (!acc || !isAdminAccount(acc.roles)) return res.status(403).json({ message: "Admin access required" });
  (req as any).me = acc;
  next();
}

function sanitizeSegment(seg: string): string {
  return seg.replace(/[^A-Za-z0-9 _\-.()]/g, "_").trim();
}

function sanitizeFolderPath(folderPath: string): string {
  if (!folderPath) return "";
  return folderPath
    .split(/[\\/]+/)
    .map(s => s.trim())
    .filter(s => s && s !== "." && s !== "..")
    .map(sanitizeSegment)
    .filter(Boolean)
    .join("/");
}

async function enrichDoc(doc: Document) {
  let owner: { id: number; type: "account" | "entity"; name: string } | null = null;
  if (doc.accountId) {
    const a = await db.select().from(accounts).where(eq(accounts.id, doc.accountId)).limit(1);
    if (a[0]) owner = { id: a[0].id, type: "account", name: `${a[0].firstName} ${a[0].lastName}` };
  } else if (doc.entityId) {
    const e = await db.select().from(entities).where(eq(entities.id, doc.entityId)).limit(1);
    if (e[0]) owner = { id: e[0].id, type: "entity", name: e[0].name };
  }
  let uploader: { id: number; name: string } | null = null;
  if (doc.uploadedBy) {
    const u = await db.select().from(accounts).where(eq(accounts.id, doc.uploadedBy)).limit(1);
    if (u[0]) uploader = { id: u[0].id, name: `${u[0].firstName} ${u[0].lastName}` };
  }
  return { ...doc, owner, uploader };
}

async function visibleDocsForAccount(accountId: number): Promise<Document[]> {
  const acc = await storage.getAccount(accountId);
  if (!acc) return [];
  if (isAdminAccount(acc.roles)) {
    return db.select().from(documents).orderBy(desc(documents.createdAt));
  }
  const ownedEntityIds = await storage.getEntityIdsOwnedByAccount(accountId);
  const managedEntityIds = await storage.getEntityIdsForAccount(accountId);
  const entityIds = Array.from(new Set([...ownedEntityIds, ...managedEntityIds]));
  const conds: any[] = [eq(documents.accountId, accountId)];
  if (entityIds.length > 0) conds.push(inArray(documents.entityId, entityIds));
  return db.select().from(documents).where(or(...conds)).orderBy(desc(documents.createdAt));
}

export function registerDocumentRoutes(app: Express) {
  // Storage path settings — admin only
  app.get("/api/settings/documents-path", requireAdmin, async (_req, res) => {
    const row = await db.select().from(appSettings).where(eq(appSettings.key, SETTING_KEY)).limit(1);
    res.json({
      configured: row[0]?.value ?? "",
      effective: await getStoragePath(),
      default: DEFAULT_PATH,
    });
  });

  app.patch("/api/settings/documents-path", requireAdmin, async (req, res) => {
    const value = typeof req.body?.value === "string" ? req.body.value : "";
    try {
      const effective = await setStoragePath(value);
      res.json({ configured: value, effective });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "Failed to set storage path" });
    }
  });

  // List visible documents
  app.get("/api/documents", async (req, res) => {
    const me = getAuthAccountId(req);
    if (!me) return res.status(401).json({ message: "Authentication required" });
    const docs = await visibleDocsForAccount(me);
    const enriched = await Promise.all(docs.map(enrichDoc));
    res.json(enriched);
  });

  // Upload — admin only, multipart with `file`
  app.post("/api/documents", requireAdmin, upload.single("file"), async (req, res) => {
    const me = (req as any).me;
    const file = req.file;
    if (!file) return res.status(400).json({ message: "file is required (multipart field 'file')" });

    const name = (req.body.name?.toString().trim()) || file.originalname;
    const folderPath = sanitizeFolderPath(req.body.folderPath?.toString() ?? "");
    const ownerType = req.body.ownerType?.toString();
    const accountId = req.body.accountId ? parseInt(req.body.accountId.toString(), 10) : null;
    const entityId = req.body.entityId ? parseInt(req.body.entityId.toString(), 10) : null;

    if (ownerType !== "account" && ownerType !== "entity") {
      return res.status(400).json({ message: "ownerType must be 'account' or 'entity'" });
    }
    if (ownerType === "account" && (!accountId || isNaN(accountId))) {
      return res.status(400).json({ message: "accountId required when ownerType=account" });
    }
    if (ownerType === "entity" && (!entityId || isNaN(entityId))) {
      return res.status(400).json({ message: "entityId required when ownerType=entity" });
    }

    if (ownerType === "account") {
      const a = await db.select().from(accounts).where(eq(accounts.id, accountId!)).limit(1);
      if (!a[0]) return res.status(404).json({ message: "Account not found" });
    } else {
      const e = await db.select().from(entities).where(eq(entities.id, entityId!)).limit(1);
      if (!e[0]) return res.status(404).json({ message: "Entity not found" });
    }

    const root = await getStoragePath();
    const ownerSubdir = ownerType === "account" ? `accounts/${accountId}` : `entities/${entityId}`;
    const folderRel = folderPath ? `${ownerSubdir}/${folderPath}` : ownerSubdir;
    const fullDir = path.join(root, folderRel);
    await fs.mkdir(fullDir, { recursive: true });

    const ext = path.extname(file.originalname);
    const safeBase = sanitizeSegment(path.basename(file.originalname, ext)) || "file";
    const unique = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const storedFileName = `${safeBase}-${unique}${ext}`;
    const storedRel = `${folderRel}/${storedFileName}`;
    const storedAbs = path.join(root, storedRel);
    await fs.writeFile(storedAbs, file.buffer);

    let inserted;
    try {
      inserted = await db.insert(documents).values({
        name,
        folderPath,
        ownerType,
        accountId: ownerType === "account" ? accountId : null,
        entityId: ownerType === "entity" ? entityId : null,
        fileName: file.originalname,
        storedPath: storedRel,
        mimeType: file.mimetype || "",
        sizeBytes: file.size,
        uploadedBy: me.id,
      }).returning();
    } catch (e) {
      // Avoid leaking an orphan file if the DB insert fails.
      try { await fs.unlink(storedAbs); } catch { /* best-effort */ }
      throw e;
    }

    res.status(201).json(await enrichDoc(inserted[0]));
  });

  // Download
  app.get("/api/documents/:id/download", async (req, res) => {
    const me = getAuthAccountId(req);
    if (!me) return res.status(401).json({ message: "Authentication required" });
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });

    const docs = await visibleDocsForAccount(me);
    const doc = docs.find(d => d.id === id);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    const root = await getStoragePath();
    const abs = path.resolve(root, doc.storedPath);
    const rel = path.relative(root, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      return res.status(400).json({ message: "Invalid path" });
    }
    if (!existsSync(abs)) return res.status(410).json({ message: "File missing on disk" });

    res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${doc.fileName.replace(/"/g, "")}"`);
    res.sendFile(abs);
  });

  // Delete — admin only
  app.delete("/api/documents/:id", requireAdmin, async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
    const existing = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    if (!existing[0]) return res.status(404).json({ message: "Document not found" });

    const root = await getStoragePath();
    const abs = path.resolve(root, existing[0].storedPath);
    const rel = path.relative(root, abs);
    const inside = !rel.startsWith("..") && !path.isAbsolute(rel);
    try {
      if (inside && existsSync(abs)) await fs.unlink(abs);
    } catch (e) {
      console.error("[documents] failed to delete file:", e);
    }
    await db.delete(documents).where(eq(documents.id, id));
    res.json({ message: "Document deleted" });
  });
}
