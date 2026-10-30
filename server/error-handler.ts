import type { NextFunction, Request, Response } from "express";

/**
 * Last-resort Express error handler. A 4xx carries a message about the request
 * (bad JSON, file too large…) and is passed on as is; a 5xx message is internal
 * detail — e.g. Drizzle's "Failed query: <sql> params: <values>" — so the
 * client only gets a generic one and the details go to the server log.
 */
export function errorHandler(err: any, _req: Request, res: Response, next: NextFunction) {
  const status = Number(err?.status || err?.statusCode) || 500;

  if (status >= 500) {
    console.error("Internal Server Error:", err);
  }

  if (res.headersSent) {
    return next(err);
  }

  const message = status >= 500 ? "Internal Server Error" : err?.message || "Bad Request";
  return res.status(status).json({ message });
}
