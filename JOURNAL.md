# WEBAIAgent — Журнал проекта

Полное техническое состояние проекта для продолжения работы любым ИИ-агентом или человеком.
Последнее обновление: 19.08.2026.

---

## 1. Что это за проект

Веб-менеджер ИИ-агента на базе **opencode**: веб-интерфейс, где можно создавать проекты (папки с кодом), для каждого проекта поднимается свой локальный сервер opencode, а через браузер можно чатиться с агентом (в т.ч. со смартфона), прикреплять файлы, давать разрешения на действия (bash/edit/write), инициализировать проект (генерация AGENTS.md), настраивать модель/параметры для каждой сессии.

**Пути:**
- Корень проекта: `C:\Users\aleks\Documents\WEBAIAgent`
- Сервер (Node.js + Express): `server\` (ES-модули, `"type": "module"`)
- Фронтенд (React 18 + Vite + TypeScript): `web\`
- npm-воркспейсы: `server`, `web` (корневой `package.json` с `workspaces`)
- Бэкапы: `backups\v1 … v34`
- Реестр проектов: `server\projects.json` (НЕ попадает в бэкапы)
- Логи: `server\logs\` (`manager.out.log`, `manager.err.log`, `<projectId>.log` для каждого сервера opencode)

---

## 2. Окружение и версии (проверено)

| Параметр | Значение |
|---|---|
| ОС | Windows (win32), shell PowerShell 5.1 |
| Node.js | v24.18.0 |
| opencode | 1.18.18 |
| opencode exe | `C:\Users\aleks\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe` |
| Провайдер моделей | `opencode` — бесплатные модели без API-ключей |
| Модель по умолчанию | `opencode/deepseek-v4-flash-free` |
| Агент по умолчанию | `build` |
| Схема API opencode | эмпирически + `C:\Users\aleks\AppData\Local\Temp\opencode\types.gen.ts` (дамп схемы) |

**Критично:** opencode собран в один exe-бинарник — бинарник нельзя прочитать/распарсить. Все знания об API получены эмпирическими тестами (запись в файлы `.js` в `C:\Users\aleks\AppData\Local\Temp\opencode\` и запуск через `node`), т.к. PowerShell 5.1 искажает кириллицу и экранирование в inline-командах.

**Бесплатные модели провайдера `opencode`** (полный список тянется с `https://models.dev/api/json`, fallback в `config.js` → `FREE_MODELS_FALLBACK`):
`big-pickle`, `deepseek-v4-flash-free`, `hy3-free`, `kimi-k2.5-free`, `mimo-v2.5-free`, `nemotron-3-ultra-free`, `nemotron-3.5-lightning-free`, `glm-4.7-free`, `qwen3.6-plus-free`, `grok-code`.

---

## 3. Запуск / сборка / бэкап (рабочие команды)

### Сборка фронтенда
```
npm run build --workspace=web
```
Vite собирает в `web\dist\` (JS и CSS получают хэш в имени). Проверка сборки:
```
npm run build --workspace=web 2>&1 | Select-String -Pattern 'error|TS[0-9]|built'
```
Ожидается `✓ 45 modules transformed` / `✓ built in ~550ms`, без ошибок.

### (Пере)запуск менеджера
**Рекомендуемый способ — через keepalive (watchdog с авто-перезапуском):**
```
npm run serve        # = node scripts/keepalive.js
```
или (фоново, скрытое окно):
```
$env:WEBAIA_NO_BROWSER='1'
Start-Process node -ArgumentList 'scripts/keepalive.js' -WorkingDirectory 'C:\Users\aleks\Documents\WEBAIAgent' -WindowStyle Hidden -PassThru
```
`scripts/keepalive.js` (v9):
- запускает менеджера `node src/index.js` как дочерний процесс (логи — append в `manager.out.log`/`manager.err.log`);
- при выходе менеджера перезапускает с экспоненциальным бэкоффом (1с→30с; если менеджер прожил <20с — бэкофф удваивается, иначе сброс к 1с);
- убивает дерево через `taskkill /PID /T /F`;
- при `WEBAIA_WATCH=1` следит за `server/src` и перезапускает менеджер по изменениям (дебаунс 1.5с, мин. разрыв 4с);
- корректно глушится по SIGINT/SIGTERM.

**Ручной запуск/перезапуск (без keepalive):**
```
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'src/index.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep -Milliseconds 800
$env:WEBAIA_NO_BROWSER='1'
Start-Process node -ArgumentList 'src/index.js' -WorkingDirectory 'C:\Users\aleks\Documents\WEBAIAgent\server' -WindowStyle Hidden -RedirectStandardOutput 'C:\Users\aleks\Documents\WEBAIAgent\server\logs\manager.out.log' -RedirectStandardError 'C:\Users\aleks\Documents\WEBAIAgent\server\logs\manager.err.log'
Start-Sleep -Seconds 4
```
Проверка: `(Invoke-RestMethod 'http://127.0.0.1:3720/api/health').healthy` → `True`.

### Бэкап (обязательное правило: БЭКАП ПЕРЕД ИЗМЕНЕНИЯМИ)
```
node scripts/backup.js vN
```
Создаёт `backups\vN\` (копия корня без `node_modules`, `dist`, `logs`, `.git`, `backups`, `.vite`, `projects.json`, `.log`). Есть `v1…v7`.

### Проверка раздаваемого asset после сборки
```
node -e "const f=async()=>{const html=await(await fetch('http://127.0.0.1:3720/')).text();console.log(html.match(/src=\"([^\"]+\.js[^\"]*)\"/)[1])};f()"
```
(через файл в Temp — из-за экранирования в PS 5.1). Актуальные: `index-EC3PBxxF.js` (предыдущий раунд), CSS `index-sxQGW5_M.css` (после фикса скролла).

---

## 4. Текущее состояние реестра (server\projects.json)

| id | name | path | port | defaultModel | defaultAgent | autoStart | сессий с конфигом |
|---|---|---|---|---|---|---|---|
| `b40a779b-13c2-4cf7-86f9-96fbf2297c48` | EmlEGR | `C:\Users\aleks\Documents\EmlEGR\PCB_STM8` | 4100 | `opencode/deepseek-v4-flash-free` | build | true | 1 |
| `335a3923-0dcd-482a-8165-9f0fb180648c` | WEBAIAgent | `C:\Users\aleks\Documents\WEBAIAgent` | 4101 | `opencode/deepseek-v4-flash-free` | build | true | 0 |

- **EmlEGR — боевой проект, НЕ трогать** (реальный проект пользователя, не тестовый).
- Проект «WEBAIAgent» — сам этот менеджер (создан пользователем, autoStart).
- Порты проектов: 4100–4199 (диапазон `BASE_PROJECT_PORT`–`MAX_PROJECT_PORT`), авто-выделение через `allocatePort()`.
- Тестовые проекты, созданные при проверках, удалены (в т.ч. `WAIA-tst-unique`, `WAIA-tst-exp` и их папки в `Documents`).

---

## 5. Сеть и доступ

- Менеджер: `BIND_HOST=0.0.0.0` (env `WEBAIA_HOST`), порт `3720` (env `WEBAIA_PORT`).
- Локальный доступ: `http://127.0.0.1:3720`; из локальной сети: `http://192.168.8.106:3720`.
- Правило брандмауэра: **«WEBAIAgent 3720»** — TCP 3720, профили private/domain (добавлено через `netsh` с повышением прав).
- Серверы проектов (opencode serve) поднимаются ТОЛЬКО на `127.0.0.1` (`INTERNAL_HOST`), чтобы не светить в сеть; менеджер проксирует.
- Внутренние запросы менеджера идут на `http://127.0.0.1:<port>` (см. `fetchOpenCode`, `proxy.js`).
- `opencode serve --port <port> --hostname 127.0.0.1` — запуск проекта из `manager.js` (`cwd = project.path`).
- `getLanHost()` — первый не-loopback IPv4 из `os.networkInterfaces()`.

---

## 6. Авторизация

- Логин/пароль: `admin` / `root` (переопределяются `WEBAIA_USER` / `WEBAIA_PASS`).
- Токен: `crypto.randomBytes(32).toString('hex')`, TTL **30 дней**, **персистится в `server\tokens.json`** (debounced-запись 200мс, v9) — токены переживают перезапуск менеджера/keepalive. `tokens.json` исключён из бэкапов и `.gitignore`.
- Передача: заголовок `Authorization: Bearer <token>` ИЛИ `?token=<token>` (query-параметр обязателен для **SSE/EventSource**, т.к. там нельзя задать заголовки).
- Публичные маршруты: только `GET /api/health` и `POST /api/login`. Всё остальное под `authMiddleware`.
- В `web\src\api.ts` (`request()`): при 401 токен очищается; `window.location.reload()` — кроме путей `/auth` и `/login` (иначе бесконечный цикл при входе).
- `/api/logout` — аннулирует токен.

---

## 7. Архитектура сервера (server\src\)

