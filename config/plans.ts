// Тарифные лимиты. Единственное место, где они задаются.
// null = без ограничений.

export type PlanKey = "free" | "pro" | "agency";

export type PlanLimits = {
  title: string;
  projects: number | null;
  watchedAccounts: number | null; // аккаунтов в разведке на проект
  analysesPerMonth: number | null; // разборов роликов через Claude в месяц
  members: number | null;
};

export const PLANS: Record<PlanKey, PlanLimits> = {
  free: { title: "Старт", projects: 5, watchedAccounts: 100, analysesPerMonth: 300, members: 5 },
  pro: { title: "Про", projects: 10, watchedAccounts: 300, analysesPerMonth: 2000, members: 10 },
  agency: { title: "Агентство", projects: null, watchedAccounts: 1000, analysesPerMonth: null, members: null },
};

export function getPlan(key: string): PlanLimits {
  return PLANS[key as PlanKey] ?? PLANS.free;
}
