import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each test file gets its own process so we can reset module caches and
    // mock per-file. Costs a bit of startup time but isolates state cleanly.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Run sequentially — the integration tests share a database.
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "error",
    },
  },
});
