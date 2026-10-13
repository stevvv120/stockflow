import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { DB_NAME: "stockflow_test" },
    fileParallelism: false,
    include: ["src/services/salesService/test.ts"],
  },
});