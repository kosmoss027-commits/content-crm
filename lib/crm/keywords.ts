// Кодовые слова: нормализация и поиск в тексте комментария. Чистые функции, без базы.

const WORD_RE = /^[\p{L}\p{N}-]{2,30}$/u;

/** «#путь » → «ПУТЬ». null — не похоже на кодовое слово. */
export function normalizeWord(raw: string): string | null {
  const word = raw.trim().replace(/^[#«"']+|[»"'.!]+$/g, "").toLocaleUpperCase("ru");
  return WORD_RE.test(word) ? word : null;
}

/** «@Amin.Blog » → «amin.blog» */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Какие слова из списка есть в тексте целиком (не как часть другого слова). Регистр не важен, «ё» = «е». */
export function findKeywords(text: string, words: string[]): string[] {
  const haystack = text.toLocaleUpperCase("ru").replace(/Ё/g, "Е");
  return words.filter((word) => {
    const needle = escape(word.replace(/Ё/g, "Е"));
    return new RegExp(`(?<![\\p{L}\\p{N}])${needle}(?![\\p{L}\\p{N}])`, "u").test(haystack);
  });
}
