import fp from "fastify-plugin";
import jwt from "jsonwebtoken";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import type { UserRole } from "@prisma/client";
import { verifyAccessToken } from "../lib/jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      id: string;
      role: UserRole;
      hipaaTenant: boolean;
    };
  }
  interface FastifyInstance {
    requireAuth: preHandlerAsyncHookHandler;
    requireRole: (...roles: UserRole[]) => preHandlerAsyncHookHandler;
  }
}

const authPlugin: FastifyPluginAsync = async (app) => {
  const requireAuth: preHandlerAsyncHookHandler = async (req, reply) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return unauth(reply, "missing_token");
    }
    const token = header.slice("Bearer ".length).trim();
    try {
      const claims = verifyAccessToken(token);
      req.user = { id: claims.sub, role: claims.role, hipaaTenant: claims.hipaaTenant };
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) return unauth(reply, "token_expired");
      return unauth(reply, "invalid_token");
    }
  };

  const requireRole = (...roles: UserRole[]): preHandlerAsyncHookHandler => async (req, reply) => {
    if (!req.user) return unauth(reply, "missing_token");
    if (!roles.includes(req.user.role)) {
      return reply.code(403).send({ error: "forbidden", message: "role not permitted for this action" });
    }
  };

  app.decorate("requireAuth", requireAuth);
  app.decorate("requireRole", requireRole);
};

function unauth(reply: FastifyReply, code: string) {
  return reply.code(401).send({ error: code });
}

export default fp(authPlugin, { name: "medivault-auth" });
