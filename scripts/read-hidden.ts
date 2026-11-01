import { stdin, stdout } from "node:process";

/** Читает строку из терминала, не показывая вводимые символы. */
export function readHidden(prompt: string): Promise<string> {
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
