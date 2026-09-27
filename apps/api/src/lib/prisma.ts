import { PrismaClient } from "@prisma/client";
import { config } from "../config.js";

export const prisma = new PrismaClient({
  log:
    config.NODE_ENV === "development"
      ? [{ emit: "event", level: "query" }, { emit: "stdout", level: "warn" }, { emit: "stdout", level: "error" }]
      : [{ emit: "stdout", level: "warn" }, { emit: "stdout", level: "error" }],
});
