import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Liveness — does the process answer? Used by load balancer.
  app.get("/healthz", async () => ({ status: "ok", uptime: process.uptime() }));

  // Readiness — are downstream deps reachable? Used by k8s readiness probe.
  app.get("/readyz", async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ready", checks: { database: "ok" } };
    } catch (err) {
      app.log.error({ err }, "readiness check failed");
      return reply.code(503).send({ status: "not_ready", checks: { database: "fail" } });
    }
  });
}
