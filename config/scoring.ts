// Рейтинг аккаунта в разведке. Формулу можно менять здесь, остальной код её только вызывает.

export type RatingInput = {
  reelsCount: number; // роликов с посчитанным множителем
  viralCount: number; // из них залётов
  avgViralMultiplier: number | null; // средний множитель залётов
};

/**
 * Рейтинг = доля залётов × средний множитель залётов × 10.
 * Пример: 3 залёта из 30 роликов со средним ×5 → 0.1 × 5 × 10 = 5.
 * Если роликов мало (меньше 10), рейтинг не считаем — статистика случайна.
 */
export function accountRating({ reelsCount, viralCount, avgViralMultiplier }: RatingInput): number | null {
  if (reelsCount < 10) return null;
  if (viralCount === 0 || avgViralMultiplier === null) return 0;
  const share = viralCount / reelsCount;
  return Math.round(share * avgViralMultiplier * 10 * 10) / 10;
}
