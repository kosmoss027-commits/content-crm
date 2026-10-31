// Разделы приложения: меню, заголовки, доступ по ролям и этап, на котором раздел появится.
import type { Role } from "@/lib/generated/prisma/enums";
import { SECTION_ROLES } from "@/lib/auth/permissions";

export type SectionGroup = "factory" | "crm" | "system";

export type IconName =
  | "sun"
  | "telescope"
  | "radar"
  | "scroll"
  | "map"
  | "layout-dashboard"
  | "calendar"
  | "chart"
  | "key"
  | "inbox"
  | "users"
  | "flame"
  | "check-square"
  | "user-cog"
  | "settings";

export type Section = {
  slug: string;
  title: string;
  description: string;
  group: SectionGroup;
  icon: IconName;
  stage: number; // этап разработки, на котором раздел заработает
  roles: Role[];
};

export const GROUP_TITLES: Record<SectionGroup, string> = {
  factory: "Контент-завод",
  crm: "CRM",
  system: "Пространство",
};

export const SECTIONS: Section[] = [
  { slug: "today", title: "Сегодня", description: "Сценарии по статусам, одобрение и правки для Claude.", group: "factory", icon: "sun", stage: 3, roles: SECTION_ROLES.content },
  { slug: "research", title: "Разведка", description: "Отслеживаемые аккаунты, залетевшие ролики, хуки, что работает, гипотезы.", group: "factory", icon: "telescope", stage: 2, roles: SECTION_ROLES.content },
  { slug: "trends", title: "Радар трендов", description: "Аномальные залёты за последние 24–72 часа.", group: "factory", icon: "radar", stage: 2, roles: SECTION_ROLES.content },
  { slug: "scripts", title: "Сценарии", description: "Сценарии из разборов, хуков и трендов по вашему шаблону.", group: "factory", icon: "scroll", stage: 3, roles: SECTION_ROLES.content },
  { slug: "brand", title: "Карта бренда", description: "Автор, ниша, аудитория, продукты, тон и банк приёмов.", group: "factory", icon: "map", stage: 3, roles: SECTION_ROLES.content },

  { slug: "summary", title: "Сводка", description: "Главное за сегодня и неделю: что выложить, задачи, лиды, залёты.", group: "crm", icon: "layout-dashboard", stage: 6, roles: SECTION_ROLES.everyone },
  { slug: "content-plan", title: "Контент-план", description: "План публикаций по площадкам: неделя, месяц, список.", group: "crm", icon: "calendar", stage: 4, roles: SECTION_ROLES.content },
  { slug: "stats", title: "Статистика", description: "Просмотры, охват, вовлечённость, лучшие и слабые публикации.", group: "crm", icon: "chart", stage: 4, roles: SECTION_ROLES.content },
  { slug: "keywords", title: "Кодовые слова", description: "Кодовые слова → лиды → оплаты → выручка.", group: "crm", icon: "key", stage: 5, roles: SECTION_ROLES.sales },
  { slug: "leads", title: "Заявки", description: "Входящие лиды до квалификации.", group: "crm", icon: "inbox", stage: 5, roles: SECTION_ROLES.sales },
  { slug: "clients", title: "Клиенты", description: "Контакты, источник, оплаты, заметки и история.", group: "crm", icon: "users", stage: 5, roles: SECTION_ROLES.sales },
  { slug: "warmups", title: "Прогревы", description: "Кампании прогрева, календарь на 3 месяца, рубрики и смыслы.", group: "crm", icon: "flame", stage: 6, roles: SECTION_ROLES.content },
  { slug: "tasks", title: "Задачи", description: "Задачи с дедлайном, исполнителем и привязкой к публикации или клиенту.", group: "crm", icon: "check-square", stage: 6, roles: SECTION_ROLES.everyone },

  { slug: "team", title: "Команда", description: "Участники пространства и их роли.", group: "system", icon: "user-cog", stage: 1, roles: SECTION_ROLES.everyone },
  { slug: "settings", title: "Настройки", description: "Проекты, тариф и лимиты.", group: "system", icon: "settings", stage: 1, roles: SECTION_ROLES.owner },
];

export function findSection(slug: string): Section | undefined {
  return SECTIONS.find((section) => section.slug === slug);
}

export function sectionsForRole(role: Role): Section[] {
  return SECTIONS.filter((section) => section.roles.includes(role));
}

export function canOpenSection(role: Role, slug: string): boolean {
  return findSection(slug)?.roles.includes(role) ?? false;
}

/** Первый раздел, который роль видит: туда ведём после входа. */
export function homeSectionFor(role: Role): string {
  return sectionsForRole(role)[0]?.slug ?? "team";
}
