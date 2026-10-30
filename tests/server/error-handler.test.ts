import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { errorHandler } from "../../server/error-handler";

function appThrowing(err: unknown) {
  const app = express();
  app.use(express.json());
  app.get("/boom", () => { throw err; });
  app.post("/echo", (req, res) => { res.json(req.body); });
  app.use(errorHandler);
  return app;
}

describe("errorHandler", () => {
  afterEach(() => vi.restoreAllMocks());

  it("hides a 5xx error's details from the client and logs them", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error('Failed query: insert into "accounts" ("email", "password_hash") values ($1, $2) params: a@b.c,$2b$10$hash');
    const res = await request(appThrowing(err)).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "Internal Server Error" });
    expect(JSON.stringify(res.body)).not.toMatch(/hash|insert/);
    expect(log).toHaveBeenCalledWith("Internal Server Error:", err);
  });

  it("hides the message of an explicit 5xx status too", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(appThrowing(Object.assign(new Error("upstream secret"), { status: 502 }))).get("/boom");
    expect(res.status).toBe(502);
    expect(res.body.message).toBe("Internal Server Error");
  });

  it("passes a 4xx message through without logging it as a server error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(appThrowing(null))
      .post("/echo")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.message).toBeTruthy();
    expect(res.body.message).not.toBe("Internal Server Error");
    expect(log).not.toHaveBeenCalled();
  });
});
