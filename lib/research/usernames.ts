// Разбор списка аккаунтов, вставленного пользователем: ники, @ники, ссылки, по одному в строке или через запятую.

const USERNAME = /^[a-z0-9._]{1,30}$/;
const RESERVED = new Set(["p", "reel", "reels", "stories", "explore", "accounts"]);

export type ParsedUsernames = { valid: string[]; invalid: string[] };

export function parseUsernames(input: string): ParsedUsernames {
  const valid = new Set<string>();
  const invalid: string[] = [];

  for (const raw of input.split(/[\s,;]+/)) {
    const token = raw.trim();
    if (!token) continue;
    const fromUrl = token.match(/instagram\.com\/([^/?#\s]+)/i)?.[1];
    const candidate = (fromUrl ?? token).replace(/^@/, "").toLowerCase();
    if (USERNAME.test(candidate) && !RESERVED.has(candidate)) valid.add(candidate);
    else invalid.push(token);
  }

  return { valid: [...valid], invalid };
}
