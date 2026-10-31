# Content CRM

Контент-завод и CRM для контент-маркетолога. Ход работ и принятые решения — в [PROGRESS.md](PROGRESS.md).

## Быстрый старт
```
npm install
cp .env.example .env    # и заполнить
npm run db:local        # локальный PostgreSQL, держать окно открытым
npm run db:migrate
npm run db:seed
npm run dev
```

## Команды
| Команда | Что делает |
|---|---|
| `npm run dev` | приложение на http://localhost:3000 |
| `npm test` | автотесты (нужна `TEST_DATABASE_URL`) |
| `npm run typecheck` / `npm run lint` | проверки кода |
| `npm run db:migrate` | новая миграция после правки `prisma/schema.prisma` |
| `npm run db:deploy` | применить миграции на сервере |
| `npm run db:seed` | тестовые пользователи и проекты |

## Где что лежит
- `lib/db/` — весь доступ к данным, с проверкой пространства и роли. Только через него.
- `lib/auth/permissions.ts` — права ролей; `lib/navigation.ts` — разделы меню.
- `config/plans.ts` — тарифные лимиты.
- `app/(auth)` — вход и регистрация; `app/(app)/p/[projectId]` — приложение внутри проекта.
