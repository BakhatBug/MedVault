import { Redis } from "ioredis";
import { config } from "../config.js";

// `maxRetriesPerRequest: null` is required by BullMQ — see its docs.
// We share one connection across the worker AND the queue producer; in prod
// we'd consider separate connections to isolate command vs blocking traffic.
export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
