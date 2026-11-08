// Балансы внешних сервисов: пороги и ссылки на пополнение. Единственное место, где они задаются.

/** Ниже этого остатка на OpenRouter, $, вверху сайта появляется предупреждение */
export const LOW_BALANCE_USD = 1;

/** Стартовый подарок Deepgram, $ (их API не отдаёт баланс обычному ключу — считаем расход сами) */
export const DEEPGRAM_FREE_CREDIT_USD = 200;

/** Балансы кэшируются на N секунд, чтобы не дёргать сервисы на каждой странице */
export const BALANCE_CACHE_SECONDS = 300;

export const BILLING_LINKS = {
  openrouter: "https://openrouter.ai/settings/credits",
  apify: "https://console.apify.com/billing",
  deepgram: "https://console.deepgram.com/",
};
