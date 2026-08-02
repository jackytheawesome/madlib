# Чепуха

Веб-игра в духе Mad Libs: комната с друзьями, пропуски в текстах, смешной результат. Репозиторий: [jackytheawesome/madlib](https://github.com/jackytheawesome/madlib).

## Стек

- **Next.js + TypeScript + Tailwind** → деплой на **Vercel**
- **PartyKit** → realtime-комнаты (до 4 игроков)
- Тексты в `content/templates/*.json` (в git, без отдельной БД)
- Админка: `/admin` (пароль из env)

## Локальный запуск

```bash
cp .env.example .env.local
npm install
npm run dev
```

Поднимутся Next.js и PartyKit (`127.0.0.1:1999`). Откройте [http://localhost:3000](http://localhost:3000).

Админка: [http://localhost:3000/admin](http://localhost:3000/admin), пароль по умолчанию `chepuha`.

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

1. **Vercel** — импорт репо `madlib`, env: `ADMIN_PASSWORD`, `ADMIN_SECRET`, `NEXT_PUBLIC_PARTYKIT_HOST`
2. **PartyKit** — один раз:

```bash
npx partykit login
npm run deploy:party
```

В `NEXT_PUBLIC_PARTYKIT_HOST` на Vercel укажите хост из вывода деплоя (без `https://`).

После этого комнаты с друзьями работают на проде.
