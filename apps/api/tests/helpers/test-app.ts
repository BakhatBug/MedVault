import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import authPlugin from "../../src/plugins/auth.js";
import { healthRoutes } from "../../src/routes/health.js";
import { authRoutes } from "../../src/routes/auth.js";
import { recordsRoutes } from "../../src/routes/records.js";
import { emergencyRoutes } from "../../src/routes/emergency.js";
import { meRoutes } from "../../src/routes/me.js";
import { accessRoutes } from "../../src/routes/access.js";
import { patientsRoutes } from "../../src/routes/patients.js";
import { medicationsRoutes } from "../../src/routes/medications.js";
import { timelineRoutes } from "../../src/routes/timeline.js";
import { caregiversRoutes } from "../../src/routes/caregivers.js";

// Mirrors apps/api/src/server.ts but without the rate-limit plugin, the
// extraction worker, or the listen call. Tests use Fastify's `inject` API to
// synthesize requests — no port binding needed.
//
// We skip @fastify/rate-limit so the per-IP buckets don't cause flaky tests
// when we hit the same endpoint many times in a row.

function isZodError(err: unknown): err is { name: "ZodError"; issues: Array<{ path: (string | number)[]; message: string; code: string }> } {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "ZodError" &&
    Array.isArray((err as { issues?: unknown }).issues)
  );
}

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: true });

  app.setErrorHandler((err, _req, reply) => {
    if (isZodError(err)) {
      return reply.code(400).send({
        error: "validation_error",
        issues: err.issues.map((i) => ({ path: i.path, message: i.message, code: i.code })),
      });
    }
    if (err.validation) {
      return reply.code(400).send({ error: "validation_error", details: err.validation });
    }
    return reply.code(err.statusCode ?? 500).send({
      error: err.code ?? "internal_error",
      message: err.message,
    });
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(sensible);
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

  await app.ready();
  return app;
}
