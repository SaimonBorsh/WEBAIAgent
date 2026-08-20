# Референсы по дизайну (собрано 19.08.2026)

## Чат / AI-интерфейсы (2026)
- GroovyWeb — «12 UI/UX Design Trends for AI Apps in 2026»: dark by default + system-aware switch, skeleton loading, glassmorphism-слои для ИИ-выводов, стриминг с курсором. https://www.groovyweb.co/blog/ui-ux-design-trends-ai-apps-2026
- Eucalipse — «AI Chat UX: Structured Cards, Thinking Traces, and Suggestion Pills»: состояния «думает/действует/отвечает», свёрнутые reasoning-трейсы, пилюли-подсказки, карточки для структурированных ответов. https://eucalipse.com/articles/ai-chat-ux-design-patterns
- TheFrontKit — «AI Chat UI Best Practices for 2026»: стоп/ретрай, копирование кода, поиск по истории, aria-live, видимый фокус, буферизация markdown при стриминге. https://thefrontkit.com/blogs/ai-chat-ui-best-practices
- Metacto — «AI Chat UX Patterns for Production»: 3 фазы работы (planning/acting/responding) с корректной семантикой отмены; стрим-события ошибок; tool-карточки как первоклассные UI-события. https://www.metacto.com/blogs/ai-chat-ux-patterns-production

## AI-дашборды
- Lazarev.agency — «AI dashboard design: 7 proven principles»: provenance/уверенность/fallback, настраиваемость под пользователя, контекст вместо клиентов. https://www.lazarev.agency/articles/ai-dashboard-design

## Инструментальные дашборды / навигация
- Vercel — «New dashboard navigation» (2026): постоянный сайдбар, консистентные табы, проект-фильтры, мобильный bottom bar. https://vercel.com/changelog/new-dashboard-navigation-available
- Vercel Labs nav demo (код-референс структуры сайдбара). https://github.com/vercel-labs/vercel-nav-demo
- Design-bootcamp — «Vercel's New Dashboard UX»: zero-fluff navigation, context beats customization, dark mode «сделанная первой». https://medium.com/design-bootcamp/vercels-new-dashboard-ux-what-it-teaches-us-about-developer-centric-design-93117215fe31
- GitHub keylessh design_guidelines — краткие правила сайдбара 256px, топ-бара 64px, карточек-сетки, статус-точек, мобильного стека. https://github.com/sashyo/keylessh/blob/main/design_guidelines.md

## Переносимые паттерны для WEBAIAgent
1. Dark по умолчанию + переключатель темы (системная/тёмная/светлая).
2. Три состояния работы агента: думает → действует → отвечает, с кнопкой «Остановить» на месте «Отправить».
3. Строка сессии: имя + превью + время; модель — только в настройках.
4. Пустой экран = композер по центру + пилюли-подсказки.
5. Второстепенные действия в «⋯» (Linear/Vercel).
6. Слои глубины: база → поверхность → карточка → модалка, тени + лёгкая прозрачность.
