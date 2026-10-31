import "dotenv/config";
import { defineConfig } from "prisma/config";

// Миграции идут через прямое подключение (DIRECT_URL), приложение — через пул (DATABASE_URL).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
