import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL не задан: тесты работают с отдельной тестовой базой.");
}

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    env: { DATABASE_URL: testDatabaseUrl, DIRECT_URL: testDatabaseUrl },
  },
});
