// Подставляет пароль базы в DATABASE_URL и DIRECT_URL в .env вместо [YOUR-PASSWORD].
// Запуск: npm run db:password. Пароль вводится скрыто и никуда, кроме .env, не попадает.
import { readFileSync, writeFileSync } from "node:fs";
import { readHidden } from "./read-hidden";

const ENV_PATH = ".env";
const PLACEHOLDER = "[YOUR-PASSWORD]";

async function main() {
  const env = readFileSync(ENV_PATH, "utf8");
  if (!env.includes(PLACEHOLDER)) {
    console.log(`В ${ENV_PATH} нет ${PLACEHOLDER} — пароль уже вписан.`);
    return;
  }

  const password = (await readHidden("Вставьте пароль базы Supabase (символы не отображаются) и нажмите Enter: ")).trim();
  if (!password) {
    console.log("Пароль пустой, ничего не изменено.");
    process.exit(1);
  }

  // В адресе подключения спецсимволы пароля нужно закодировать.
  writeFileSync(ENV_PATH, env.split(PLACEHOLDER).join(encodeURIComponent(password)));
  console.log("Готово: пароль вписан в DATABASE_URL и DIRECT_URL.");
}

main();
