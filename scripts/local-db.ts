// Локальная база PostgreSQL для разработки и тестов, без Docker и без Supabase.
// Запуск: npm run db:local (держите окно открытым, пока работаете).
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PORT = 54329;
const DATA_DIR = path.join(process.cwd(), ".local-db");
const DATABASES = ["content_crm", "content_crm_test"];

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: true,
    // Без этого на русской Windows база создаётся в WIN1251 и не принимает часть символов
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });

  if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    await pg.initialise();
  }
  await pg.start();

  for (const name of DATABASES) {
    try {
      await pg.createDatabase(name);
    } catch {
      // база уже есть
    }
  }

  console.log(`Локальная база запущена: postgresql://postgres:postgres@localhost:${PORT}/content_crm`);

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => {
  console.error("Не удалось запустить локальную базу:", error);
  process.exit(1);
});
