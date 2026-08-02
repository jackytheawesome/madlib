# Чепуха

Веб-игра в духе Mad Libs: комната с друзьями, пропуски в текстах, смешной результат. Репозиторий: [jackytheawesome/madlib](https://github.com/jackytheawesome/madlib).

## Стек

- **Next.js + TypeScript + Tailwind** → деплой на **Vercel**
- Тексты в `content/templates/*.json` (в git, без отдельной БД)
- Админка: `/admin` (пароль из env)
- Мультиплеер комнат: следующий шаг (PartyKit / аналог рядом с Vercel)

## Локальный запуск

```bash
cp .env.example .env.local
npm install
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

Админка: [http://localhost:3000/admin](http://localhost:3000/admin)  
Пароль по умолчанию из `.env.example`: `chepuha`.

## Правила продукта (зафиксировано)

| Тема | Решение |
|------|---------|
| Название | Чепуха (место под лого на главной) |
| Язык UI | только RU |
| Лимит комнаты | 4 |
| Обычный режим | поля делятся случайно и равномерно |
| Диалоги | только шаблоны с `playerCount` = числу игроков в комнате; роли авто |
| После результата | другой текст (случайный или выбор типа/жанра) |
| Модерация слов | нет |
| Админка | веб, с логином |

## Контент

Формат шаблона — см. файлы в `content/templates/`.

- `monologue` / `story` — `segments` + `blanks`, `playerCount: null`
- `dialogue` — `roles`, `lines[]` с `speakerRole` / `addressRole`, обязательный `playerCount` 2–4

В админке `/admin/new` можно разметить текст маркерами `{{1}}`, задать подсказки и скачать JSON в `content/templates/`.

## Vercel

1. Импортируйте репозиторий в Vercel
2. Задайте `ADMIN_PASSWORD` и `ADMIN_SECRET`
3. Deploy

Комнаты с друзьями в realtime появятся после подключения PartyKit (или Ably) — UI лобби и игровой цикл уже заложены.
