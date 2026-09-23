/* Shared UI copy. Translate interface text in place: never replace a form,
   change a field value, or translate authored team/card content. */
(function () {
  "use strict";
  const pairs = [
    ["Турнирная система", "Tournament system"], ["Калькулятор инициативы", "Initiative Calculator"],
    ["Трекер активаций", "Activation Tracker"], ["КТ Студия", "KT Studio"],
    ["На главную KT Companion", "KT Companion home"], ["Войти", "Sign in"], ["Выйти", "Sign out"],
    ["Выберите инструмент", "Choose a tool"], ["Открыть →", "Open →"],
    ["Турниры, паринги, результаты матчей и рейтинг игроков.", "Tournaments, pairings, match results and player rankings."],
    ["Расчёт инициативы с перебросами, модификаторами и способностями команд.", "Calculate initiative with re-rolls, modifiers and team abilities."],
    ["Порядок активаций в фазе Firefight, окна контрдействий и наглядный трек ходов.", "Firefight activation order, counteract windows and a visual turn tracker."],
    ["Создавайте команды и карточки, сохраняйте черновики и публикуйте их в библиотеке.", "Create teams and cards, save drafts and publish them in the library."],
    ["Инструменты для Warhammer Kill Team: инициатива, активации, турниры и создание собственных команд. Проект сообщества", "Tools for Warhammer Kill Team: initiative, activations, tournaments and custom teams. A community project by"],
    ["Поддержать проект", "Support the project"], ["Наш Telegram", "Our Telegram"], ["Поддержать на Boosty", "Support on Boosty"],
    ["Новости, анонсы стримов и обсуждения Kill Team.", "News, stream announcements and Kill Team discussions."],
    ["Эксклюзивные материалы и поддержка канала.", "Exclusive content and support for the channel."],
    ["Следите за новостями, обсуждайте Kill Team и помогайте развивать Thundergrounds TV.", "Follow the news, discuss Kill Team and help develop Thundergrounds TV."],
    ["Как это работает", "How it works"], ["О контрдействиях", "About counteracts"], ["Журнал расчёта", "Calculation log"],
    ["Рассчитайте шанс получить инициативу с учётом карт и способностей.", "Calculate your initiative chance with cards and abilities."],
    ["Задайте число оперативников и инициативу — получите порядок активаций.", "Set operative counts and initiative to see the activation order."],
    ["Карты игроков", "Player Cards"], ["Игрок 1", "Player 1"], ["Игрок 2", "Player 2"], ["Переброс", "Re-roll"],
    ["Способности", "Abilities"], ["Победа при ничьей", "Win Ties"], ["Число симуляций", "Simulation Count"],
    ["Рассчитать", "Calculate"], ["Результат", "Result"], ["Скачать журнал", "Download log.txt"],
    ["Выполните расчёт, чтобы увидеть шансы игроков.", "Run the simulation to see each player's win chance."],
    ["Здесь появится журнал расчёта.", "The log will appear here."],
    ["Симуляция бросков инициативы с картами переброса, модификаторами +1/−1, +2/−2, +3/−3 и способностями команд. Способности применяются до переброса картой. Значение +1d3 известно до решения о перебросе; результаты перебросов картой открываются после решений обоих игроков.", "Simulates initiative rolls with Re-roll cards, +1/-1, +2/-2, +3/-3 modifiers, and team abilities. Abilities are applied before Re-roll; +1d3 is revealed before card Re-roll decisions, and card Re-roll results are not known before both players decide."],
    ["Настройки", "Settings"], ["Мои активации", "My activations"], ["Активации соперника", "Opponent activations"],
    ["Кто ходит первым", "Who goes first"], ["Я", "Me"], ["Соперник", "Opponent"],
    ["шагов в треке", "steps in track"], ["окон контрдействия", "counteract windows"], ["первая активация", "first activation"],
    ["Моя активация", "My activation"], ["Активация соперника", "Opponent activation"], ["Контрдействие", "Counteract"],
    ["Укажите число активаций у себя и соперника и кто владеет инициативой. Трекер строит порядок фазы Firefight: стороны чередуются, а когда у одной заканчиваются готовые оперативники, появляются окна контрдействия.", "Enter your activations, your opponent's activations, and who has initiative. The tracker builds the Firefight phase order: activations alternate, and once one side runs out, counteract windows appear."],
    ["Контрдействие показано отдельным шагом стороны, у которой не осталось готовых оперативников. Оно необязательно и доступно потратившему активацию оперативнику с приказом Engage один раз за поворотный момент.", "Counteract is shown as a separate step for the side that has no ready operatives left. In-game it is optional and only available to an expended operative with an Engage order, once per turning point."],
    ["Редактор", "Editor"], ["Мои черновики", "My drafts"], ["Библиотека", "Library"], ["Библиотека команд", "Team library"],
    ["Опубликовать", "Publish"], ["Публикую…", "Publishing…"], ["Обновить публикацию", "Update publication"],
    ["Сохранить команду", "Save team"], ["Сохраняю…", "Saving…"], ["Экспорт", "Export"],
    ["Сохранить ростер в .rosz", "Export roster (.rosz)"], ["Скачать ростер команды (.rosz)", "Download team roster (.rosz)"],
    ["↓ PDF для печати", "↓ Print PDF"], ["+ Создать команду", "+ Create team"], ["Создать команду", "Create team"],
    ["+ Карточка", "+ Card"], ["+ Страница", "+ Page"], ["Показать карточку", "Show card"], ["Редактировать карточку", "Edit card"],
    ["Показать страницу", "Show page"], ["Редактировать страницу", "Edit page"], ["КОЛОДА КОМАНДЫ", "TEAM DECK"],
    ["Состав киллтима", "Kill team selection"], ["Правила команды", "Team rules"], ["Оперативники", "Operatives"],
    ["Картинки и лор", "Images and lore"], ["Проект и исходники", "Project and sources"], ["КАРТОЧКА В ПЕЧАТИ", "PRINT PREVIEW"],
    ["Карточки для печати", "Printable cards"], ["ШАБЛОН BLADES OF KHAINE", "BLADES OF KHAINE TEMPLATE"],
    ["Гостевой режим · войдите, чтобы сохранить или опубликовать команду", "Guest mode · sign in to save or publish a team"],
    ["Гостевые правки · войдите для сохранения в аккаунте", "Guest edits · sign in to save to your account"],
    ["Сохраняю в аккаунт…", "Saving to your account…"], ["Есть правки · сохраняю автоматически", "Unsaved changes · saving automatically"],
    ["Первое изменение создаст черновик в аккаунте", "Your first edit creates an account draft"],
    ["Подключаю хранилище аккаунта…", "Connecting to account storage…"], ["Подключаю хранилище…", "Connecting to storage…"],
    ["Правки ещё не сохранены в аккаунте · повторите попытку", "Changes are not saved to your account yet · try again"],
    ["Повторить", "Retry"], ["Открываем Студию…", "Opening Studio…"], ["Открываю проект…", "Opening project…"],
    ["СОСТАВ КИЛЛТИМА", "KILL TEAM SELECTION"], ["Название карточки", "Card name"], ["ДВА АРХЕТИПА", "TWO ARCHETYPES"],
    ["Архетип 1", "Archetype 1"], ["Архетип 2", "Archetype 2"], ["Оба архетипа печатаются одной строкой на цветной плашке.", "Both archetypes print on one line in the colored strip."],
    ["Группы выбора, варианты вооружения и общие ограничения — в формате оригинальной карточки состава.", "Selection groups, weapon options and restrictions in the original selection card format."],
    ["Четыре карточки снаряжения. Оружие и правила редактируются внутри каждой карточки.", "Four equipment cards. Edit weapons and rules inside each card."],
    ["Четыре карточки Firefight Ploys.", "Four Firefight Ploys cards."], ["Четыре карточки. Зелёно-серые плашки — как в оригинале.", "Four cards with the original green-gray strips."],
    ["Любое число карточек правил фракции. Состав находится в отдельной вкладке.", "Any number of faction rule cards. Team selection has its own tab."],
    ["Диорамы, история команды, сборка миниатюр и примеры покраса. Отдельные страницы A4 после карточек в PDF.", "Dioramas, team lore, model assembly and paint examples. Separate A4 pages after the cards in the PDF."],
    ["Название", "Name"], ["Текст", "Text"], ["Тип", "Type"], ["Дальнобойное", "Ranged"], ["Ближний бой", "Melee"],
    ["Правила оружия", "Weapon rules"], ["Группа режимов", "Mode group"], ["Режим", "Mode"], ["Стоимость, AP", "Cost, AP"],
    ["Число оперативников", "Operative count"], ["Формулировка после числа", "Text after count"], ["Строка списка", "List entry"],
    ["Вложенные варианты — по одному на строку", "Nested options — one per line"], ["Связанная карточка оперативника", "Linked operative card"],
    ["Без ссылки", "No link"], ["Удалить строку", "Remove row"], ["+ Строка списка", "+ List entry"], ["Удалить группу", "Remove group"],
    ["+ Группа выбора", "+ Selection group"], ["Удалить из карточки", "Remove from card"], ["+ Профиль оружия", "+ Weapon profile"],
    ["+ Способность", "+ Ability"], ["+ Действие", "+ Action"], ["КАРТИНКА", "IMAGE"], ["Добавить картинку", "Add image"],
    ["Заменить картинку", "Replace image"], ["Удалить картинку", "Remove image"], ["Выбрать область", "Crop image"], ["Изменить область", "Adjust crop"],
    ["PNG, JPG или WebP · до 10 МБ.", "PNG, JPG or WebP · up to 10 MB."], ["Сохраняется в проекте, PDF и TTS.", "Saved in the project, PDF and TTS."],
    ["Выберите область картинки для заголовка профиля. Исходник остаётся доступен для повторной обрезки.", "Choose the image area for the profile header. The original remains available for recropping."],
    ["Картинка появится после текста правила. Если места не хватит, она перейдёт на следующую сторону.", "The image appears after the rule text and continues on the next side if needed."],
    ["Ж", "B"], ["К", "I"], ["Оранжевый", "Orange"], ["Кегль, пт", "Size, pt"], ["Сброс", "Clear"],
    ["Как форматировать текст", "Text formatting help"], ["Размер шрифта в пунктах", "Font size in points"],
    ["Можно писать вручную:", "You can type formatting manually:"], ["Размер — от 6 до 24 пт. Для обычной звёздочки используйте", "Size: 6 to 24 pt. For a literal asterisk, use"],
    ["Загрузить проект", "Import project"], ["Скачать проект", "Download project"], ["Скачать исходные данные", "Download source data"],
    ["Вернуть тестовую команду", "Restore example team"], ["Пустая команда", "Empty team"], ["Добавьте состав, правила и карточки с нуля.", "Build your selection, rules and cards from scratch."],
    ["Дублировать карточку", "Duplicate card"], ["Дублировать состав", "Duplicate selection"], ["Дублировать страницу", "Duplicate page"],
    ["Удалить карточку", "Delete card"], ["Удалить состав", "Delete selection"], ["Удалить страницу", "Delete page"],
    ["Удалить изображение", "Delete image"], ["Удалить логотип", "Delete logo"], ["Удалить вариант", "Remove option"],
    ["Очистить место", "Clear slot"], ["Выберите предмет", "Choose an item"], ["Заполнить эту карточку", "Fill this card"],
    ["Заменить", "Replace"], ["Добавьте первую карточку.", "Add your first card."], ["Отмена", "Cancel"], ["Применить", "Apply"],
    ["Переименовать", "Rename"], ["Удалить", "Delete"], ["Да, удалить", "Yes, delete"], ["Подождите…", "Please wait…"],
    ["Продолжить редактирование", "Continue editing"], ["Смотреть команду", "View team"], ["ЧЕРНОВИК", "DRAFT"], ["ОПУБЛИКОВАНО", "PUBLISHED"],
    ["Загружаю команды…", "Loading teams…"], ["Поиск по названию и описанию", "Search by name and description"], ["Найти команду…", "Find a team…"],
    ["Все команды, опубликованные на сайте. Откройте команду, чтобы посмотреть состав, правила и карточки.", "All teams published on the site. Open a team to view its selection, rules and cards."],
    ["Пока никто не опубликовал команду. Ваша может стать первой.", "No teams have been published yet. Yours could be the first."],
    ["Пока нет черновиков. Создайте пустую команду и начните её заполнять — сохранение включится автоматически.", "No drafts yet. Create a team and start editing — your changes save automatically."],
    ["Хранилище недоступно. Показываю ранее загруженный список черновиков.", "Storage is unavailable. Showing previously loaded drafts."],
    ["В этом разделе нет карточек.", "There are no cards in this section."], ["← Назад", "← Previous"], ["Дальше →", "Next →"],
    ["КОМАНДА ИЗ БИБЛИОТЕКИ", "LIBRARY TEAM"], ["Доступен только вам", "Only visible to you"],
    ["Оперативники и выбранное оружие", "Operatives and selected weapons"], ["Оружие, способности и действия этой карточки", "Weapons, abilities and actions on this card"],
    ["После вставки оружие и правила редактируются прямо здесь.", "After insertion, edit the weapons and rules here."],
    ["Расстояния в дюймах, например 6″. При вставке старые символы переводятся автоматически.", "Distances are in inches, such as 6″. Legacy symbols are converted when pasted."],
    ["Расстояния указаны в дюймах. Условия выбора редактируются на карточке состава.", "Distances are in inches. Edit selection conditions on the team selection card."],
    ["Это полный ростер для выбора моделей перед игрой. Правила выбора боевой команды остаются на карточке состава.", "This is the full roster for choosing models before a game. Team selection rules remain on the selection card."],
    ["↑ Раньше в PDF", "↑ Earlier in PDF"], ["↓ Позже в PDF", "↓ Later in PDF"], ["↓ PDF карточки состава", "↓ Selection card PDF"], ["↓ PDF раздела", "↓ Section PDF"],
    ["Текст продолжается на следующей стороне. Все стороны войдут в PDF.", "Text continues on the next side. All sides are included in the PDF."],
    ["Четыре стороны на листе · метки реза", "Four sides per sheet · crop marks"],
    ["ЭКСПОРТ КОЛОДЫ", "DECK EXPORT"], ["Куда распакуете архив?", "Where will you extract the archive?"],
    ["Собрать ZIP с колодами", "Build deck ZIP"], ["↓ Скачать ZIP", "↓ Download ZIP"],
    ["Изображения останутся в этой папке. Если перенесёте её, откройте IMPORT.html из архива, чтобы обновить пути в колодах.", "Keep the images in this folder. If you move it, open IMPORT.html from the archive to update the deck paths."],
    ["Для игры с друзьями загрузите изображения в Steam Cloud через TTS. Инструкция и настройка ссылок входят в архив.", "To play with friends, upload the images to Steam Cloud through TTS. Instructions and link setup are included in the archive."],
    ["Распакуйте архив и откройте", "Extract the archive and open"], ["— там настройка и пошаговый импорт.", "for setup and step-by-step import."],
    ["Область картинки оперативника", "Operative image crop"], ["Всё изображение", "Entire image"], ["Выбранный фрагмент", "Selected area"],
    ["Загружаю картинку…", "Loading image…"], ["Выделите область на картинке. Рамку можно двигать и менять за углы. Исходное изображение сохранится.", "Select an image area. Move the frame or resize its corners. The original image is preserved."],
    ["На карточку попадёт только эта область, с сохранением пропорций.", "Only this area appears on the card, keeping its proportions."],
    ["Имя", "Name"], ["Пароль", "Password"], ["Повторите пароль", "Repeat password"], ["Регистрация", "Register"], ["Вход", "Sign in"],
    ["Создать аккаунт", "Create account"], ["Войдите, чтобы открыть свои черновики.", "Sign in to open your drafts."],
    ["Войдите, чтобы опубликовать команду.", "Sign in to publish your team."], ["Войдите, чтобы сохранить команду.", "Sign in to save your team."],
    ["Войдите в свой аккаунт KT Companion.", "Sign in to your KT Companion account."],
    ["Команда сохранена в вашем аккаунте.", "Team saved to your account."], ["Вход выполнен. Ваши правки перенесены в аккаунт.", "Signed in. Your edits were transferred to your account."],
    ["Здесь появится страница вашего альбома", "Your album page will appear here"],
    ["Соберите альбом команды: панорамные фото, историю, инструкции по сборке и примеры покраса.", "Build a team album with panoramic photos, lore, assembly instructions and paint examples."],
    ["Можно выбрать несколько файлов. PNG, JPG или WebP, до 10 МБ каждый. Изображения сохраняют пропорции и целиком помещаются на странице.", "Choose one or more PNG, JPG or WebP files, up to 10 MB each. Images retain their proportions and fit on the page."],
    ["A4, по четыре стороны на листе, метки реза. Правила: 70 × 121 мм. Оперативники: 121 × 70 мм.", "A4, four sides per sheet, with crop marks. Rules: 70 × 121 mm. Operatives: 121 × 70 mm."],
    ["Печатается в чёрной шапке под названием оперативника. Длинный текст переносится на следующие стороны.", "Printed in the black header under the operative name. Long text continues on the following sides."],
    ["Стратегические уловки", "Strategic Ploys"], ["Боевые уловки", "Firefight Ploys"], ["Снаряжение", "Equipment"],
    ["Общие ограничения", "General restrictions"], ["Ограничения состава и сноски", "Selection restrictions and footnotes"],
    ["Пояснения к терминам", "Term definitions"], ["Дополнительный текст", "Additional text"], ["Вводный текст", "Introduction"],
    ["Художественный текст", "Flavor text"], ["Оружие", "Weapons"], ["Действия", "Actions"], ["Карточка", "Card"],
    ["Карточки", "Cards"], ["Подзаголовок", "Subtitle"], ["Текст карточки", "Card text"], ["Правило", "Rule"],
    ["Стоимость (если есть)", "Cost (optional)"], ["Выбрать из исходника", "Choose from source"], ["Ограничения", "Restrictions"],
    ["Кто может взять", "Eligible operatives"], ["Один на команду", "One per team"], ["Разрешено Nob Basha", "Available to Nob Basha"],
    ["Профиль", "Profile"], ["Ключевые слова через запятую", "Keywords, separated by commas"], ["Расположение правил", "Rules layout"],
    ["Размер базы (мм)", "Base size (mm)"], ["Печатается в правом нижнем углу датакарты. Оставьте пустым, чтобы скрыть.", "Printed in the bottom-right corner of the datacard. Leave blank to hide."],
    ["На всю ширину", "Full width"], ["В две колонки", "Two columns"], ["Текст оперативника", "Operative text"],
    ["Комплектации", "Loadouts"], ["+ Вариант", "+ Loadout"], ["Логотип команды", "Team logo"],
    ["Загрузить логотип", "Upload logo"], ["Заменить логотип", "Replace logo"], ["Выбрать логотип команды", "Choose team logo"],
    ["Свободная карточка", "Custom card"], ["Страница в печати", "Page preview"], ["Страница A4", "A4 page"],
    ["Команда", "Team"], ["Версия", "Version"], ["Печать", "Print"], ["Акцент", "Accent"],
    ["Примечание о стоимости Ploys", "Ploy cost note"], ["Исходные материалы", "Source materials"], ["Перенос проекта", "Project transfer"],
    ["Ростер для TTS / Data Team", "Roster for TTS / Data Team"], ["Ростер .rosz · KT 2024", "Roster .rosz · KT 2024"],
    ["Исходные материалы команды", "Team source materials"], ["В архиве сохранены исходные данные команды.", "The archive contains the original team data."],
    ["Загрузите файл в", "Upload the file to"], [", затем вставьте полученный код в", ", then paste the resulting code into"],
    ["Та же карточка будет напечатана в PDF.", "The same card is included in the PDF."], ["Отдельные страницы после карточек", "Separate pages after the cards"],
    ["Нажмите «+ Страница», добавьте текст и загрузите изображения.", "Click “+ Page”, add text and upload images."],
    ["Печатайте в масштабе 100%. Стороны с продолжением идут последовательно, как в новом примере. Длинные правила автоматически переходят на следующую сторону.", "Print at 100% scale. Continuation sides follow in order. Long rules automatically continue on the next side."],
    ["PNG, JPG или WebP · до 10 МБ. Логотип целиком вписывается в квадрат, как в Stats. Прозрачность PNG сохраняется. Появится на карточках и в библиотеке, войдёт в PDF и TTS.", "PNG, JPG or WebP · up to 10 MB. The logo fits inside a square, as in Stats. PNG transparency is preserved. It appears on cards and in the library, PDF and TTS."],
    ["Выберите область картинки для заголовка профиля. Исходник остаётся доступен для повторной обрезки. Сохраняется в проекте, PDF и TTS.", "Choose the image area for the profile header. The original remains available for recropping. Saved in the project, PDF and TTS."],
    ["Картинка появится после текста правила. Если места не хватит, она перейдёт на следующую сторону. Сохраняется в проекте, PDF и TTS.", "The image appears after the rule text and continues on the next side if needed. Saved in the project, PDF and TTS."],
    ["Выделите текст и нажмите Ж, К, «Оранжевый» или выберите кегль. Повторное нажатие «Оранжевый» снимает цвет. Кнопки 💀, ▶ и ◆ вставляют черепок, зелёный треугольник и красный ромб в позицию курсора. Для пунктов действия ставьте ▶ или ◆ в начале новой строки — продолжение выровняется по тексту. Без выделения кегль применяется ко всему полю.", "Select text and choose B, I, Orange or a font size. Click Orange again to remove the color. The 💀, ▶ and ◆ buttons insert a skull, green triangle or red diamond at the cursor. Start an action paragraph with ▶ or ◆ to align wrapped lines with its text. Without a selection, font size applies to the whole field."],
    ["**жирный**", "**bold**"], ["*курсив*", "*italic*"], ["***оба***", "***both***"],
    ["[color=orange]оранжевый 💀[/color]", "[color=orange]orange 💀[/color]"], ["[size=12]текст[/size]", "[size=12]text[/size]"],
    [". Размер — от 6 до 24 пт. Для обычной звёздочки используйте", ". Size: 6 to 24 pt. For a literal asterisk, use"],
    ["Аккаунт KT Companion", "KT Companion account"], ["Имя пользователя", "Username"],
    ["Игровой ник (необязательно)", "Player nickname (optional)"], ["Единый аккаунт для Студии и турнирной системы.", "One account for Studio and the tournament system."],
    ["Начните с пустой команды или создайте свою копию готового шаблона.", "Start with an empty team or make your own copy of a template."],
    ["Состав и правила команды", "Team selection and rules"], ["Переименовать киллтиму", "Rename kill team"],
    ["Сохранить название", "Save name"], ["Обновить список", "Refresh list"], ["Удалить команду?", "Delete team?"], ["Удалить команду", "Delete team"],
    ["Название команды изменено.", "Team renamed."], ["Команда удалена.", "Team deleted."],
    ["Введите название команды.", "Enter the team name."], ["Сначала сохраните команду в аккаунте.", "Save the team to your account first."],
    ["Правки только в этом браузере · войдите для сохранения", "Edits are only in this browser · sign in to save"],
    ["Сохраняю изменения…", "Saving changes…"], ["Копия шаблона создана.", "Template copy created."],
    ["Пустой проект создан. Укажите название команды и добавьте карточки.", "Empty project created. Name your team and add cards."],
    ["Собираю PDF…", "Building PDF…"], ["Файл опубликованной команды готов.", "Published team export is ready."],
    ["Выберите два разных архетипа", "Choose two different archetypes"], ["Заголовок", "Heading"], ["Тема", "Category"],
    ["Лор или описание", "Lore or description"], ["Расположение изображений", "Image layout"],
    ["Крупные изображения на всю ширину", "Large full-width images"], ["Галерея в две колонки", "Two-column gallery"],
    ["Изображения", "Images"], ["+ Добавить картинки", "+ Add images"], ["Эта страница войдёт в PDF после карточек.", "This page appears after the cards in the PDF."],
    ["Пароли не совпадают.", "Passwords do not match."], ["Неверное имя пользователя или пароль.", "Invalid username or password."],
    ["Это имя пользователя уже занято.", "This username is already taken."], ["Слишком много попыток. Попробуйте позже.", "Too many attempts. Try again later."],
    ["Не удалось войти. Попробуйте ещё раз.", "Could not sign in. Try again."],
    ["Не удалось связаться с сервером. Проверьте соединение и повторите попытку.", "Could not reach the server. Check your connection and try again."],
    ["Войти / проверить вход", "Sign in / check session"], ["Не удалось выйти. Повторите попытку.", "Could not sign out. Try again."],
    ["Предыдущая сторона", "Previous side"], ["Следующая сторона", "Next side"], ["Закрыть", "Close"],
    ["Закрыть окно входа", "Close sign-in dialog"], ["Закрыть экспорт", "Close export"], ["Закрыть просмотр команды", "Close team viewer"],
    ["Разделы студии", "Studio sections"], ["Вход или регистрация", "Sign in or register"],
    ["Карты игрока 1", "Player 1 cards"], ["Карты игрока 2", "Player 2 cards"], ["Порядок активаций", "Activation order"],
    ["Добавить оружие", "Add weapon"], ["+ Добавить оружие", "+ Add weapon"], ["Сохранить профиль", "Save profile"],
    ["Новый профиль с нуля", "New blank profile"],
    ["«Сохранить профиль» добавляет оружие в список этого проекта. Повторное сохранение с тем же названием, типом и режимом обновляет профиль. Уже добавленное на карточки оружие редактируется отдельно.", "“Save profile” adds the weapon to this project's list. Saving the same name, type and mode updates that profile. Weapons already placed on cards are edited separately."]
  ];
  const ru = new Map(), en = new Map(), ruUpper = new Map(), enUpper = new Map();
  for (const [a, b] of pairs) {
    ru.set(a, a); ru.set(b, a); en.set(a, b); en.set(b, b);
    for (const source of [a, b]) { ruUpper.set(source.toUpperCase(), a.toUpperCase()); enUpper.set(source.toUpperCase(), b.toUpperCase()); }
  }
  const patterns = [
    [/^ГРУППА ВЫБОРА (\d+)$/, "SELECTION GROUP $1"], [/^Всего в группах: (\d+) оперативников$/, "Total in groups: $1 operatives"],
    [/^Шаблон состава · (\d+ × \d+) мм$/, "Selection template · $1 mm"], [/^Страница (.+)$/, "Page $1"], [/^Сторона (.+)$/, "Side $1"],
    [/^Команд: (\d+)$/, "Teams: $1"], [/^Оперативников: (\d+)$/, "Operatives: $1"], [/^(\d+) на этой карте$/, "$1 on this card"],
    [/^Сохранено в аккаунте · (.+)$/, "Saved to account · $1"], [/^Автор:$/, "Author:"], [/^Есть публикация · (.+)$/, "Published · $1"],
    [/^(.+) \/ КАРТОЧКИ$/, "$1 / CARDS"], [/^(.+) \/ АЛЬБОМ$/, "$1 / ALBUM"],
    [/^(.+) · стр\. (\d+)$/, "$1 · p. $2"], [/^(\d+ × \d+) мм$/, "$1 mm"],
    [/^Создать копию шаблона · (.+)$/, "Copy template · $1"], [/^Снаряжение (.+)$/, "$1 equipment"],
    [/^(.+) · (\d+) карт · (\d+) двусторонних$/, "$1 · $2 cards · $3 double-sided"],
    [/^(\d+) профилей оперативников с вариантами оружия\. Характеристики, способности и правила берутся из текущих карточек команды\.$/, "$1 operative profiles with weapon options. Stats, abilities and rules come from the current team cards."],
    [/^Версия (.+) · опубликовано (.+)$/, "Version $1 · published $2"], [/^Подпись (\d+)$/, "Caption $1"],
    [/^Материал занимает (\d+) стр\. A4\. Все страницы войдут в PDF\.$/, "Content spans $1 A4 pages. All pages are included in the PDF."],
    [/^Команда «(.+)» опубликована в библиотеке\.$/, "Team “$1” published in the library."]
  ];
  const locale = () => window.KTAppearance?.locale || document.documentElement.lang || "ru";
  function text(value) {
    const key = value.trim().replace(/\s+/g, " ");
    const english = locale() === "en";
    const translation = (english ? en : ru).get(key) ?? (english ? enUpper : ruUpper).get(key);
    if (translation !== undefined) return value.replace(value.trim(), translation);
    if (locale() === "en") for (const [pattern, replacement] of patterns) if (pattern.test(key)) return key.replace(pattern, replacement);
    return value;
  }
  const skip = 'script,style,svg,textarea,input,[contenteditable],[data-ui-skip],.physical-card,#record-list,.project-name,.team-tile h2,.team-tile>p:not(.draft-note),.team-author a,.nested>summary:not([data-ui-label]),.project-templates [data-create-project]:not([data-create-project="empty"]) strong,#publication-title,.published-card h3,#logPreview,select[data-field$="operativeId"] option:not([value=""]),#source-equipment option:not([value=""]),#weapon-profile-select option:not([value=""])';
  const originals = new WeakMap(), attributes = new WeakMap();
  function translate(root = document.body) {
    const tournament = document.body.dataset.companionSection === "tournament";
    if (tournament && root === document.body) root = document.querySelector(".companion-utility");
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node; (node = walker.nextNode());) {
      if (!node.parentElement || node.parentElement.closest(skip)) continue;
      const previous = originals.get(node);
      const source = previous && node.data === previous.output ? previous.source : node.data;
      const output = text(source);
      originals.set(node, { source, output });
      if (output !== node.data) node.data = output;
    }
    for (const element of root.querySelectorAll("[placeholder],[title],[aria-label]")) {
      if (element.closest("svg,.physical-card,[data-ui-skip]")) continue;
      let saved = attributes.get(element); if (!saved) { saved = {}; attributes.set(element, saved); }
      for (const attr of ["placeholder", "title", "aria-label"]) {
        const current = element.getAttribute(attr); if (current === null) continue;
        const previous = saved[attr]; const source = previous && current === previous.output ? previous.source : current;
        const output = text(source); saved[attr] = { source, output };
        if (output !== current) element.setAttribute(attr, output);
      }
    }
  }
  window.KTUI = { text, translate, locale };
  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true; queueMicrotask(() => { queued = false; translate(); });
  }
  new MutationObserver(schedule).observe(document.body, { childList:true, characterData:true, subtree:true });
  window.addEventListener("kt:locale", schedule);
  translate();
})();
