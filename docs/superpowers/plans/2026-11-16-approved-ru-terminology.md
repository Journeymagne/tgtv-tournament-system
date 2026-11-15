# Approved Russian terminology implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement the approved table in the current isolated checkouts. Do not run automated tests locally (AGENTS.md); use exact-commit CI.

**Goal:** Apply the user's approved Russian terminology consistently to system UI in the website, Telegram bot, Mini App and native client.

**Architecture:** Edit existing locale values and their source-copy lookup keys together. Keep serialized game values, enum names, named teams/maps/operations, product names and authored user content stable. Update the existing glossary enforcement rather than adding a second translation layer.

**Tech Stack:** Node.js/CommonJS, browser JavaScript, React/TypeScript, Expo.

**Spec:** User's 30-row table and explicit clarification on 16 November 2026: Crit Op/Kill Op/Tac Op stay English; Roll-off = Бросок; Layout = Раскладка; Deployment = Расстановка.

## Global constraints

- Primary Op, Turning Point, Counteract, Order, Ready, Expended, Re-roll, Strategic Ploys, Firefight Ploys, Equipment and Wounds remain English when used as game terms.
- Killzone = Киллзона; Victory Points = Победные очки (VP abbreviation stays); Kill Team as a unit = Киллтим. Product name Kill Team and named teams stay unchanged.
- Mission = Миссия; Faction = Фракция; Operative = Оперативник; Activation = Активация; Initiative = Инициатива.
- Weapon/profile/rules = Оружие/профиль оружия/правила оружия; Ability/Action = Способность/действие; Shooting/Fighting/Melee = Стрельба/бой/ближний бой; Strike/Parry = Удар/парирование; Normal/Critical damage = Обычный/критический урон; Hit/Save = Попадание/сейв; Cover = Укрытие; Terrain/Visibility = Террейн/видимость; Token/Marker = Жетон/маркер.
- Order/Ready/Save in sorting, tournament statuses and save buttons retain ordinary Russian UI meanings. Terms 31–36 from the earlier audit remain outside this approval.
- Existing FAQ, saved training questions/answers and user-authored rules are editorial data, not system translation dictionaries; do not rewrite their contents or version signatures.
- No scoring, permissions, network behavior or database schema changes. No real test messages or game/account mutations.

## Review focus

- Distinguish Layout from Deployment and Crit Op from the complete Mission object.
- Preserve English translations when Russian source text is also the lookup key.
- Retain protected product names and stored team/map/operation values.
- Preserve ordinary Ready/Order/Save UI meanings outside game rules.
- Refresh immutable asset versions and inspect compact mobile/bot layouts.

## Task 1: Website, bot, Mini App and shared tools

- [ ] Update `public/i18n/glossary.js`, `docs/i18n-glossary.md` and existing glossary expectations in `test/unit/i18n.test.js` to the approved policy.
- [ ] Apply copy changes to `public/i18n/ru.js`, `src/telegram/game-messages.js`, `public/miniapp/{app.js,i18n.js}`, shared Companion/Studio/training UI dictionaries and relevant calculator/tracker UI copy. Update existing copy-based test expectations where needed; do not add tests mirroring text substitutions.
- [ ] Synchronize generated shared assets and affected immutable script versions. Inspect actual UI and fictional bot fixtures; run existing tests in CI only.

## Task 2: Native client

- [ ] Apply the same labels in `src/screens` and `src/api/audit-copy.ts`/`error-copy.ts`, retaining prior approved Primary Op changes.
- [ ] Compile with TypeScript, inspect RU/EN fixture screens and run the existing Mobile workflow on the exact commit. Keep distribution scope distinct from source/bundle verification.

## Task 3: Review and release

- [ ] Obtain an independent whole-change review and fix material findings. Record exact source revisions and CI evidence.
- [ ] Prepare matching RU/EN notes and normal web/bot release, verify both origins and public DB-backed notes. Keep rollout guarded by exact CI/source-tree checks.
- [ ] Report applied policy, verification and any remaining distribution limits concisely.
