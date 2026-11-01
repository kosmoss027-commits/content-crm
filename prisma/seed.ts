// Тестовые данные: 2 пространства, 4 проекта, 4 пользователя с разными ролями.
// Запуск: npm run db:seed. Для входа под ними локально включите DEV_AUTH=1 в .env.
// Удаляет и пересоздаёт только своих тестовых пользователей и их пространства.
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { recomputeAccount } from "@/lib/research/ingest";

const USERS = [
  { id: "00000000-0000-4000-8000-000000000001", email: "amin@example.com", name: "Амин (владелец)" },
  { id: "00000000-0000-4000-8000-000000000002", email: "smm@example.com", name: "Света (SMM)" },
  { id: "00000000-0000-4000-8000-000000000003", email: "manager@example.com", name: "Олег (менеджер)" },
  { id: "00000000-0000-4000-8000-000000000004", email: "other@example.com", name: "Чужой маркетолог" },
];

async function main() {
  const seedUserIds = USERS.map((u) => u.id);
  await prisma.workspace.deleteMany({ where: { memberships: { some: { userId: { in: seedUserIds } } } } });
  await prisma.user.deleteMany({ where: { id: { in: seedUserIds } } });

  await prisma.user.createMany({ data: USERS });
  const [amin, smm, manager, other] = USERS;

  const aminWorkspace = await prisma.workspace.create({
    include: { projects: { orderBy: { createdAt: "asc" } } },
    data: {
      name: "Пространство Амина",
      memberships: {
        create: [
          { userId: amin.id, role: "OWNER" },
          { userId: smm.id, role: "SMM" },
          { userId: manager.id, role: "MANAGER" },
        ],
      },
      projects: {
        create: [
          { name: "Мой блог", color: "#6366f1" },
          { name: "Клиент: автоподбор", color: "#22c55e" },
          { name: "Клиент: мясо", color: "#ef4444" },
        ],
      },
    },
  });

  await prisma.workspace.create({
    data: {
      name: "Чужое пространство",
      memberships: { create: [{ userId: other.id, role: "OWNER" }] },
      projects: { create: [{ name: "Чужой проект", color: "#f59e0b" }] },
    },
  });

  await seedResearch(aminWorkspace.id, aminWorkspace.projects[0].id);
  console.log("Тестовые данные созданы:", USERS.map((u) => u.email).join(", "));
}

/** Выдуманные аккаунты и ролики для разведки — чтобы смотреть экраны без расходов на Apify. */
async function seedResearch(workspaceId: string, projectId: string) {
  const DEMO = [
    { username: "demo_marketer", market: "CIS" as const, niche: "маркетинг", base: 3000, viral: [9, 25] },
    { username: "demo_reels_pro", market: "CIS" as const, niche: "reels", base: 12000, viral: [4] },
    { username: "demo_foreign", market: "FOREIGN" as const, niche: "бизнес", base: 80000, viral: [3.5, 12] },
  ];
  await prisma.scrapedAccount.deleteMany({ where: { username: { in: DEMO.map((d) => d.username) } } });

  const day = 24 * 60 * 60 * 1000;
  for (const demo of DEMO) {
    const account = await prisma.scrapedAccount.create({
      data: { username: demo.username, fullName: `Демо ${demo.username}`, followers: demo.base * 10, lastScrapedAt: new Date() },
    });
    await prisma.watchlistEntry.create({
      data: { workspaceId, projectId, accountId: account.id, market: demo.market, niche: demo.niche },
    });
    const reels = Array.from({ length: 20 }, (_, i) => ({ views: Math.round(demo.base * (0.7 + (i % 5) * 0.15)), daysAgo: 3 + i * 2 }));
    demo.viral.forEach((x, i) => reels.push({ views: Math.round(demo.base * x), daysAgo: i + 1 }));
    await prisma.scrapedReel.createMany({
      data: reels.map((r, i) => ({
        shortCode: `${demo.username}_${i}`,
        accountId: account.id,
        url: `https://www.instagram.com/${demo.username}/`,
        postedAt: new Date(Date.now() - r.daysAgo * day),
        caption: `Демо-ролик №${i + 1}: хук, который цепляет с первой секунды`,
        views: r.views,
        likes: Math.round(r.views * 0.05),
        comments: Math.round(r.views * 0.004),
        durationSec: 15 + (i % 4) * 15,
      })),
    });
    await recomputeAccount(account.id);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
