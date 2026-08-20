# AGENTS.md

Веб-менеджер ИИ-агентов на базе `opencode`. Управляет процессами `opencode serve` из браузера: проекты, сессии, живой чат (SSE), бесплатные модели.

## Запуск и команды

Требуется Node.js 18+ (проверено на 24) и установленный CLI `opencode` (см. `server/src/manager.js` — ищется через `where.exe`, затем в `%APPDATA%\npm\node_modules\opencode-ai`).

```bash
npm install          # postinstall автоматически собирает web/ (tsc + vite build)
npm start            # продакшен: сервер на :3720, раздаёт собранный web/dist, открывает браузер
npm run dev          # dev: сервер (node --watch) :3720 + Vite :5173 (проксирует /api на 3720)
npm run build        # сборка web/ (это же typecheck)
npm run backup       # снапшот в backups/<метка>/ (npm run backup -- <метка>)
```

## Git (обязательное правило)

Проект в git, remote: `https://github.com/SaimonBorsh/WEBAIAgent` (приватный). Ветка `master`.

- **Каждое осмысленное изменение** (фикс, фича, правка конфига/доков) — коммит + push:
  `git add -A` → `git commit -m "<описание>"` → `git push`.
- **Не завершать сессию с незакоммиченными изменениями.** Перед концом работы проверить `git status`; если есть незакоммиченное — закоммитить и запушить (или явно спросить пользователя).
- **Не коммитить:** `node_modules`, `dist`, `logs`, `backups/`, `publish/`, `server/{projects,tokens,settings}.json` (в `.gitignore`).
- **Архивы версий** (`publish.cjs vN` + `backup.js vN`) — по-прежнему только перед выкладкой версий, в git не идут.

Тестов, линтера и CI нет. Typecheck = `npm run build --workspace=web` (или `npx tsc` в `web/`). Серверная часть — обычный JS (ESM), без typecheck.

## Архитектура (npm-workspaces)

- `server/` — Express, обычный JavaScript ESM (`"type": "module"`), единственная зависимость — express. Точка входа `server/src/index.js`.
  - `index.js` — все REST-маршруты менеджера + `RUSSIAN_INIT_PROMPT` (текст, которым агент создаёт AGENTS.md через `/init`).
  - `manager.js` — жизненный цикл процессов `opencode serve --port N --hostname 127.0.0.1` (spawn, health-check `/global/health`, kill через `taskkill /T /F` на Windows).
  - `registry.js` — персистентный реестр проектов в `server/projects.json` (файл gitignored, создаётся в рантайме). Порт проекта выделяется в диапазоне 4100–4199.
  - `proxy.js` — прокси REST/SSE к серверу проекта по префиксу `/api/projects/:id/*`.
  - `models.js` — список бесплатных моделей провайдера `opencode` с models.dev (`https://models.dev/api.json`, кэш 6 ч), запасной список — `FREE_MODELS_FALLBACK` в `config.js`.
  - `auth.js` — токены (Bearer-заголовок или query `token`), TTL 30 дней. `config.js` — env-конфиг.
  - `fsbrowse.js` — обход ФС для выбора папки (диски Windows, максимум 500 записей).
- `web/` — React 18 + Vite + TypeScript (strict). `web/src/api.ts` — единый API-клиент и SSE-подписка (`EventSource /api/projects/:id/event?token=...`). Типы opencode-сессий/сообщений — в `web/src/types.ts`.

## Неочевидные требования и ограничения

- Auth: по умолчанию `admin`/`root` захардкожены (см. `server/src/auth.js`). Публичны без токена только `POST /api/login` и `GET /api/health`; всё остальное под `/api` закрыто `authMiddleware`. CORS открыт полностью (`Access-Control-Allow-Origin: *`). Менеджер без HTTPS и слушает `0.0.0.0` — наружу открыт только логин.
- Env-переменные: `WEBAIA_PORT` (по умолч. 3720), `WEBAIA_HOST` (по умолч. `0.0.0.0`), `WEBAIA_USER`, `WEBAIA_PASS`, `WEBAIA_NO_BROWSER` (не открывать браузер). Передаются процессам проектов через `{ ...process.env }`.
- Отправка сообщений в чате идёт через `prompt_async` (fire-and-forget), события приходят по SSE. Проектный `/api/projects/:id/init` создаёт сессию и сам стреляет `prompt_async` с `RUSSIAN_INIT_PROMPT` напрямую через `fetchOpenCode` (минуя прокси и SSE). Сессионный `/session/{id}/init` и `prompt_async` идут через прокси.
- Фронтенд отдаётся из `web/dist` только если он собран (`index.js` проверяет `fs.existsSync(distDir)`); при его отсутствии `npm start` работает как API-only.
- Сессии opencode живут в общей глобальной БД; интерфейс фильтрует их по папке проекта (`directory`).
- Логи процессов проектов — `server/logs/<projectId>.log`, менеджера — `server/logs/manager.out.log` / `manager.err.log`. При отладке «не запускается проект» смотреть эти файлы.
- `backups/` — снапшоты прошлых версий (v1–v7), создаются `scripts/backup.js`; исключаются `node_modules`, `dist`, `logs`, `projects.json`. Не редактировать их как источник кода.
- Серверы проектов привязаны только к 127.0.0.1, порт проекта нельзя менять вручную — выдаётся автоматически.
- Модель по умолчанию: `opencode/deepseek-v4-flash-free` (агент — `build`). При `defaultModel` без провайдера подставляется префикс `opencode/` (см. `normalizeModel` в `registry.js`).
- Управление проектами идёт только через REST-API менеджера: создание/запуск/остановка/init/конфиг сессии. Фронтенд не имеет доступа к серверу проекта напрямую.