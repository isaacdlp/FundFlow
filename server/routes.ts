import type { Express, Request, Response } from "express";
import { type Server } from "http";
import http from "http";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const flaskPort = process.env.FLASK_PORT || "8000";

  app.all("/api/{*path}", (req: Request, res: Response) => {
    const options = {
      hostname: "127.0.0.1",
      port: parseInt(flaskPort),
      path: req.originalUrl,
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${flaskPort}`,
      },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on("error", (err) => {
      console.error("Proxy error:", err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: "Backend service unavailable" });
      }
    });

    req.pipe(proxyReq, { end: true });
  });

  return httpServer;
}