| Файл | Назначение |
|---|---|
| `index.js` | Express-приложение, все маршруты, `RUSSIAN_INIT_PROMPT`, `fetchOpenCode()`, раздача `web\dist`. |
| `config.js` | Параметры: порты, хосты, `REGISTRY_FILE`, `LOGS_DIR`, список fallback-моделей. |
| `registry.js` | Реестр проектов на диске (`projects.json`): create/get/update/remove + `sessionConfig` per project. |
| `manager.js` | Запуск/остановка серверов opencode, health-check, поиск exe (`where.exe opencode` → fallback npm-путь). |
| `proxy.js` | Проксирование запросов и SSE к серверу opencode (`127.0.0.1:<port>`), чистка hop-by-hop заголовков. |
| `auth.js` | Токены (`tokens.json`), `authMiddleware`, `getToken` (Bearer или query). |
| `models.js` | Список бесплатных моделей с `models.dev/api/json` (кэш 6ч), fallback-список. |
| `fsbrowse.js` | Обзор файловой системы для пикера папок/файлов (`listDir`, лимит 500 записей, корень=диски+«🏠 Домой»). |
| `scripts/keepalive.js` | Watchdog перезапуска менеджера (v9): `npm run serve`, бэкофф 1–30с, kill через taskkill /T, опц. watch `server/src` при `WEBAIA_WATCH=1`. |

### 🔴 Баг keepalive, найден и исправлен (v9)
Исходная версия падала мгновенно: `fs.createWriteStream(..., {flags:'a'})` открывает fd **асинхронно**, и передача `WriteStream` с `fd:null` в `child_process.spawn(stdio)` бросала `ERR_INVALID_ARG_VALUE` → менеджер вообще не стартовал. **Фикс:** `startManager()` стал async и ждёт `'open'` обоих лог-стримов (см. `openLog()`), при неудаче — бэкофф и повтор. Проверено: убийство менеджера вручную → keepalive поднимает новый (новый PID, health True).

### Маршруты API (префикс `/api`)

Публичные: `POST /login`, `GET /health`.
Под авторизацией:
- `GET /auth`, `POST /logout`
- `GET /models`
- `GET /projects`, `GET /projects/:id`, `POST /projects`, `PATCH /projects/:id`, `DELETE /projects/:id`
- `POST /projects/:id/start|stop|init`
- `GET /fs/list?path=...`
- `GET /projects/:id/config` → `{ defaultModel, defaultAgent, sessionConfig }`
- `PUT /projects/:id/config/session/:sessionID` → сохраняет `{model, agent, temperature, topP, maxTokens, system}`
- `DELETE /projects/:id/config/session/:sessionID` → удаляет конфиг сессии (v8; регистрируется до proxy-ловушки)
- `POST /projects/:id/question/:requestID/reply|reject`
- **Прокси-ловушка** `app.use('/api/projects/:id', ...)`: все остальные пути (`/session`, `/session/:id/message`, `/session/:id/prompt_async`, `/session/:id/abort`, `/session/:id/permissions/:pid`, `/event` (SSE), `/diff`, `/question`, `/session/:id/init`) проксируются в opencode. **Новые конфиг-маршруты регистрировать ДО этой ловушки.**

### Особенности `POST /api/projects` (актуально!)
- Если `path` не указан → путь по умолчанию `os.homedir()\Documents\<имя>` (недопустимые символы `\ / : * ? " < > |` заменяются на `_`).
- Если такая папка **уже существует** на диске → `409` «Папка уже существует: … Укажите другое название проекта или выберите папку вручную.» (папка НЕ пересоздаётся).
- Дубль пути среди существующих проектов → `400` «Проект с путём … уже существует» (проверка в `registry.create`).
- Иначе `fs.mkdirSync(resolved, {recursive: true})`, затем `registry.create`.

### Особенности `POST /api/projects/:id/init`
- Требует запущенный сервер (иначе 409).
- Создаёт сессию `{title: 'Инициализация проекта'}`, затем `prompt_async` с `RUSSIAN_INIT_PROMPT` (русский AGENTS.md). Возвращает `{ok, sessionID}`.

---

## 8. Архитектура фронтенда (web\src\)

| Файл | Назначение |
|---|---|
| `api.ts` | Все вызовы API, токен, `subscribeEvents` (SSE EventSource с `?token=`). |
| `types.ts` | Типы: Project, SessionInfo, SessionConfig, MessageItem, Part, Permission, FsEntry/FsListResult, QuestionRequest и т.д. |
| `App.tsx` | Авторизационный гейт (`authed`), роутинг Dashboard/ProjectView, кнопка «Выйти». |
| `main.tsx` | Точка входа. |
| `styles.css` | ЕДИНЫЙ файл стилей (без CSS-модулей) — все классы здесь, включая адаптив. |
| `md.tsx` | Рендер markdown в сообщениях. |
| `components/Dashboard.tsx` | Список проектов. |
| `components/ProjectCard.tsx` | Карточка проекта (без выбора модели — модель теперь на уровне сессии). |
| `components/NewProjectModal.tsx` | Создание проекта (название + папка, папка НЕобязательна — есть подсказка про Documents). |
| `components/FolderPickerModal.tsx` | Пикер папок/файлов через `GET /api/fs/list`. |
| `components/ProjectView.tsx` | Экран проекта: сессии, старт/стоп, инициализация, передача `config` сессии в Chat. |
| `components/SessionSettingsModal.tsx` | Создание/настройка сессии (имя, модель, агент, temperature, topP, maxTokens, system). |
| `components/Chat.tsx` | Чат: SSE-события, вложения (📎 + drag-drop до 5МБ), вопросный инструмент, отправить/остановить. |
| `components/MessageBlock.tsx` | Рендер сообщения + частей (текст/файлы/код/инструменты/рассуждения). |
| `components/QuestionBar.tsx` | Окно ответа на `question` (варианты + свободный текст). |
| `components/PermissionBar.tsx` | Окно разрешений на действия агента. |
| `components/ModelSelect.tsx` | Выпадающий список моделей (работает с «голыми» id без префикса `opencode/`). |
| `components/Login.tsx` | Форма входа. |

---

## 9. Ключевые знания по API opencode (эмпирически проверено)

### Сессии
- **Сессии opencode глобальные** (на всю машину), фронтенд фильтрует по `s.directory === project.path`.
- Создание сессии: `POST /session` → ответ содержит `{id, title, ...}`.
- **Авто-название:** если создать сессию с пустым/undefined `title`, opencode сам формирует название из первого запроса пользователя (проверено: при запросе «Приветствие» сессия получила название «Приветствие»). Фронтенд передаёт `title: undefined` и показывает до этого «Без названия» (сервер отдаёт `New session - <timestamp>`).
- Список: `GET /session`; обновление названия: `PATCH /session/:id` `{title}`; удаление: `DELETE /session/:id`; сообщения: `GET /session/:id/message` (массив `{info, parts}`).

### prompt_async
- `POST /session/:id/prompt_async` — асинхронная отправка промпта (поток ответа идёт по SSE).
- Принимаемые поля (проверено 204; схема 1.18.18 их НЕ декларирует, но API их терпит):
  `model: {providerID, modelID}`, `agent`, `temperature`, `topP`, `maxTokens`, `system`, `parts`.
- **Формат вложения (сверено с CLI `run.ts` opencode):**
  ```
  { type: 'file', url: 'file:///C:/...' | 'data:...;base64,...', filename, mime: 'text/plain' }
  ```
  Локальный URL = `'file:///' + absPath.replace(/\\/g, '/')`.
  Обычный текстовый парт: `{ type: 'text', text }`.

### SSE-события (стрим `GET /session/:id/event`)
Формат: `event.properties` (`p`). Значимые:
- `session.created` / `session.deleted` / `session.updated` → `p.info` (SessionInfo)
- `session.status` → `p.sessionID`, `p.status = {type: 'busy'|'idle'|'retry', attempt?, message?}`
- `session.idle`, `session.error` (в `p.error.data.message`)
- `message.part.updated` → `p.part`, `p.delta` (текст стримится дельтами)
- `message.updated` → `p.info` (MessageInfo с `time.completed`, `modelID`, `providerID`)
- `message.removed` → `p.messageID`
- `permission.updated` → `p` (Permission); `permission.replied` → `p.permissionID`
- **`question.asked`** (иногда **`question.v2.asked`**) → `{id, sessionID, questions:[{question, header, options:[{label, description}], multiple?, custom?}], tool:{messageID, callID}}`
- `question.replied` / `question.rejected` (и v2) → `requestID` или `id`

### Инструмент `question` (важно!)
**Самая частая причина «модель перестала отвечать»** — агент вызвал инструмент `question` и ждёт ответа, а UI его не показывал. Теперь:
- Фронт слушает `question.asked`, показывает `QuestionBar` (варианты radio/checkbox + свободный текст).
- Ответ: `POST /api/projects/:id/question/{requestID}/reply` body `{answers: string[][]}` (массив ответов на каждый вопрос).
- Отказ: `POST /api/projects/:id/question/{requestID}/reject`.
- `GET /api/projects/:id/question` — список ожидающих (ответ может прийти в `{data: [...]}` — фронт обрабатывает оба формата).
- Пока есть ожидающий вопрос — отправка в чат заблокирована.
- «Зависшие» вопросы не восстанавливаются (сиротские сессии) — для такой сессии нужна новая.

