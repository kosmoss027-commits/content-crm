// Подставляет пароль базы в DATABASE_URL и DIRECT_URL в .env вместо [YOUR-PASSWORD].
// Запуск: npm run db:password. Пароль вводится скрыто и никуда, кроме .env, не попадает.
import { readFileSync, writeFileSync } from "node:fs";
import { stdin, stdout } from "node:process";

const ENV_PATH = ".env";
const PLACEHOLDER = "[YOUR-PASSWORD]";

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(prompt);
    let value = "";
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") process.exit(1); // Ctrl+C
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on("data", onData);
  });
}

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
