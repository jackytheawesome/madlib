# Релиз «Чепухи» на свой домен

Текущий прод-стенд на Vercel: https://madlib-snowy.vercel.app  
Тест: Preview-деплои и локально (`neondb`). Прод-данные: база Neon `chepuha_prod`.

## 1. Купить и привязать домен (нужно ваше действие)

Vercel **не даёт агенту** купить домен без интерактива. Сделайте один раз у себя в терминале:

```bash
cd ~/Projects/madlib
npx vercel domains buy chepuha.dev
# или другой: chepuha.app / chepuha.xyz — смотрите цены: npx vercel domains search chepuha
```

Либо в браузере: https://vercel.com/dashboard/domains

Затем привяжите к проекту:

```bash
npx vercel domains add chepuha.dev madlib
npx vercel domains verify chepuha.dev
```

Если домен куплен не у Vercel — в панели регистратора пропишите DNS, которые покажет Vercel (Settings → Domains).

После выпуска HTTPS сайт откроется на `https://chepuha.dev`.

## 2. База (уже сделано)

| Среда | Neon database | Назначение |
|-------|---------------|------------|
| Production (Vercel) | `chepuha_prod` | игроки / релиз |
| Preview + Development + local | `neondb` | тест |

Пересид прода:

```bash
ENV_FILE=.env.prod.local npx tsx scripts/db-seed.ts
```

(файл `.env.prod.local` локальный, в git не попадает)

## 3. Env (уже разведено)

- **Production:** `DATABASE_*` → `chepuha_prod`, отдельный `ADMIN_PASSWORD` / `ADMIN_SECRET`
- **Preview / Development:** тестовая `neondb` + прежние admin-секреты

После смены env нужен redeploy Production:

```bash
npx vercel --prod
```

Прод-пароль админки задаётся в Vercel → Environment Variables → `ADMIN_PASSWORD` (Production). Тестовый пароль на Preview остаётся прежним (`chepuha` / из `.env.local`).

## 4. Смоук после деплоя

1. Главная открывается  
2. Создать комнату, скопировать ссылку, зайти вторым ником  
3. Выбрать текст → заполнить (🎲) → результат  
4. `/admin` с **прод**-паролем  

## 5. Правило ветвления

- В **Production / домен** попадает только `main`  
- Эксперименты — ветки → Preview URL (`*.vercel.app`)