### Пермишены
`permission.updated` (properties = Permission, поле `id`), ответ `POST .../session/:id/permissions/:permissionID` `{response, remember}`; событие `permission.replied`.

---

## 10. Конфиг на уровне сессии (последняя крупная фича)

- **Модель задаётся не на проект, а на каждую сессию** (поле `model` в шапке проекта УБРАНО, из формы создания проекта тоже).
- Хранение: `project.sessionConfig` в `server\projects.json` (registry `getSessionConfigs/getSessionConfig/setSessionConfig/removeSessionConfig`).
- API: `GET /api/projects/:id/config`, `PUT /api/projects/:id/config/session/:sessionID`.
- Фронт: `SessionSettingsModal` (имя; модель через ModelSelect; агент build/plan; temperature 0–2; topP 0–1; maxTokens; системный промпт). Пустое имя при создании = авто-название из первого запроса.
- `Chat` получает `config: SessionConfig` и подставляет в `prompt_async` всё, что задано.
- Fallback: если конфига нет → `{model: project.defaultModel, agent: project.defaultAgent}`.
- В списке сессий показывается модель сессии (класс `.session-model`).

### 🔴 Известный незакрытый момент (TODO) → ✅ ЗАКРЫТ в v8
Раньше `sessionConfig` **никогда не чистился при удалении сессии** (DELETE сессии идёт через proxy-ловушку, `removeSessionConfig` не вызывался) — в `projects.json` копились осиротевшие записи (у EmlEGR было 4). **Решено в v8:**
- Добавлен маршрут `DELETE /api/projects/:id/config/session/:sessionID` (в `index.js`, до proxy-ловушки) → вызывает `registry.removeSessionConfig`.
- `web/src/api.ts`: метод `api.deleteSessionConfig(id, sessionId)`.
- `web/src/components/ProjectView.tsx` `deleteSession`: после удаления сессии вызывает `deleteSessionConfig` + `loadProject()` (в try/catch — не критично).
- Накопленный мусор почищен: 3 осиротевшие записи EmlEGR удалены через новый endpoint (осталась 1 живая — `ses_fe9daf62dffeQ17mxQDtWNwyY5`).

---

## 11. Сделанные за последние раунды доработки (все проверены, бэкапы v5–v8)

### 11.1 Мобильная адаптивность (CSS + index.html)
- `viewport-fit=cover`, `theme-color #0f1115`, `body {overflow: hidden}` (скроллятся только внутренние области), убран tap-highlight.
- Медиазапрос ≤760px: fallback `100vh`→`100dvh`; кнопки шапки проекта и чата `flex:1`; safe-area снизу `chat-input`; `modal-settings`/`picker` на всю ширину; поля модалок 16px (защита от авто-зума iOS); удалено мёртвое правило `.model-select`.
- Медиазапрос ≤480px: компактные шапка/чипы сессий/карточки, стек кнопки «Обзор…», скролл login-карточки.
- **Фикс вертикальной прокрутки в чате на смартфоне** (v7):
  - Причина: `.chat-wrap` имел `flex:1`, но без `min-height:0`; при вертикальной раскладке `.project-body` (column) элемент не сжимался ниже контента → `.chat-scroll` получал бесконечную высоту и не скроллился. Раньше это маскировала прокрутка страницы, которую отключил `body{overflow:hidden}`.
  - Решение: `.chat-wrap { min-height: 0; overflow: hidden; }` + `-webkit-overflow-scrolling: touch` для `.chat-scroll`, `.dashboard`, `.sessions-list`, `.picker-list`, `.modal`.

### 11.2 Исправлен дубль сессий при создании
- Причина: гонка — SSE `session.created` мог добавить сессию раньше, чем завершался `await api.setSessionConfig`, а `createSession` вставлял её повторно безусловно → два элемента списка с одним id и названием.
- Решение: оба места вставки (`createSession` и SSE-обработчик) используют `insertSession()` с дедупом по `id`.

### 11.3 Папка по умолчанию Documents + проверка уникальности
- Пустая папка → `Documents\<имя>`; если папка существует → 409 с внятным сообщением; дубль пути → 400. Папка создаётся только если её ещё нет.
- Тест e2e пройден: без папки 201 → повтор 409 → явный путь 201 → повтор 400 → cleanup.

### 11.4 Закрытие TODO: чистка sessionConfig + валидация полей (v8)
- `DELETE /api/projects/:id/config/session/:sessionID` + вызов из `ProjectView.deleteSession` (подробности в §10).
- Валидация в `SessionSettingsModal`: пустые поля — по умолчанию; не-число или вне диапазона (temp 0–2, topP 0–1, maxTokens 1–1e6) → ошибка под полем (класс `.field-error`), сабмит блокируется. Раньше сервер молча игнорировал невалидные значения (не клал в конфиг).
- Проверено: `npm run build` без ошибок (45 modules), менеджер перезапущен, DELETE-маршрут отвечает 200, мусор EmlEGR вычищен.

### 11.5 Архив проектов, удаление сессий/проекта, переименование (v11)
- **Архив:** `PATCH /api/projects/:id {archived: true}` → проект помечается `archived`, сервер останавливается; авто-старт при поднятии менеджера пропускает архивные (`autoStart && !archived`). Вернуть — `archived: false` (запуск вручную). `/init` для архивного → 409 «Проект в архиве».
- **Удаление сессий — только из архива:** новый маршрут `DELETE /api/projects/:id/session/:sessionID` (до catch-all прокси): не-архивный проект → 409; архивный, но сервер остановлен → 409 «Запустите сервер для управления сессиями»; иначе проксирует в opencode (204) + чистит sessionConfig. Кнопка «✕» в списке сессий видна только у архивного проекта.
- **Удаление проекта — только из архива:** `DELETE /api/projects/:id` для не-архивного → 409. Папки на диске НЕ удаляются никогда (только stop + выписка из реестра). В UI — кнопка «Удалить проект» с предупреждением «папки останутся».
- **Переименование:** `PATCH` уже поддерживал `name`; добавлен `RenameProjectModal.tsx` (✎ в заголовке ProjectView и на карточке). Путь/папка не меняются.
- **UI:** Dashboard разделён на «Активные проекты» и «Архив» (`.dashboard-section`); бейдж «в архиве» (`.badge-archived`), заметка-баннер `.archive-note` в ProjectView; у архивного скрыты «+ Новая» и «Инициализировать», в пустом чате предлагается только просмотр переписки.
- **Тесты e2e (API):** создание→rename→архив (running→False)→DELETE сессии активного=409 / архивного-остановленного=409; запуск архивного → DELETE сессии = 204 (после GET сессии → 404); DELETE проекта из архива ok, папка остаётся; GET после удаления → 404. `npm run build` без ошибок (46 modules).

### 11.6 Дизайн: анализ + P0 (скрытие модели в сессиях, настройки проекта) (v12)
- **`design/`** — новая папка с анализом дизайна: `design/analysis.md` (инвентаризация, диагностика, эталоны индустрии 2026, план P0–P3) и `design/references.md` (ссылки: Vercel/Linear/Claude, AI-dashboard-принципы, AI chat UX).
- **P0.1 — модель убрана из списка сессий:** удалён чип `.session-model` (и его CSS). Модель теперь видна только в настройках сессии (`SessionSettingsModal`) и в мете сообщений (показывать/скрыть — в P1 глобальные настройки).
- **P0.2 — настройки проекта:** новый `ProjectSettingsModal.tsx` (кнопка «⚙ Настройки» в шапке ProjectView). Поля: модель по умолчанию, агент по умолчанию, temperature/topP/maxTokens по умолчанию, системный промпт проекта, авто-старт.
- **Сервер:** у проекта новое поле `defaults: {}` (температура/topP/maxTokens/system). `registry.update` принимает `defaults` с merge + валидацией (temp 0–2, topP 0–1, maxTokens >0; невалидное отбрасывается). `GET /api/projects/:id/config` теперь отдаёт `defaults`. `PATCH /api/projects/:id` уже принимал `defaultModel/defaultAgent/autoStart`.
- **Проектные дефолты применяются к новым сессиям:** `ProjectView.defaultBase()` (дефолты проекта) + `configFor(id)` = `{...defaults, ...sessionOverride}`; модалка новой сессии предзаполняется дефолтами проекта.
- **Тесты e2e (API):** создание → defaults={}; PATCH defaultModel+defaults → сохраняются; GET config отдаёт defaults; частичный PATCH defaults (только maxTokens) → merge без потери остальных; temperature=99 → отброшена, осталась 0.7. `npm run build` без ошибок.

