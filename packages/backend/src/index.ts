/**
 * NZi Agent Web — Backend Entry Point (Phase 1 Bootstrap)
 *
 * HTTP server skeleton with lazy Prisma connection.
 * Database is connected on first request, not at startup,
 * so the server can boot even without PostgreSQL running.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../../../.env") });

const fastify = Fastify({
  logger: { level: process.env.NODE_ENV === "production" ? "info" : "debug" },
});

const prisma = new PrismaClient({ log: ["error", "warn"] });
let dbConnected = false;

async function ensureDb() {
  if (dbConnected) return;
  try {
    await prisma.$connect();
    dbConnected = true;
    fastify.log.info("Connected to PostgreSQL");
  } catch (err) {
    fastify.log.warn({ err }, "Database not available yet");
  }
}

// ─── Plugins ───────────────────────────────────────────────────────

await fastify.register(helmet);
await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true,
});

// ─── Health Routes ─────────────────────────────────────────────────

fastify.get("/health", async () => {
  await ensureDb();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", db: "healthy", timestamp: new Date().toISOString() };
  } catch {
    return { status: "ok", db: "unavailable", timestamp: new Date().toISOString() };
  }
});

fastify.get("/ready", async () => ({ ready: true }));

// ─── API Routes (Phase 1 placeholders) ────────────────────────────

fastify.get("/api/health", async () => ({
  status: "ok",
  service: "nzi-backend",
  version: "0.1.0",
}));

fastify.get("/api/ready", async () => {
  await ensureDb();
  return { ready: dbConnected };
});

// ─── Start ─────────────────────────────────────────────────────────

const start = async () => {
  try {
    const port = Number(process.env.PORT || 4000);
    const host = process.env.HOST || "0.0.0.0";
    await fastify.listen({ port, host });
    console.log(`🚀 NZi Backend running at http://${host}:${port}`);
  } catch (err) {
    console.error("Failed to start:", err);
    process.exit(1);
  }
};

start();
