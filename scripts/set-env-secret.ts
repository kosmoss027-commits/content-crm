// Записывает секрет (токен, ключ) в .env, не показывая его на экране.
// Запуск: npm.cmd run set-secret APIFY_TOKEN
import { readFileSync, writeFileSync } from "node:fs";
import { readHidden } from "./read-hidden";

const ENV_PATH = ".env";
const NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

async function main() {
  const name = process.argv[2];
  if (!name || !NAME_PATTERN.test(name)) {
    console.log("Укажите имя переменной, например: npm.cmd run set-secret APIFY_TOKEN");
    process.exit(1);
  }

  const value = (await readHidden(`Вставьте значение ${name} (символы не отображаются) и нажмите Enter: `)).trim();
  if (!value) {
    console.log("Пусто, ничего не изменено.");
    process.exit(1);
  }

  const env = readFileSync(ENV_PATH, "utf8");
  const line = `${name}="${value.replace(/"/g, '\\"')}"`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  const next = pattern.test(env) ? env.replace(pattern, () => line) : `${env.trimEnd()}\n${line}\n`;
  writeFileSync(ENV_PATH, next);
  console.log(`Готово: ${name} записан в .env.`);
}

main();