### 11.7 Дизайн P1: глобальные настройки + группировка действий (v13)
- **`server/src/settings.js`** (новый): `server/settings.json` (вне бэкапов и `.gitignore`). Поля: `openBrowserOnStart` (по умолч. true), `passwordHash` (SHA-256). `updateSettings` (merge), `verifyPassword` → true/false/null (null = хэш не задан → fallback на env `WEBAIA_PASS`). openBrowser теперь проверяет и env `WEBAIA_NO_BROWSER`, и настройку.
- **`auth.js`:** `validateCredentials` — логин из env `WEBAIA_USER`; пароль: если есть хэш в settings → сравнивает хэш, иначе env `WEBAIA_PASS`.
- **API:** `GET /api/settings` → `{openBrowserOnStart, passwordConfigured}`; `PUT /api/settings` принимает `{password?, openBrowserOnStart?}` (пароль мин. 4 символа, иначе 400).
- **`web/src/prefs.ts`** (новый): клиентские преференсы в localStorage: тема (`system|dark|light`), показ модели в сообщениях, показ токенов, плотность (`normal|compact`). `applyTheme()` ставит `data-theme` на `<html>`, реагирует на смену системной темы.
- **`GlobalSettingsModal.tsx`** (новый, кнопка «⚙» в шапке): тема, плотность, чекбоксы «модель в сообщениях»/«токены в сообщениях» (применяются мгновенно), открытие браузера при старте (сервер), смена пароля.
- **`MessageBlock.tsx`:** модель/токены в мете сообщений — по преференсам `getShowModel()`/`getShowTokens()` (по умолчанию скрыты).
- **Светлая тема:** блок `html[data-theme='light']` переопределяет CSS-переменные; code/tool-панели остаются тёмными в обеих темах.
- **Плотность:** `html[data-density='compact']` — уменьшает отступы (шапка, карточки, чат, сессии).
- **`DropdownMenu.tsx`** (новый, «⋯»): пункты + danger, закрытие по клику вне/Esc.
- **Группировка действий:** шапка ProjectView — остались «Запустить/Остановить», «⚙ Настройки» + меню «⋯» (Инициализировать, Переименовать, В архив/Вернуть, Удалить проект); ✎ из заголовка убрана. Карточка проекта — «Открыть», «Запустить/Остановить» + «⋯» (Переименовать, В архив/Вернуть, Удалить проект); inline-подтверждение удаления заменено на `confirm()`.
- **Тесты e2e (API):** GET settings дефолты; PUT openBrowserOnStart=false + password=test1234 → pwdConfigured=true; старый пароль → 401, новый → токен; сброс — удаление `settings.json` → pwdConfigured=false, env-пароль работает, openBrowser=true. `npm run build` без ошибок.

### 11.8 Дизайн P1.5/P2: UX-фичи (v14)
- **Статус агента + таймер (Chat):** фаза вычисляется из `busy` + сообщений: нет ответа и нет бегущих тулов → «Думает…», есть `running`-тулы → «Выполняет действия…», течёт последний ассистентский (без `time.completed`) → «Печатает…». Справа — счётчик секунд (`elapsed`, интервал 1 с, сброс при `busy=false`).
- **Повторить запрос:** `retryLast()` — находит последнее user-сообщение, восстанавливает parts (текст + файлы, `filename` из server-part или `name`) и повторно шлёт через общий `sendParts()`. Кнопка «⟳» в мете последнего завершённого ассистентского ответа (`canRetry`, скрыта при `busy`).
- **Копирование кода:** `CodeBlock` в `md.tsx` — обёртка `.code-wrap` с кнопкой `.code-copy` (navigator.clipboard, «✓ Скопировано» на 1.5 с).
- **Тосты:** `web/src/toast.ts` (subscribe/emit, автозакрытие 4 с, типы info/success/error), `ToastContainer` монтируется в App (z-индекс 300). Вызовы: создание проекта (Dashboard), в архив/возврат, удаление проекта, удаление сессии, «Анализ запущен» (ProjectView), «Настройки проекта сохранены» (ProjectSettingsModal).
- **Пилюли-подсказки:** 4 варианта в пустом чате; клик заполняет поле ввода и фокусирует textarea (`inputRef`).
- **CSS:** `.toasts/.toast(-success/-error)` + анимация `toast-in`; `.suggestion-pills/.suggestion-pill`; `.meta-btn`; `.code-wrap/.code-copy` (позиционирование поверх блока). Светлая тема не ломает тёмные code/tool-панели.
- **Тесты:** `npm run build` без ошибок (поправлены типы: filename у серверных file-частей, `status` через каст, `Boolean(time.completed)`); health True; список проектов не тронут (EmlEGR/Тест2 в архиве, WEBAIAgent/Системный работают).

### 11.9 Дизайн P2: слои/цвета + доступность (v15)
- **Переменные слоёв** (в обеих темах): `--surface-1/2/3` (панели), `--elevated` (модалки/меню/тосты), `--text-secondary`; тени `--shadow-md` (карточки) и `--shadow-lg` (модалки/меню/тосты). `--muted` в тёмной теме поднят до `#9aa3b5`, в светлой до `#4d5768` (контраст).
- **Применение:** `.card` — shadow-md; `.modal`/`.menu-pop`/`.toast` — `--elevated` + shadow-lg; `.chat-input` — верхняя тень; `.message-assistant .message-body` — лёгкая прозрачность `rgba(107,118,140,.08)` + тень (в светлой — `rgba(30,40,60,.05)`); `.reasoning`/`.tool` — подложка `--surface-1`; `.message-user` tint перенесён отдельно.
- **Доступность:**
  - `:focus-visible` — 2px outline акцентом для кнопок/ссылок/чекбоксов и полей (инпуты/select/textarea).
  - `web/src/useEscape.ts` — Esc закрывает все модалки (GlobalSettings, ProjectSettings, SessionSettings, NewProject, RenameProject, FolderPicker).
  - `aria-live="polite"` вокруг статуса агента (фаза + таймер) и statusText в Chat.
  - Модалки: `role="dialog" aria-modal="true"`.
  - aria-labels: ⚙, ⋯ (DropdownMenu), ⟳ (meta-btn), ✎/✕ (сессии), chip-remove, code-copy.
- **Тесты:** `npm run build` без ошибок; health True; dist обновлён (клиентские правки, перезапуск не требуется).

### 11.10 Дизайн P3: сайдбар-навигация (v16)
- **`Sidebar.tsx`** (новый): «Проекты» + кнопка «＋»; пункты проекта — точка состояния (зелёная = running), имя, hover, активный подсвечен акцентом; ниже разделитель и секция «Архив» (мьютед); подвал — «Настройки». Клик по проекту — открыть; повторный клик (или логотип) — на обзор.
- **App.tsx:** список проектов поднят наверх (fetch + поллинг 4 с при авторизации), `handleOpenProject` (toggle), состояние `showCreate` (NewProjectModal переехал в App, onCreated → load + toast). Layout: `.app` flex-row = Sidebar + `.app-main` (header + контент).
- **Dashboard.tsx:** стал управляемым — `projects/loading/error/onOpenProject/onCreate/onChanged` из App; свой fetch/поллинг/модалка удалены.
- **ProjectView.tsx:** новый проп `onChanged` — вызывается после архивации/возврата, удаления проекта, переименования, старт/стоп; сайдбар обновляется мгновенно (иначе до 4 с поллинга).
- **CSS:** `.sidebar*` (232px, bg-soft, border-right, dot running, active, архив мьютед), `.app` → row, `.app-main`; сайдбар скрыт при ≤760px.
- **Тесты:** `npm run build` без ошибок; health True; новый бандл `index-nOT_mKWH.js` отдаётся. P0–P3 плана закрыты.

### 11.11 Баг-фикс: обновление чата/сессий из консоли + регресс-тест (v17)
- **Причина:** `Chat` опрашивал сообщения только при `busy` (которое приходит из SSE), а `ProjectView` обновлял список сессий только по SSE/при монтировании. При сессии, начатой в консоли (TUI opencode), SSE мог не приходить/не подключаться → веб не показывал ответы до перезахода.
- **Фикс:**
  - `Chat.loadMessages` теперь вызывается интервалом **каждые 3 с всегда** (не только при busy). Дополнительно `loadMessages` сам выставляет `busy=true`, если последний ассистентский ответ ещё без `time.completed` или есть running-тул (страховка от потери `session.status`).
  - `ProjectView` в тот же 3-секундный интервал добавил `loadSessions()` — новые сессии из консоли появляются в списке без перезахода.
  - Оба интервала сбрасываются при смене сессии/проекта (dep `sessionId`/`loadSessions`).
