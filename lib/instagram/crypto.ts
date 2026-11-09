// Шифрование доступа к Instagram в базе (AES-256-GCM). Ключ — INSTAGRAM_TOKEN_KEY: 32 байта в base64.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(raw = process.env.INSTAGRAM_TOKEN_KEY): Buffer {
  const buffer = Buffer.from(raw ?? "", "base64");
  if (buffer.length !== 32) throw new Error("INSTAGRAM_TOKEN_KEY не задан или не 32 байта в base64");
  return buffer;
}

/** «iv.tag.данные» в base64url */
export function encryptToken(token: string, rawKey?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(rawKey), iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decryptToken(sealed: string, rawKey?: string): string {
  const [iv, tag, data] = sealed.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !data) throw new Error("Повреждённый токен Instagram");
  const decipher = createDecipheriv("aes-256-gcm", key(rawKey), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
