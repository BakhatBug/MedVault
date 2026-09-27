import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import authPlugin from "./plugins/auth.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { recordsRoutes } from "./routes/records.js";
import { emergencyRoutes } from "./routes/emergency.js";
import { meRoutes } from "./routes/me.js";
import { accessRoutes } from "./routes/access.js";
import { patientsRoutes } from "./routes/patients.js";
import { medicationsRoutes } from "./routes/medications.js";
import { timelineRoutes } from "./routes/timeline.js";
import { caregiversRoutes } from "./routes/caregivers.js";
import { ensureBucket } from "./services/storage.js";
import { startExtractionWorker, stopExtractionWorker } from "./queues/extraction.js";

// Type guard for Zod errors that's robust across zod v3/v4 module duplication.
// We can't trust `instanceof ZodError` when multiple zod copies end up in the
// dependency tree (e.g., when consumer pkg pulls zod 3 and dep pulls zod 4).
function isZodError(err: unknown): err is { name: "ZodError"; issues: Array<{ path: (string | number)[]; message: string; code: string }> } {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "ZodError" &&
    Array.isArray((err as { issues?: unknown }).issues)
  );
}

async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: true,
    bodyLimit: 1 * 1024 * 1024, // 1 MB — file uploads bypass the API entirely (S3 pre-signed)
    requestIdHeader: "x-request-id",
  });

  // Must be set BEFORE plugin registrations — Fastify captures the handler in
  // the encapsulated child scope at register time, so plugins registered before
  // setErrorHandler use the default handler.
  app.setErrorHandler((err: any, req, reply) => {
    if (isZodError(err)) {
      req.log.info({ issues: err.issues }, "validation error");
      return reply.code(400).send({
        error: "validation_error",
        issues: err.issues.map((i) => ({ path: i.path, message: i.message, code: i.code })),
      });
    }
    if (err.validation) {
      return reply.code(400).send({ error: "validation_error", details: err.validation });
    }
    req.log.error({ err }, "request error");
    return reply.code(err.statusCode ?? 500).send({
      error: err.code ?? "internal_error",
      message: config.NODE_ENV === "production" ? "An error occurred" : err.message,
    });
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.NODE_ENV === "development" ? true : false,
    credentials: true,
  });
  await app.register(sensible);
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    // Auth routes get a tighter limit applied per-route in v0.2 (5/15min per spec §10.1).
  });
  await app.register(authPlugin);

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/v1" });
  await app.register(recordsRoutes, { prefix: "/v1" });
  await app.register(emergencyRoutes, { prefix: "/v1" });
  await app.register(meRoutes, { prefix: "/v1" });
  await app.register(accessRoutes, { prefix: "/v1" });
  await app.register(patientsRoutes, { prefix: "/v1" });
  await app.register(medicationsRoutes, { prefix: "/v1" });
  await app.register(timelineRoutes, { prefix: "/v1" });
  await app.register(caregiversRoutes, { prefix: "/v1" });

  return app;
}

async function main() {
  const app = await buildApp();

  await ensureBucket();
  startExtractionWorker();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutdown initiated");
    try {
      await app.close();
      await stopExtractionWorker();
      await prisma.$disconnect();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "shutdown failed");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ port: config.API_PORT, host: config.API_HOST });
  } catch (err) {
    app.log.fatal({ err }, "server failed to start");
    process.exit(1);
  }
}

main();