- **Регресс-тест (API):** `C:\Users\aleks\AppData\Local\Temp\opencode\regen_test.js` — 20 проверок: health, логин (env-пароль), 401 без токена, список проектов (WEBAIAgent/Системный), деталь/конфиг проекта, сессии, settings (дефолты → PUT openBrowser=false → восстановление true), модели, fs-list, CRUD throwaway-проекта через архив (создать → архивировать → удалить → 404). **Все PASSED**, реальные проекты не тронуты.
- **Тесты:** `npm run build` без ошибок; health True. Бэкап v17.
- **Хотфикс (v18):** ложная фаза «Выполняет действия…» с тикающим счётчиком в чатах, где действий нет. Причина: `loadMessages` ставил `busy=true`, если **любая** tool-часть в переписке (включая старые ходы) имеет `status='running'`; застрявший тул держал busy вечно. Фикс в `Chat.tsx`: `hasRecentRunningTool` — тул считается активным, только если `state.time.start` свежий (<120 с, `STALE_TOOL_MS`); при отсутствии активного тула/незавершённого ответа и **завершённом** последнем ответе — `setBusy(false)` (снимает застрявший busy). `npm run build` без ошибок.
- `v19`: видимость работы агента — 1) **русские названия действий** (`web/src/toolLabels.ts`): read→«Читает файл», write→«Записывает файл», edit→«Правит файл», bash→«Выполняет команду», websearch/webfetch, grep/glob/list, task, question и т.д.; в `ToolView` заголовок = русская подпись, оригинальный `state.title` показывается как приглушённый detail «· …». 2) **Настройка «Показывать рассуждения модели»** (prefs `webaia_show_reasoning`, чекбокс в GlobalSettings): при включении блоки «Рассуждение» раскрыты по умолчанию, а строка статуса в фазе «Думает…» показывает живой сниппет последних ~120 символов рассуждений. 3) **Живой статус**: в фазе «Выполняет…» строка показывает название текущего (свежего) тула вместо «Выполняет действия…». `npm run build` без ошибок; health True; бэкап v19.
- `v20`: фикс автоскролла чата — при чтении истории вверх чат принудительно «сползал» вниз при каждом обновлении сообщений (опрос 3 с + SSE). В `Chat.tsx`: `scrollRef` на `.chat-scroll` + обработчик `onScroll` обновляет `stickRef` (true, если пользователь в ~80px от низа); `scrollIntoView` вызывается только при `stickRef.current`. `npm run build` без ошибок; бэкап v20.
- `v21`: улучшение кнопки «Остановить» — abort в opencode не убивает уже запущенный тул (долгая команда), поэтому сессия может остаться busy («зависнуть»), пока команда не доработает. Теперь: кнопка показывает «Отменяю…» (disabled) на время abort; через 5 с проверяется `busyRef` — если сессия всё ещё активна, в статус-строку выводится подсказка «Остановка не завершилась — вероятно, выполняется длинная команда… напишите „продолжи" в этом чате», иначе статус очищается. `npm run build` без ошибок; бэкап v21.
- `v22`: «сердцебиение» сессии — диагностика по живой сессии (Системный, bash-тул «running» при активной работе). Проблема: между тулами модель только «думает», рассуждения скрыты → веб выглядит зависшим даже при активной работе. Фикс: 1) показ рассуждений включён **по умолчанию** (`getShowReasoning` = `!== '0'`) — сниппет «Думает…» в статусе виден сразу; 2) `pollActivity` — в том же 3-сек. опросе запрашивается `GET /session/:id`, `time.updated` пишется в `lastActivityRef`; если busy и обновлений нет >40 с — статус-строка показывает предупреждение (danger) «Обновлений уже N с. Похоже, агент завис — напишите „продолжи" или «Остановить»». Добавлен `api.session()`; CSS `.status-line-danger`. `npm run build` без ошибок; бэкап v22.
- `v23`: «Продолжить» в вебе + виртуализация длинных сессий. Диагностика показала: `GET /session/:id/message` поддерживает `limit`/`offset` (первые-со-смещением, порядок хронологический; без пагинации сессия 968 сообщений = ~4 МБ JSON). Итог: 1) полная загрузка при открытии (`limit=10000`), далее инкрементальный опрос каждые 3 с через `?limit=200&offset=<счётчик>` — тянутся только новые сообщения (`serverCountRef`, дедуп по id через `known`/`fresh`); 2) **оконный рендер** — `visibleLimit=150` последних сообщений + кнопка «Показать ранее — показаны последние N из M» (+200 за клик); busy/рассуждения/тулы считаются по полному списку; 3) кнопка **«Продолжить»** в красной статус-строке при зависании (`hung` >40 с) — отправляет «Продолжи» через `sendParts` с оптимистичным сообщением (раньше приходилось писать в консоли). `api.messages(id, sid, limit?, offset?)`. `npm run build` без ошибок, регресс-тест ALL PASSED; бэкап v23.
- `v24`: фикс дублей сообщений при отправке. Причина — гонка между оптимистичным сообщением (`tmp-…`) и реальным: полл добавлял реальное сообщение как новое, а `message.updated` по SSE затем заменял `tmp-` реальным → два одинаковых сообщения. Также полл «перепрыгивал» сообщение, если его добавил SSE как пустой каркас (`{info, parts: []}`) — текст бы потерялся. Решение: `appendDelta()` — единая реконсиляция для инкрементального полла: id существует → заменить целиком (полной версией с parts), иначе роль user с необработанным `tmp-` → заменить tmp- реальным, иначе добавить в конец. `serverCountRef` теперь растёт на длину дельты (дрейф самокорректируется, т.к. offset движется только вперёд). `npm run build` без ошибок; бэкап v24.
- `v25`: настоящая причина «привет привет» — **двойной POST с клиента**, а не рендер. Диагностика по живой сессии: в данных сервера реальные дубли одинаковых user-сообщений («Давай обсудим 1» ×2, «Продолжи» ×2) — `send()`, `retryLast()` и `continueAgent()` не имели защиты от повторного входа (двойной клик/Enter успевал уйти дважды до ре-рендера). Фикс: общий guard `sendingRef` + состояние `sending` — блокирует повторный вход во время `await sendParts` (синхронно до первого await), finally сбрасывает; кнопки «Отправить»/«Продолжить» получают `disabled={sending}`. `npm run build` без ошибок; бэкап v25.
- `v26`: «В очереди» (идея 1, подтверждена пользователем). Теперь отправка **разрешена в занятую сессию** (убран guard `busy` из `send()`; менеджер — прозрачный прокси, opencode сам ставит промпт в очередь и возвращает POST сразу). Если в момент отправки агент busy — ставится `queueRef = { lastAssistantId }` и показывается строка над полем ввода **«⏳ В очереди — агент закончит текущую задачу, затем обработает ваше сообщение»** (`.queue-line`, role=status). Строка снимается в `updateBusy`, когда появляется новый assistant после нашего сообщения (last assistant id изменился). Кнопка отправки больше не блокируется при busy (только во время отправки). `npm run build` без ошибок, регресс-тест ALL PASSED; бэкап v26.
- `v27`: 1) фикс остаточного «привет привет» (на секунду). Диагностика SSE на живой сессии показала порядок событий для user-сообщения: `message.updated [user]` (×3) → `part.updated text`. Дубль — гонка оптимистичного `tmp-` с реальным сообщением (накопленные `tmp-`, гонка EventSource). Защита: при отправке удаляются ВСЕ лишние `tmp-` (`filter` перед append в `send()`/`continueAgent()`), плюс рендер-фильтр `renderMsgs` — `tmp-` не рендерится, если в списке уже есть реальный user с тем же текстом. 2) **Уведомление о завершении**: при переходе busy→false, если вкладка скрыта (`document.hidden`), мигает заголовок вкладки «✓ Готово» (6 тиков по 700 мс) + короткий бип 880 Гц через WebAudio (`notifyDone()`). 3) **Тайминги команд**: в `ToolView` длительность `time.end - time.start` (для running — живой elapsed, т.к. Chat ре-рендерится раз в секунду), формат «3,2 с»/«340 мс», элемент `.tool-time` в шапке тула. `npm run build` без ошибок; бэкап v27.
- `v28`: НАСТОЯЩИЙ корень «привет привет» (раньше это был не дубль сообщений, а **дубль текста внутри одного сообщения**). Причина: `upsertMessage` при замене оптимистичного `tmp-` на реальное сообщение сохранял его parts (`{ ...tmp, info }`), а затем `message.part.updated` добавлял реальный текстовый парт → в одном сообщении оказывалось два text-парта «привет» («привет привет» на ~секунду, пока полл не перезапишет целиком). Фикс: 1) `upsertMessage` теперь ставит `{ info, parts: [] }` (текст дойдёт через part.updated); 2) страховка в `applyPart` — если добавляемый text-парт совпадает по тексту с уже существующим, он заменяется, а не добавляется. Проверено по SSE-порядку событий. `npm run build` без ошибок; бэкап v28.
- `v29`: фикс перетаскивания файлов. API-проба подтвердила: data URL-файл opencode принимает (200, агент видит содержимое). Значит ломалось на клиенте: обработчик `drop` был только на `.chat-input`, а drop вне его (на списке сообщений/шапке) срабатывал как дефолтное поведение браузера — **открытие файла вместо страницы** («сессия не работает» = приложение выгрузилось). Фикс: глобальные `window`-обработчики `dragover`/`drop` (preventDefault — никакой навигации; drop с файлами → `addDroppedFiles`), у `.chat-input` остались только подсветка; `addDroppedFiles` обёрнут в try/catch с показом ошибки чтения файла в UI (раньше rejection молча глотал). `npm run build` без ошибок; бэкап v29.
- `v30`: фикс перетаскивания docx. Пользователь увидел ошибку «file part media type application/vnd.openxmlformats-officedocument.wordprocessingml.document functionality not supported» и зависший чат. Причина: opencode поддерживает data URL только для ограниченного набора media-типов (текст/картинки), для docx не умеет; на ошибке ход сессии вставал. Решение: 1) новый серверный роут **`POST /api/upload`** (`express.raw` до 15 МБ, после authMiddleware) — пишет тело в `%TEMP%\webaia-uploads\<ts>-<rand>-<имя>`, возвращает `{url: file:///…}`; 2) клиент `api.uploadFile(blob, filename, mime)`; 3) `addDroppedFiles` вместо FileReader/data URL **загружает файл на диск** и в Attachment кладёт `file://` путь — opencode читает с диска, media-тип не важен; 4) после ошибки отправки `send()/retryLast()/continueAgent()` вызывают `loadMessages()` — снимается застрявший busy. Менеджер перезапущен через `/api/restart` (keepalive подхватил; роут проверен: 200 + file URL; все проекты auto-start поднялись; живая сессия Системного не пострадала — CLI процесс отдельный). `npm run build` без ошибок; бэкап v30.
- `v31`: ошибка «file part media type…» оставалась, потому что **браузер держал старый бандл**. Диагностика тестовых сессий (ses_fe6c647, ses_fe9daf): docx-парт всё ещё уходил как `data:application/vnd.openxmlformats…;base64` (старый путь FileReader), хотя сервер отдаёт новый бандл с `uploadFile`. Тест был в 13:53 — после развёртывания v30, значит кэш. Фикс: **`Cache-Control: no-cache` для index.html** (middleware перед `express.static` + в SPA-fallback) — теперь обычный F5 всегда забирает свежий index.html с новыми хэшированными бандлами. Менеджер перезапущен, проверено: index отдаётся с no-cache, upload-роут жив, все autoStart-проекты подняты (заметка: EmlEGR сейчас рас-архивирован и running, Тест2 — в архиве, потому не стартует). `npm run build` без ошибок; бэкап v31.
- `v32`: причина ошибки была не в data URL. После v31 файл уже уходил как `file://`, но opencode **отклоняет сам media-type docx** в файл-парте (`'file part media type application/vnd.openxmlformats-officedocument.wordprocessingml.document' functionality not supported`) — docx вообще не встраивается. Решение: серверный **`extractDocxText()`** в `server/src/index.js` (мини-ZIP-парсер: центральный каталог → `word/document.xml` → inflateRaw → `<w:t>` по абзацам → текст). `POST /api/upload` теперь для docx пишет рядом `.txt` с извлечённым текстом и возвращает `{url: file:///…txt, mime: 'text/plain', extracted: true}`. Клиент (`Chat.tsx` `addDroppedFiles`) использует `up.mime`/`up.url` из ответа (`mime: up.mime || file.type || 'text/plain'`) — файл-парт уходит как text/plain, который opencode принимает, и агент читает текст через Read. Проверено e2e: настоящий docx пользователя (96 КБ, method 8) извлёкся (7918 символов, письмо Комитета медконтроля РК), новая сессия приняла text/plain файл-парт, агент прочитал и ответил. Заметка: `$pid` — зарезервированная переменная PowerShell. `npm run build` без ошибок; бэкап v32.
- `v33` (диагностика «сессии не отвечают»): сервер и свежие сессии здоровы (probe отвечает, SSE `server.connected`). Проблема: 3 сессии от 8/18 (`ses_fea1b65b8ff`, `ses_fea206663ffe`, `ses_fea258198ffe`) застряли на **осиротевшем вопросе** (tool question, status=running, не в реестре `/question`). Отправка туда: `prompt_async`=204, но run создаёт assistant с 0 частей и **ни одного SSE-события** — блок. Abort, удаление зависшего сообщения (`DELETE /session/:id/message/:mid` — работает) и рестарт проекта не лечат: состояние отравлено в хранилище. Сессия `ses_fea5de5e7ffe` показывалась busy, потому что это сессия текущего CLI-диалога (общее хранилище) — не баг. Лечение: клиентский фикс `updateBusy` — busy держится только при свежей активности (новый `lastPartAtRef`, обновляется по SSE part/message events и по поллу только когда `delta.length>0`; `ACTIVE_MS=60с`). Зависшая сессия теперь сбрасывает busy через 60с и красная строка «агент завис» исчезает (не вечно). Зависшие сессии восстановить нельзя — предложено удалить. `npm run build` без ошибок; бэкап v33.
- `v34` (архив сессий): архив теперь **уровня сессии**, а не проекта. `registry.js`: новое поле `archivedSessions: {}` в проекте + `getArchivedSessions`/`setSessionArchived` (сохраняется в `registry.json`). `index.js`: `GET /api/projects/:id/config` отдаёт `archivedSessions`; новый `PUT /api/projects/:id/session/:sid/archive` `{archived:bool}`; `DELETE /api/projects/:id/session/:sid` теперь требует **архивацию самой сессии** (`409 'Сначала отправьте сессию в архив...'` вместо требования архива проекта). `ProjectView.tsx`: список сессий разбит на «Активные»/«Архив» (`archivedSessions` из config), у каждой сессии кнопки ✎ / архивировать (▤, у архивированных ↩ вернуть) / удалить ✕ (только у архивированных). `styles.css`: `.sessions-group`, `.session-item.archived` (приглушён, зачёркнут заголовок), `.session-archived-badge`, `.session-del.danger`. Проверено e2e: config отдаёт archivedSessions; архив/возврат работает; удаление активной сессии блокируется (409), после архивации — успешно. `npm run build` без ошибок; бэкап v34.

