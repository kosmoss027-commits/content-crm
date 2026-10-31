// Тестовые данные: 2 пространства, 4 проекта, 4 пользователя с разными ролями.
// Запуск: npm run db:seed. Для входа под ними локально включите DEV_AUTH=1 в .env.
// Удаляет и пересоздаёт только своих тестовых пользователей и их пространства.
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";

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

  await prisma.workspace.create({
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

  console.log("Тестовые данные созданы:", USERS.map((u) => u.email).join(", "));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
