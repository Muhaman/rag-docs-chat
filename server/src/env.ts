import { z } from "zod";

const schema = z
  .object({
    ANTHROPIC_API_KEY: z.string().min(1),
    ANTHROPIC_MODEL: z.string().min(1).default("claude-opus-5-5"),
    MONGODB_URI: z.string().min(1),
    MONGODB_DB: z.string().min(1).default("ragdocs"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    CORS_ORIGINS: z.string().default("http://localhost:5173"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    MODEL_CACHE_DIR: z.string().min(1).default(".model-cache"),
  })
  .transform((env) => ({
    ...env,
    corsOrigins: env.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  }));

export type Env = z.output<typeof schema>;

export function loadEnv(src: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(src);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment: ${problems.join("; ")}`);
  }
  return result.data;
}
