# Устройства и соответствие UI-киту

Основа пяти смартфонов — **топ-5 продаж за полный 2025 год**, а не выдуманный рейтинг установленных устройств на ноябрь 2026. [Counterpoint, 29.01.2026](https://counterpointresearch.com/en/insights/iphone-16-worlds-best-selling-smartphone-in-2025-apple-takes-7-spots-in-top-10-models): iPhone 16, 16 Pro Max, 16 Pro, 17 Pro Max, Galaxy A16 5G. Модели с одинаковой геометрией проверяются отдельно, но не требуют разных CSS/компонентов. Более свежий [отчёт Q2 2026](https://counterpointresearch.com/en/insights/iphone-17-global-best-selling-smartphone-in-q2-2026) подтверждает актуальность классов 402×874 и большого Galaxy; дополнительно включён класс S26 Ultra.

Все размеры в `devices.json` — логические viewport для проверки, не физические пиксели дисплея. Android dp зависит от настройки плотности/масштаба; модель телефона не гарантирует единственную ширину. Настоящее приложение использует `useWindowDimensions` и safe-area, а не определение модели устройства.

| Устройство | Портрет, логические единицы |
|---|---|
| iPhone 16 | 393 × 852 |
| iPhone 16 Pro Max | 440 × 956 |
| iPhone 16 Pro | 402 × 874 |
| iPhone 17 Pro Max | 440 × 956 |
| Galaxy A16 5G | 360 × 780 |
| iPad mini A17 Pro | 744 × 1133 |
| iPad Pro 11 M4 | 834 × 1210 |
| Galaxy Tab S10 FE | 960 × 1536 |

Дополнительно: landscape, 320×640, 412×892 и границы 599/600/839/840. При ширине от 600 — боковая навигация; от 840 — широкие составные формы. В split view обратно включается компактная раскладка. Ширина контента ограничена 1180, поля не растягиваются на весь большой монитор. Все страницы прокручиваются, формы учитывают клавиатуру, пользовательское увеличение шрифта не отключено.

## UI Kit

- Цвета генерируются из `../public/companion-tokens.css` через `npm run tokens`; CI проверяет отсутствие расхождений.
- Оригинальные mark-dark/mark-light и app-icon. Круглые аватары, оранжевая обводка 2, инициалы при отсутствии или ошибке фото.
- Primary/secondary/danger: радиус 7, шрифт 14, точное начертание Inter 650, горизонтальный отступ 12, без объёмных теней. Тёмный текст на primary в обеих темах. Focus/pressed/hover/disabled заданы общим компонентом.
- Счётчик уведомлений скрыт при 0, числовой до 99, затем 99+.
- **Адаптация платформ:** minimum touch target 48 вместо 44 веб-кита; safe area, системные status/navigation bars, нативная клавиатура. Это не изменение канонического веб-кита.
- Карточки, раскладка страниц и bottom/side navigation являются мобильным расширением кита. В базовом ките нет готовых экземпляров каждого турнирного экрана; они используют одни и те же примитивы.
- Inter получен из [официального репозитория](https://github.com/rsms/inter/tree/master/docs/font-files), лицензия в assets/fonts/LICENSE.txt. Статические варианты 400/650/800 созданы из variable font, имена изменены на CompanionInter. Остальные системные подписи используют платформенный sans-serif, разрешённый стеком веб-кита.

## Источники спецификаций

[iPhone 16](https://support.apple.com/en-us/121029), [iPhone 17 Pro](https://support.apple.com/en-us/125090), [Galaxy A16](https://www.samsung.com/uk/smartphones/galaxy-a/galaxy-a16-5g-blue-black-128gb-sm-a166bzkdeub/), [iPad Pro 11 M4](https://support.apple.com/en-us/119892), [Samsung tablet emulator skins](https://developer.samsung.com/galaxy-emulator-skin/galaxy-tab.html). Проверка геометрии через React Native Web не заменяет проверку клавиатуры, cookies, accessibility и safe-area на реальных Android/iOS.
