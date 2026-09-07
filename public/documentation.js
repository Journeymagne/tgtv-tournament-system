(function (root) {
  "use strict";
  const pageIds = ["wtc-pairings", "swiss-tiebreakers", "elimination-tiebreakers", "team-tiebreakers", "mmr"];
  const labels = {
    ru: {
      title: "Документация", intro: "Правила, по которым работает система: паринги, турнирные места и рейтинг.",
      all: "Все разделы", contents: "На этой странице", read: "Открыть раздел", notFound: "Страница не найдена", signIn: "Войти", updated: "Обновлено",
      edit: "Редактировать", editor: "Редактор документации", language: "Язык документа", titleField: "Название страницы", summary: "Краткое описание",
      source: "Текст в Markdown", preview: "Предпросмотр", save: "Сохранить", saving: "Сохранение…", saved: "Изменения сохранены и видны всем.", close: "Закрыть редактор",
      hint: "Сохранение обновит эту страницу для всех читателей. Русская и английская версии редактируются отдельно.",
      draft: "Есть несохранённые изменения. Черновик сохранён в этой вкладке.", draftMemory: "Есть несохранённые изменения. Оставьте вкладку открытой: браузер не разрешил сохранить черновик.",
      discard: "Отменить изменения", discardConfirm: "Удалить черновик и загрузить сохранённую версию страницы?", loading: "Загрузка…",
      previewPending: "Обновление предпросмотра…", previewFailed: "Предпросмотр не обновлён. Попробуйте изменить текст ещё раз.",
      download: "Скачать .md", upload: "Открыть .md", fileTooLarge: "Выберите файл .md или .txt размером не более 100 000 символов.",
      bold: "Жирный", heading: "Заголовок", list: "Список", link: "Ссылка", table: "Таблица", code: "Формула / код",
      boldText: "выделенный текст", headingText: "Новый раздел", listText: "Пункт списка", linkText: "Название ссылки",
      tableText: "| Разница VP | GP игрока | GP соперника |\n| --- | --- | --- |\n| 0 | 10 | 10 |\n",
      help: "Шпаргалка Markdown", helpText: "## Заголовок раздела\n\n**Жирный текст** и *курсив*.\n\n- Пункт списка\n\n[Ссылка](https://example.com)\n\n> Примечание",
      error: "Не удалось выполнить действие. Попробуйте ещё раз.",
      "documentation.notFound": "Страница не найдена.", "documentation.invalidContent": "Заполните название, описание и текст. Максимум: 160, 400 и 100 000 символов соответственно.",
      "documentation.conflict": "Страница уже изменена в другой вкладке или другим администратором. Ваш черновик сохранён. Скачайте его перед отменой изменений и загрузкой актуальной версии."
    },
    en: {
      title: "Documentation", intro: "How the system works: pairings, tournament standings and ratings.",
      all: "All sections", contents: "On this page", read: "Read section", notFound: "Page not found", signIn: "Sign in", updated: "Updated",
      edit: "Edit", editor: "Documentation editor", language: "Document language", titleField: "Page title", summary: "Short description",
      source: "Markdown text", preview: "Preview", save: "Save", saving: "Saving…", saved: "Changes saved and visible to everyone.", close: "Close editor",
      hint: "Saving updates this page for all readers. Russian and English versions are edited separately.",
      draft: "Unsaved changes. Your draft is saved in this tab.", draftMemory: "Unsaved changes. Keep this tab open: the browser could not store your draft.",
      discard: "Discard changes", discardConfirm: "Discard this draft and load the saved page?", loading: "Loading…",
      previewPending: "Updating preview…", previewFailed: "The preview could not be updated. Try editing the text again.",
      download: "Download .md", upload: "Open .md", fileTooLarge: "Choose a .md or .txt file with no more than 100,000 characters.",
      bold: "Bold", heading: "Heading", list: "List", link: "Link", table: "Table", code: "Formula / code",
      boldText: "bold text", headingText: "New section", listText: "List item", linkText: "Link title",
      tableText: "| VP lead | Player GP | Opponent GP |\n| --- | --- | --- |\n| 0 | 10 | 10 |\n",
      help: "Markdown reference", helpText: "## Section heading\n\n**Bold text** and *italics*.\n\n- List item\n\n[Link](https://example.com)\n\n> Note",
      error: "Could not complete this action. Please try again.",
      "documentation.notFound": "Page not found.", "documentation.invalidContent": "Fill in the title, description and text. Limits: 160, 400 and 100,000 characters respectively.",
      "documentation.conflict": "This page was changed in another tab or by another administrator. Your draft is preserved. Download it before discarding changes and loading the latest version."
    }
  };
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const href = (id = "") => `/#/documentation${id ? `/${encodeURIComponent(id)}` : ""}`;
  const copy = (page) => ({ title: page.title, summary: page.summary, markdown: page.markdown, version: page.version });
  const same = (a, b) => ["title", "summary", "markdown"].every((key) => a[key] === b[key]);
  const drafts = new Map();
  const editing = new Map();

  async function load(locale, pageId, api) {
    const book = await api(`/api/documentation/${locale}`);
    const detail = pageId && book.pages.some((page) => page.id === pageId)
      ? await api(`/api/documentation/${locale}/${encodeURIComponent(pageId)}`) : { page: null };
    return { ...book, ...detail };
  }

  function render(locale, pageId = "", guest = false, data = { pages: [] }, admin = false) {
    const text = labels[locale] || labels.en;
    const page = data.page;
    const header = `<header class="card panel documentation-header"><div><p class="profile-label">TGTV</p><h2>${text.title}</h2><p class="muted">${text.intro}</p></div>${guest ? `<a class="small-button" href="/">${text.signIn}</a>` : ""}</header>`;
    if (!pageId) return `<div class="documentation" data-documentation-page="index">${header}<nav class="documentation-cards" aria-label="${text.all}">${data.pages.map((item) => `<a class="card panel documentation-card" href="${href(item.id)}"><span class="profile-label">${escape(item.category)}</span><h3>${escape(item.title)}</h3><p>${escape(item.summary)}</p><span class="documentation-read">${text.read} →</span></a>`).join("")}</nav></div>`;
    if (!page) return `<div class="documentation">${header}<section class="card panel"><h3>${text.notFound}</h3><a href="${href()}">${text.all}</a></section></div>`;
    return `<div class="documentation" data-documentation-page="${escape(page.id)}">${header}<div class="documentation-layout">
      <nav class="card panel documentation-nav" aria-label="${text.all}"><a href="${href()}">← ${text.all}</a>${data.pages.map((item) => `<a href="${href(item.id)}" ${item.id === page.id ? 'aria-current="page"' : ""}>${escape(item.title)}</a>`).join("")}</nav>
      <article class="card panel documentation-article" data-doc-article><div class="documentation-article-heading"><div><p class="profile-label">${escape(page.category)}</p><h2 tabindex="-1" data-documentation-title>${escape(page.title)}</h2><p class="muted">${text.updated}: <time datetime="${escape(page.updatedAt)}">${escape(new Date(page.updatedAt).toLocaleDateString(locale))}</time></p></div>${admin ? `<button class="small-button" type="button" data-doc-edit>${text.edit}</button>` : ""}</div>
        ${page.headings.length ? `<details class="documentation-contents"><summary>${text.contents}</summary><ul>${page.headings.map((heading) => `<li><button type="button" class="text-link-button" data-documentation-section="${escape(heading.id)}">${escape(heading.title)}</button></li>`).join("")}</ul></details>` : ""}
        <div class="documentation-markdown">${page.html}</div>
      </article></div></div>`;
  }

  function draftKey(userId, id, locale) { return `tgtv-documentation-draft:${userId}:${id}:${locale}`; }
  function getDraft(key, page) {
    let draft = drafts.get(key);
    if (!draft) {
      try {
        const saved = JSON.parse(root.sessionStorage.getItem(key));
        if (saved && saved.value && saved.base && Number.isInteger(saved.base.version) &&
            [saved.value, saved.base].every((item) => ["title", "summary", "markdown"].every((field) => typeof item[field] === "string"))) draft = saved;
      } catch { /* A blocked storage area does not prevent editing. */ }
    }
    if (!draft || same(draft.value, draft.base) || same(draft.value, page)) draft = { base: copy(page), value: copy(page) };
    drafts.set(key, draft);
    return draft;
  }
  function storeDraft(key, draft) {
    drafts.set(key, draft);
    try {
      if (same(draft.value, draft.base)) root.sessionStorage.removeItem(key);
      else root.sessionStorage.setItem(key, JSON.stringify(draft));
      return true;
    } catch { return false; }
  }
  function removeDraft(key) {
    drafts.delete(key);
    try { root.sessionStorage.removeItem(key); } catch { /* Storage may be blocked. */ }
  }

  function mount(target, { api, locale, page, userId, rerender }) {
    target.querySelectorAll("[data-documentation-section]").forEach((button) => {
      button.addEventListener("click", () => root.document.getElementById(button.dataset.documentationSection)?.scrollIntoView({ block: "start" }));
    });
    if (!userId || !page) return;
    const text = labels[locale] || labels.en;
    const modeKey = `${userId}:${page.id}`;
    const article = target.querySelector("[data-doc-article]");
    let editorRequest = 0;
    const errorText = (error) => text[error.message] || text.error;

    async function openEditor(language, suppliedPage, notice = "") {
      const request = ++editorRequest;
      editing.set(modeKey, language);
      article.classList.add("documentation-editing");
      article.innerHTML = `<p role="status">${text.loading}</p>`;
      try {
        const savedPage = suppliedPage || (await api(`/api/documentation/${language}/${page.id}`)).page;
        if (!article.isConnected || request !== editorRequest) return;
        const key = draftKey(userId, page.id, language);
        const draft = getDraft(key, savedPage);
        article.innerHTML = `<form class="documentation-editor" data-doc-form>
          <div class="documentation-editor-header"><h2>${text.editor}</h2><button type="button" class="small-button secondary" data-doc-close>${text.close}</button></div>
          <p class="muted">${text.hint}</p>
          <div class="documentation-editor-meta"><label>${text.language}<select data-doc-language><option value="ru" ${language === "ru" ? "selected" : ""}>Русский</option><option value="en" ${language === "en" ? "selected" : ""}>English</option></select></label><label>${text.titleField}<input name="title" maxlength="160" required value="${escape(draft.value.title)}"></label></div>
          <label>${text.summary}<input name="summary" maxlength="400" required value="${escape(draft.value.summary)}"></label>
          <div class="documentation-editor-tools">${["heading", "bold", "list", "link", "table", "code"].map((tool) => `<button type="button" class="small-button secondary" data-doc-insert="${tool}">${text[tool]}</button>`).join("")}<button type="button" class="small-button secondary" data-doc-upload>${text.upload}</button><button type="button" class="small-button secondary" data-doc-download>${text.download}</button><input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" data-doc-file hidden></div>
          <div class="documentation-editor-panes"><label class="documentation-editor-source">${text.source}<textarea name="markdown" maxlength="100000" required spellcheck="false"></textarea></label><section class="documentation-editor-preview"><h3>${text.preview}</h3><p class="muted" role="status" data-doc-preview-status></p><div class="documentation-markdown" data-doc-preview></div></section></div>
          <details class="documentation-editor-help"><summary>${text.help}</summary><pre><code>${escape(text.helpText)}</code></pre></details>
          <div class="documentation-editor-actions"><button type="submit" class="small-button" data-doc-save>${text.save}</button><button type="button" class="small-button secondary" data-doc-discard>${text.discard}</button><p role="status" aria-live="polite" data-doc-status></p></div>
        </form>`;
        const form = article.querySelector("[data-doc-form]");
        const source = form.elements.markdown;
        source.value = draft.value.markdown;
        const status = form.querySelector("[data-doc-status]");
        const preview = form.querySelector("[data-doc-preview]");
        const previewStatus = form.querySelector("[data-doc-preview-status]");
        let timer;
        let previewRevision = 0;
        let saving = false;
        const current = () => article.isConnected && form.isConnected && request === editorRequest;
        const setStatus = (message, error = false) => { status.textContent = message; status.classList.toggle("documentation-error", error); };
        const capture = () => {
          draft.value = { title: form.elements.title.value, summary: form.elements.summary.value, markdown: source.value, version: draft.base.version };
          return storeDraft(key, draft);
        };
        const previewNow = async (revision) => {
          if (!current()) return;
          try {
            const result = await api("/api/admin/documentation/preview", { method: "POST", body: { markdown: source.value } });
            if (!current() || revision !== previewRevision) return;
            preview.innerHTML = result.html;
            previewStatus.textContent = "";
          } catch {
            if (current() && revision === previewRevision) previewStatus.textContent = text.previewFailed;
          }
        };
        const changed = () => {
          const stored = capture();
          setStatus(same(draft.value, draft.base) ? "" : stored ? text.draft : text.draftMemory);
          clearTimeout(timer);
          const revision = ++previewRevision;
          previewStatus.textContent = text.previewPending;
          timer = setTimeout(() => previewNow(revision), 300);
        };
        form.addEventListener("input", changed);
        if (same(draft.value, savedPage)) preview.innerHTML = savedPage.html;
        else { previewStatus.textContent = text.previewPending; previewNow(++previewRevision); }
        setStatus(notice || (same(draft.value, draft.base) ? "" : text.draft));
        form.querySelector("[data-doc-language]").addEventListener("change", (event) => { capture(); clearTimeout(timer); openEditor(event.target.value); });
        form.querySelector("[data-doc-close]").addEventListener("click", () => { capture(); clearTimeout(timer); editing.delete(modeKey); editorRequest++; rerender(); });
        form.querySelector("[data-doc-discard]").addEventListener("click", () => {
          if (!same(draft.value, draft.base) && !root.confirm(text.discardConfirm)) return;
          clearTimeout(timer); removeDraft(key); openEditor(language);
        });
        form.querySelectorAll("[data-doc-insert]").forEach((button) => button.addEventListener("click", () => {
          const selected = source.value.slice(source.selectionStart, source.selectionEnd);
          const snippets = {
            heading: `\n\n## ${selected || text.headingText}\n\n`, bold: `**${selected || text.boldText}**`,
            list: `\n\n- ${selected || text.listText}\n`, link: `[${selected || text.linkText}](https://example.com)`,
            table: `\n\n${text.tableText}\n`, code: `\n\n\`\`\`text\n${selected || "GP = 10 + VP_A − VP_B"}\n\`\`\`\n\n`
          };
          source.setRangeText(snippets[button.dataset.docInsert], source.selectionStart, source.selectionEnd, "end");
          source.focus(); changed();
        }));
        form.querySelector("[data-doc-upload]").addEventListener("click", () => form.querySelector("[data-doc-file]").click());
        form.querySelector("[data-doc-file]").addEventListener("change", async (event) => {
          const file = event.target.files[0];
          if (!file) return;
          try {
            if (file.size > 400000 || !/\.(md|markdown|txt)$/i.test(file.name)) throw new Error("fileTooLarge");
            const value = (await file.text()).replace(/^\uFEFF/, "");
            if (!current()) return;
            if (value.length > 100000) throw new Error("fileTooLarge");
            source.value = value; changed();
          } catch (error) { if (current()) setStatus(errorText(error), true); }
          event.target.value = "";
        });
        form.querySelector("[data-doc-download]").addEventListener("click", () => {
          const url = root.URL.createObjectURL(new Blob([source.value], { type: "text/markdown;charset=utf-8" }));
          const link = root.document.createElement("a");
          link.href = url; link.download = `${page.id}.${language}.md`; link.click();
          setTimeout(() => root.URL.revokeObjectURL(url), 1000);
        });
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (saving || !form.reportValidity()) return;
          capture(); clearTimeout(timer); saving = true;
          form.querySelectorAll("input, select, textarea, button").forEach((control) => { control.disabled = true; });
          setStatus(text.saving);
          const submitted = { ...draft.value, version: draft.base.version };
          try {
            const result = await api(`/api/admin/documentation/${language}/${page.id}`, { method: "PATCH", body: submitted });
            // A navigation can reopen this editor while the save is in flight.
            // Keep any newer draft instead of deleting it with the saved snapshot.
            const activeDraft = drafts.get(key);
            const newerDraft = activeDraft && !same(activeDraft.value, submitted);
            if (newerDraft) {
              activeDraft.base = copy(result.page);
              activeDraft.value.version = result.page.version;
              storeDraft(key, activeDraft);
            } else removeDraft(key);
            if (current()) openEditor(language, result.page, newerDraft ? "" : text.saved);
          } catch (error) {
            if (current()) {
              setStatus(errorText(error), true);
              form.querySelectorAll("input, select, textarea, button").forEach((control) => { control.disabled = false; });
            }
          } finally { saving = false; }
        });
      } catch (error) {
        if (!article.isConnected || request !== editorRequest) return;
        article.innerHTML = `<p role="alert">${escape(errorText(error))}</p><button type="button" class="small-button" data-doc-close>${text.close}</button>`;
        article.querySelector("[data-doc-close]").addEventListener("click", () => { editing.delete(modeKey); rerender(); });
      }
    }
    target.querySelector("[data-doc-edit]")?.addEventListener("click", () => openEditor(locale, page));
    const activeLanguage = editing.get(modeKey);
    if (activeLanguage) openEditor(activeLanguage, activeLanguage === locale ? page : undefined);
  }
  const documentation = { load, render, mount, pageIds };
  if (typeof module !== "undefined" && module.exports) module.exports = documentation;
  else root.TGTV_DOCUMENTATION = documentation;
})(typeof window === "undefined" ? globalThis : window);