---

## 12. Рабочие приёмы и подводные камни

- **ПРАВИЛО ОБНОВЛЕНИЙ: после каждой порции доработок/фиксов ОБЯЗАТЕЛЬНО создавать архив обновления** — выполнить `node scripts/publish.cjs v<N>` (следующий номер после последнего в `publish/WEBAIA/versions/`), затем `node scripts/backup.js v<N>` (снимок исходников). Это даёт: 1) папку `publish/WEBAIA/versions/v<N>/` (готовую к переносу), 2) `publish/WEBAIA-v<N>.zip` (архив обновления для установки/отката на любом ПК), 3) `backups/v<N>` (откат исходников). НЕ завершать сессию с неопубликованными изменениями. При нехватке времени хотя бы сделать `node scripts/backup.js v<N>`.
- **PowerShell 5.1 ломает кириллицу и `$`/`[`/`]`** в inline-`node -e`/`fetch`. Все диагностические скрипты писать в файлы `.js` в `C:\Users\aleks\AppData\Local\Temp\opencode\` и запускать `node <file>`. `Invoke-WebRequest` в PS 5.1 бросает исключение на не-2xx и не умеет body — использовать `node` + `fetch`.
- **Нельзя передавать ещё не открытый `fs.WriteStream` (fd:null) в `spawn(stdio)`** — падение `ERR_INVALID_ARG_VALUE` (см. баг keepalive в §7). Всегда ждать `'open'`.
- **Схема prompt_async** не декларирует `temperature/topP/maxTokens/system`, но они проходят (204). Не убирать их из тела.
- `ModelSelect` работает с «голыми» id (`deepseek-v4-flash-free`), а API ожидает полные (`opencode/deepseek-v4-flash-free`). Нормализацию делают: `registry.normalizeModel`, `SessionSettingsModal` (split('/')[1] на входе, `opencode/`+ на выходе), `configFor` в ProjectView.
- `api.sendMessage` в `Chat.send()` собирает body с доп. параметрами и кастует через `as Parameters<typeof api.sendMessage>[2]`.
- **Очередь/скорость моделей:** `kimi-k2.5-free` не отвечал за 60–200с в тестах (скорость самой модели), `deepseek-v4-flash-free` отвечает за <10с. Не считать это багом кода.
- Дефолт `registry.create`: `defaultModel = opencode/deepseek-v4-flash-free`, `defaultAgent = build`.
- При создании сессии из модалки название лучше оставлять пустым — opencode сам придумает хорошее из первого запроса.
- Файловый пикер: mode `dir` для выбора папки, `file` для вложения. Лимит 500 записей на каталог, `🏠 Домой` = `os.homedir()`.
- Вложения drag-drop: только data URL, лимит 5 МБ на файл (превышение — ошибка «прикрепите по пути»).

---

## 13. Рекомендованные следующие шаги (open issues)

1. ~~Очистка осиротевших sessionConfig при удалении сессии~~ — **сделано в v8** (см. §10 и §11.4).
2. **Живая проверка разных моделей в разных сессиях** на реальном проекте (ранее kimi не ответил за 60с — повторить с ожиданием до 3–5 мин или выбрать модель побыстрее; API-часть уже проверена: конфиг сохраняется и отдаётся). Тестировать только на временном/не-боевом проекте — EmlEGR трогать нельзя.
3. **Проверка мобильного UI на реальном смартфоне**: вертикальный скролл чата после фикса v7, горизонтальные чипы сессий, bottom-sheet модалки, поля ввода (16px), safe-area. Требует физического устройства — в коде ничего не менялось в v8.
4. ~~Проверить PUT config/session на валидность~~ — **сделано в v8**: фронтовая валидация в SessionSettingsModal (см. §11.4).
5. Прогнать `npm run build` после каждой правки и перезапустить менеджер (правило бэкапа: `backup.js vN` перед изменениями).

---

## 14. История бэкапов

- `v1`–`v4`: предшествующие раунды (V2 файл-пикер/вложения/русский init; V3 авторизация/LAN/сессии; фикс инструмента `question`; конфиг на уровне сессий).
- `v5`: завершение фичи «модель на уровне сессий» (config API + SessionSettingsModal).
- `v6`: доработки — мобильная адаптивность, фикс дубля сессий, Documents-папка с проверкой уникальности.
- `v7`: фикс вертикального скролла чата на смартфоне.
- `v8`: закрытие TODO — `DELETE .../config/session/:sessionID` + вызов из `deleteSession` (чистка осиротевших конфигов), фронтовая валидация числовых полей в SessionSettingsModal; почищен мусор EmlEGR (3 записи).
- `v9`: keepalive (watchdog перезапуска менеджера, `npm run serve`) + фикс его бага с `WriteStream`/`spawn`; токены персистятся в `server\tokens.json` (переживают перезапуски), `tokens.json` исключён из бэкапов, добавлен `.gitignore`.
- `v10`: бэкап перед правками v11.
- `v11`: архив проектов (остановка сервера, пропуск авто-старта), удаление сессий и проекта — только из архива (папки на диске не удаляются), переименование проектов (RenameProjectModal, ✎ в заголовке и на карточке), Dashboard с секциями «Активные»/«Архив». Подробности в §11.5.
- `v12`: дизайн P0 — папка `design/` (анализ + референсы); модель убрана из списка сессий; «⚙ Настройки проекта» (ProjectSettingsModal): модель/агент/параметры/системный промпт по умолчанию + авто-старт; серверное поле проекта `defaults` с merge+валидацией, `GET /config` отдаёт defaults, дефолты применяются к новым сессиям. Подробности в §11.6.
- `v13`: дизайн P1 — глобальные настройки (`server/settings.json` + `GET/PUT /api/settings`, смена пароля с SHA-256, `web/src/prefs.ts`: тема system/dark/light, плотность normal/compact, показ модели/токенов в сообщениях), светлая тема через `data-theme`, `GlobalSettingsModal`, меню «⋯» (`DropdownMenu`) в шапке проекта и на карточке. Подробности в §11.7.
- `v14`: дизайн P1.5/P2 (UX-фичи) — статус агента с таймером (думает/выполняет действия/печатает + счётчик секунд), «⟳ Повторить» у последнего ответа, копирование кода в блоках (`.code-wrap` + `.code-copy`), тосты (`web/src/toast.ts`, `ToastContainer`; вызовы: проект создан/удалён/в архив/вернули, настройки проекта, сессия удалена, анализ запущен), пилюли-подсказки в пустом чате (заполняют поле ввода и фокусируют). Подробности в §11.8.
- `v15`: дизайн P2 (слои/цвета + доступность) — переменные слоёв (`--surface-1/2/3`, `--elevated`, `--text-secondary`) и тени (`--shadow-md/lg`) в обеих темах; тени у карточек/модалок/меню/тостов, приподнятый фон модалок и меню (`--elevated`), лёгкая прозрачность панелей сообщений ассистента + тень, подложки у reasoning/tool-карточек; доступность: `:focus-visible` для кнопок/ссылок/инпутов, Esc закрывает все модалки (`useEscape`), `aria-live="polite"` для статуса агента, `role="dialog" aria-modal="true"` у модалок, aria-labels у иконок-кнопок (⚙, ⋯, ⟳, ✎, ✕, chip-remove, копирование), повышен контраст `--muted`. Подробности в §11.9.
- `v16`: дизайн P3 (навигация B — сайдбар) — постоянная левая панель `Sidebar.tsx`: список проектов (точка-running, активный подсвечен, клик = открыть/закрыть, повторный клик возвращает на обзор), секция «Архив» снизу, «＋ Новый проект» и «Настройки» в подвале. Список проектов поднят в App (поллинг 4 с) и проброшен в Dashboard/Sidebar; Dashboard стал управляемым (пропсы projects/loading/error/onChanged). `onChanged` из ProjectView (архив/удаление/переименование/старт-стоп) обновляет сайдбар мгновенно. Layout: `.app` → row [sidebar | .app-main(header+контент)]; сайдбар скрыт на мобильных (≤760px). Подробности в §11.10.
- `v17`–`v30`: стабилизация, мелкие фиксы, дизайн-доработки (детали в старых версиях журнала).
- `v31`: `Cache-Control: no-cache` для `web/dist/index.html` — фикс устаревшего бандла в браузере после обновлений.
- `v32`: загрузка .docx — opencode не понимает media type; сервер сам извлекает текст (`extractDocxText` в `server/src/index.js`, мини-ZIP-парсер, `word/document.xml` + `inflateRaw`), отдаёт `.txt` с `text/plain`; клиент использует `up.mime`/`up.url`.
- `v33`: фикс «зависших» сессий — `updateBusy` в `Chat.tsx` (ACTIVE_MS=60с, сброс busy по SSE-частицам и поллу с реальной дельтой); удалены 3 зависшие сессии.
- `v34`: архив сессий уровня сессии — `archivedSessions` в registry.js, роут `PUT /api/projects/:id/session/:sessionID/archive`, секции «Активные»/«Архив» в ProjectView, удаление сессии только из архива.
- `v35`: **первый снимок для дистрибуции** — вынос данных из папки приложения в `data/` (DATA_DIR/BASE_DIR/ROOT_DIR env, XDG_DATA_HOME, tokens/uploads в data), корневой keepalive, publish.cjs, стартеры, полный цикл install→update→rollback — всё проверено, `publish/WEBAIA-v35.zip` (95 МБ).
- `v36`: **веб-UI версий** — `versions.js` + `/api/versions` (list/switch/upload), `VersionsModal` + кнопка «Версии» в сайдбаре, E2E на портативной копии (install→upload→switch→rollback→stop) — OK. Фазы 1–4 плана дистрибуции закрыты.
- `v36` (иконки проектов): **иконки проектов + авто-определение тона** — новый `ProjectIcon.tsx` (эмодзи-значок проекта, авто-тон по пути: корень диска, Windows, Program Files, ProgramData и т.п.; распознавание `isSystemPath`), выбор эмодзи (набор `PROJECT_GLYPHS`) и тона (`auto|user|system`) через `IconPicker` в NewProjectModal и ProjectSettingsModal; поля `icon`/`iconTone` в registry (`create`/`update`, PATCH принимает оба); сайдбар `Sidebar.tsx` — иконка (эмодзи + точка running) и подсветка на hover (задержки 120/180 мс), плавное расширение; тени в панелях и футере сайдбара. Все изменения через API (create/update/persist). `publish/WEBAIA-v36.zip` (95.3 МБ), внутри `backups/v36` обновлён полностью.

## Дальнейшие шаги (из `design/analysis.md`)

- Все пункты P0–P3 выполнены. Дальше — по желанию: точечные доработки (скелетоны при загрузке, «стеклянные» слои с блуром для сообщений), либо стабилизация/регресс-тест всего UI.

---

## 15. Прочие факты, которые пригодятся следующему агенту

- Авторские (боевые) проекты в реестре трогать нельзя — только читать. Все эксперименты делать на временных проектах с удалением после теста (включая созданные папки в `Documents`).
- Для SSE обязателен `?token=`, т.к. EventSource не шлёт заголовки.
- Менеджер сам открывает браузер при старте, если не задан `WEBAIA_NO_BROWSER=1`.
- `projects.json` и `tokens.json` исключены из бэкапов намеренно (данные, не код). `.gitignore` уже покрывает их + `logs`, `dist`, `node_modules`.
- Менеджер сейчас работает под keepalive (`npm run serve`); при «проверь сервер» — сперва смотреть, жив ли `scripts/keepalive.js`, затем его дочерний `src/index.js`.
- В `web/dist` попадают файлы с хэшами — имя asset меняется при каждом билде; «старые» имена можно игнорировать.
- В реестре сейчас 4 проекта: EmlEGR, WEBAIAgent, `Тест2` (все три running, autoStart), `Системный` (путь `C:\Windows\System32`, остановлен, autoStart выкл) — последний создан, чтобы сессия-диалог (её directory = System32) была видна в вебе. Не удалять без явной просьбы.
- Схема: сессия «Проект1» ранее «зависла» на вопросе и была недостижима — пользователю рекомендовано создавать новую сессию; этот случай стал триггером разработки QuestionBar.

---

## 16. План дистрибуции (v35+) — развёртывание на другом ПК

Цель: переносимый дистрибутив WEBAIAgent (папка/zip), который можно скопировать на другой ПК (Windows) и запустить без установки Node.js и opencode.

### Утверждённые решения (19.08.2026, пользователь подтвердил все опции + Фазу 4)

1. **Переносная папка/zip** — весь продукт в одной папке `WEBAIA`.
2. **Встроенный portable Node.js** в комплекте (+~60 МБ).
3. **opencode.exe (178 МБ) всегда в комплекте, НО вне версий** — лежит в общем `bin/`, а не внутри папок версий (иначе каждый архив версии дублировал бы 178 МБ).
4. **Обновления вручную** — новый архив версии кладётся в `versions/`, активация переключением `current.txt`; старая версия остаётся в `versions/` и доступна для отката.

### Целевой макет

```
WEBAIA/
├─ bin/opencode.exe        # общий, вне версий (178 МБ)
├─ node/…                  # portable Node.js
├─ versions/
│  └─ v35/
│     ├─ server.bundle.mjs # esbuild-бандл сервера (ESM)
│     ├─ web/dist/…        # собранный фронтенд
│     └─ …                 # (keepalive НЕ здесь — он в корне)
├─ data/                   # ОБЩИЕ данные, вне версий
│  ├─ projects.json
│  ├─ settings.json
│  ├─ tokens.json
│  ├─ logs/
│  └─ opencode-data/       # БД сессий opencode (XDG_DATA_HOME)
├─ keepalive.bundle.mjs    # watchdog, в корне (вне версий)
├─ current.txt             # указатель на активную версию (не junction)
├─ start.cmd / stop.cmd    # запуск/остановка (PID в keepalive.pid)
├─ versions.cmd            # список/переключение версий
└─ backup.cmd              # резервная копия data/
```

### Ключевые решения по реализации

- **Переключение версий — `current.txt`**, НЕ junction/mklink (проще, надёжнее, без прав администратора). keepalive перечитывает `current.txt` при каждом рестарте менеджера.
- **keepalive живёт в корне WEBAIA** (вне versions), потому что должен переживать смену версий и уметь рестартовать менеджер любой версии.
- **esbuild-бандл сервера — в ESM (`.mjs`)**: `import.meta.url` недоступен в CJS-выводе, а код сервера активно его использует (`fileURLToPath`).
- **Env-схема** (dev без env работает как раньше):
  - `WEBAIA_ROOT` — папка версии (где `server.bundle.mjs` + `web/dist`)
  - `WEBAIA_DATA` — общий каталог данных (`data/`)
  - `WEBAIA_OPENCODE` — путь к opencode.exe (если не задан — поиск из `<корень>/bin`, `where`, npm)
  - `WEBAIA_NODE_ZIP` — (опция) путь к заранее скачанному portable Node zip вместо скачивания
  - `XDG_DATA_HOME` — менеджер выставляет `=<data>/opencode-data` при spawn opencode, чтобы БД сессий была в комплекте, а не в `%USERPROFILE%\.local\share\opencode`
- **Зависимости для publish**: `esbuild` (devDependency), zip — `archiver` либо PowerShell `Compress-Archive` (не финализировано).
- Portable Node скачивать с nodejs.org (ветка v24) или из `WEBAIA_NODE_ZIP`.

### Фазы

1. **Фаза 1 — вынос данных в `data/`** (чтобы смена/откат версий не трогал данные):
   - `server/src/config.js`: `ROOT_DIR = WEBAIA_ROOT || <корень>`; `BASE_DIR = WEBAIA_ROOT ? <корень> : ROOT_DIR`; `DATA_DIR = WEBAIA_DATA || SERVER_DIR`; `REGISTRY_FILE = DATA_DIR/projects.json`; `LOGS_DIR = DATA_DIR/logs`.
   - `server/src/settings.js`: `SETTINGS_FILE = DATA_DIR/settings.json`.
   - `server/src/manager.js`: `resolveExecutable()` — `WEBAIA_OPENCODE` → `<BASE_DIR>/bin/opencode.exe` → `where.exe` → npm-кандидат → `'opencode'`; spawn с `XDG_DATA_HOME=<DATA_DIR>/opencode-data` (только если задан `WEBAIA_DATA`).
   - `scripts/keepalive.js`: корневой, логи в `WEBAIA_DATA/logs`, entry `server.bundle.mjs` если есть иначе `src/index.js`, пишет `keepalive.pid`, перечитывает `current.txt` на каждом рестарте.
   - **Проверить**, что opencode на Windows реально уважает `XDG_DATA_HOME` (сейчас БД в `%USERPROFILE%\.local\share\opencode`).
2. **Фаза 2 — `scripts/publish.cjs`**: сборка web (npm run build) → esbuild-бандл сервера в `.mjs` → сборка zip-дистрибутива (bin/opencode.exe, node/, versions/v<N>/…, keepalive, стартеры, data/).
3. **Фаза 3 — стартеры и тест-цикл**: `start.cmd`/`stop.cmd`/`versions.cmd`/`backup.cmd`; полный цикл install→update→rollback на реальной копии.
4. **Фаза 4 — веб-UI «Версии»** в менеджере: роуты `/api/versions` (список/активация/откат/загрузка zip), секция в ProjectView/настройках.

### Состояние на момент остановки (19.08.2026)

- Завершены до этого: v31 (no-cache), v32 (docx-экстракция на сервере), v33 (фикс зависших сессий, удалены 3 зависшие сессии), v34 (архив сессий уровня сессии).
- **Фаза 1 — ВЫПОЛНЕНА и проверена:**
  - `server/src/config.js` — `ROOT_DIR`/`BASE_DIR`/`DATA_DIR` (env `WEBAIA_ROOT`/`WEBAIA_HOME`/`WEBAIA_DATA`), `REGISTRY_FILE`/`LOGS_DIR` на `DATA_DIR`, добавлены `VERSIONS_DIR`/`CURRENT_FILE`/`KEEPALIVE_PID_FILE` на `BASE_DIR`.
  - `server/src/settings.js` — `SETTINGS_FILE = DATA_DIR/settings.json`.
  - `server/src/auth.js` — `TOKEN_FILE = DATA_DIR/tokens.json` (важно для бандла).
  - `server/src/index.js` — `UPLOADS_DIR = DATA_DIR/uploads` (вместо %TEMP%).
  - `server/src/manager.js` — `resolveExecutable()`: `WEBAIA_OPENCODE` → `<BASE_DIR>/bin/opencode.exe` → where → npm; spawn с `XDG_DATA_HOME=<DATA_DIR>/opencode-data`.
  - `scripts/keepalive.js` — корневой, `IS_PORTABLE`-детект (наличие versions/bin/node рядом), `BASE_DIR = корень`, `PID_FILE`, лог в `data/logs`, `WEBAIA_HOME` передаётся менеджеру, перечитывает `current.txt` на рестарте.
  - **XDG_DATA_HOME проверен эмпирически**: opencode 1.18.18 на Windows создаёт БД в заданной папке (тест через node с `windowsHide: true`, без видимых окон).
- **Фаза 2 — ВЫПОЛНЕНА:** `scripts/publish.cjs` — сборка web → esbuild-бандл сервера и keepalive в **CJS** с подменой `import.meta.url` (banner + define), копирование opencode.exe в `bin/`, скачивание/распаковка portable Node (v24.18.0, кэш в `publish/.cache/`, env `WEBAIA_NODE_ZIP`), макет `WEBAIA/`, `current.txt`, лаунчеры, zip через PowerShell `ZipFile::CreateFromDirectory`. Готово: `publish/WEBAIA-v35.zip` (95 МБ).
- **Фаза 3 — ВЫПОЛНЕНА и протестирована:** start.cmd/stop.cmd/versions.cmd/backup.cmd; полный цикл install→update→rollback→stop на распакованной копии — OK. Найден и исправлен баг batch: `%VAR%` внутри блока `( )` раскрывается до присваивания — нужен `EnableDelayedExpansion` + `!VAR!` (в stop.cmd и versions.cmd).
- **Фаза 4 — ВЫПОЛНЕНА и протестирована E2E:**
  - `server/src/versions.js` — `listVersions`/`switchVersion`/`extractVersionZip` (распаковка через PowerShell, поиск вложенного `server.bundle.cjs`).
  - `server/src/index.js` — `GET /api/versions`, `POST /api/versions/switch`, `POST /api/versions/upload` (raw zip, лимит 1 ГБ) — после switch/upload менеджер перезапускается (`manager.stopAll()` + `process.exit(0)`, keepalive поднимает новую версию).
  - Веб: `VersionsModal.tsx`, кнопка «Версии» в футере сайдбара, API в `api.ts`, стили в `styles.css`.
  - E2E на портативной копии: install v35 → upload v36 → switch v36 → rollback v35 → stop — всё OK.
- **Система жива**: keepalive (новый, PID меняется) → менеджер `server/src/index.js` на 3720, health OK, проекты авто-стартуют, веб отдаёт новый бандл `index-DPwj3siI.js` (кнопка «Версии» в сайдбаре).
- Бэкапы: v1..v34 + v35 (снимок перед Фазой 1) + v36 (снимок после Фаз 1-4).

### Следующие шаги (продолжение)

1. ~~Бэкап v35~~ — сделано.
2. ~~Тест XDG_DATA_HOME~~ — сделано (работает).
3. ~~Рестарт менеджера на новом keepalive~~ — сделано, health OK.
4. ~~Фаза 2 (publish.cjs)~~ — сделано, `WEBAIA-v35.zip` готов.
5. ~~Фаза 3 (стартеры, тест-цикл)~~ — сделано, всё проходит.
6. ~~Фаза 4 (веб-UI версий)~~ — сделано, E2E прошёл.
7. Возможные доработки: автоопределение имени версии из имени zip (сейчас номер вводится вручную), тест на реальном втором ПК (распаковать zip, `start.cmd`), перенос реальных данных в `data/` при первом запуске (сейчас дистрибутив стартует с пустым реестром).
