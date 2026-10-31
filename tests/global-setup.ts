import { execSync } from "node:child_process";

// Перед тестами накатываем миграции на тестовую базу.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}
