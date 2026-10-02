# Chepuha.fun

Каталог браузерных игр на [chepuha.fun](https://chepuha.fun). Сейчас доступны «Чепуха» и карточка будущей игры.

| Адрес | Назначение |
| --- | --- |
| `/` | Каталог игр |
| `/chepuha` | Главная «Чепухи» |
| `/chepuha/room/<code>` | Игровая комната |
| `/chepuha/admin` | Админка шаблонов «Чепухи» |
| `/api/chepuha/...` | API «Чепухи» |

Старые `/room/<code>` и `/admin/...` перенаправляются на новые страницы. Прежние `/api/...` продолжают работать для уже открытых клиентов. Ключ игрока в sessionStorage, admin cookie и данные Neon сохранены.

Веб-игра в духе Mad Libs: комната с друзьями, пропуски в текстах, смешной результат. Репозиторий: [jackytheawesome/madlib](https://github.com/jackytheawesome/madlib).

## Стек

- **Next.js + TypeScript + Tailwind** → деплой на **Vercel**
- **Neon Postgres** → тексты и синхронизация комнат (до 4 игроков)
- Админка: `/chepuha/admin` (пароль из env)

## Локальный запуск

```bash
cp .env.example .env.local
npm install
npm run db:migrate
npm run dev:next
```

Откройте [http://localhost:3000](http://localhost:3000). Нужен `DATABASE_URL` (или `POSTGRES_URL`) — тот же Neon, что на Vercel.

Игра: [http://localhost:3000/chepuha](http://localhost:3000/chepuha). Админка: [http://localhost:3000/chepuha/admin](http://localhost:3000/chepuha/admin), пароль по умолчанию `chepuha`.

`npm run dev` по-прежнему поднимает и локальный PartyKit — для продакшена комнаты идут через Neon API, PartyKit не обязателен.

## Правила продукта

| Тема | Решение |
|------|---------|
| Название | Чепуха |
| Язык UI | только RU |
| Лимит комнаты | 4 |
| Обычный режим | поля делятся случайно и равномерно |
| Диалоги | только шаблоны с `playerCount` = числу игроков |
| Размер текста | маленький / средний / длинный |
| После результата | другой текст (случайный или выбор) |
| Модерация | нет |

## Контент

75 стартовых текстов: 3 типа × 5 жанров × 5 штук (с разным размером).

Перегенерация демо-набора:

```bash
npm run generate:templates
```

## Деплой

См. пошаговый релиз на свой домен: [docs/RELEASE.md](docs/RELEASE.md).

Кратко:

1. **Vercel** — репо `madlib`; Production → домен + БД `chepuha_prod`, Preview → тест `neondb`
2. Env: `ADMIN_PASSWORD`, `ADMIN_SECRET`, `DATABASE_URL`
3. Миграции: `ENV_FILE=.env.prod.local npm run db:migrate` / `db:seed`

Комнаты синхронизируются через Neon — отдельно PartyKit на проде не нужен.

## Проверка маршрутов

После `npm run build` и запуска `npm start`:

```bash
npm run check:routing
# Другой локальный порт или deployed URL:
npm run check:routing -- http://127.0.0.1:3100
```

Проверка не создаёт комнаты и не изменяет базу: проверяет страницы, сохранение старых ссылок и отказ API на некорректные/неавторизованные POST.
