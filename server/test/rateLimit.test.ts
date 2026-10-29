import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { makeDeps } from "./fakes.js";

describe("rate limiting", () => {
  it("returns a 429 JSON error once the limit is exceeded", async () => {
    const app = createApp(makeDeps({ rateLimitPerMinute: 1 }));
    expect((await request(app).get("/healthz")).status).toBe(200);
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: { code: "rate_limited", message: "Too many requests." } });
  });
});
