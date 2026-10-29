import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/env.js";

describe("loadEnv", () => {
  it("throws naming ANTHROPIC_API_KEY when it is missing", () => {
    expect(() => loadEnv({ MONGODB_URI: "mongodb://localhost" })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("throws naming MONGODB_URI when it is missing", () => {
    expect(() => loadEnv({ ANTHROPIC_API_KEY: "k" })).toThrow(/MONGODB_URI/);
  });

  it("applies defaults and parses the CORS list", () => {
    const env = loadEnv({
      ANTHROPIC_API_KEY: "k",
      MONGODB_URI: "mongodb://localhost",
      CORS_ORIGINS: "http://a.test, http://b.test",
    });
    expect(env.PORT).toBe(3000);
    expect(env.ANTHROPIC_MODEL).toBe("claude-opus-5-5");
    expect(env.corsOrigins).toEqual(["http://a.test", "http://b.test"]);
  });
});
