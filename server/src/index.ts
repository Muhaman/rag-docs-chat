import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { createApp } from "./app.js";
import { LocalEmbedder } from "./embed/local.js";
import { loadEnv } from "./env.js";
import { createLogger } from "./logger.js";
import { ClaudeAnswerGenerator } from "./rag/answer.js";
import { MongoVectorStore } from "./store/mongo.js";

config({ path: ["../.env", ".env"], quiet: true });

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);

const embedder = new LocalEmbedder(env.MODEL_CACHE_DIR);
const store = await MongoVectorStore.connect(env.MONGODB_URI, env.MONGODB_DB, embedder.dim);
const generator = new ClaudeAnswerGenerator(
  new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }),
  env.ANTHROPIC_MODEL,
  store,
);

const app = createApp({ embedder, store, generator, corsOrigins: env.corsOrigins, logger });
const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, "server listening"));

function shutdown(): void {
  server.close(() => {
    void store.close().finally(() => process.exit(0));
  });
  server.closeAllConnections();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
