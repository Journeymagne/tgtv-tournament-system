// The select owns the submitted value and the available options. The text box
// is only a search field, including when option labels and IDs are different.
(() => {
  let nextId = 0;
  class TeamPicker extends HTMLElement {
    connectedCallback() {
      queueMicrotask(() => {
        if (!this.isConnected) return;
        if (!this.input) this.setup();
        this.observer.observe(this.select, {
          childList: true, subtree: true, characterData: true, attributes: true,
          attributeFilter: ["disabled", "required", "selected", "label", "value"]
        });
        this.sync();
      });
    }
    disconnectedCallback() {
      this.observer?.disconnect();
    }
    setup() {
      const select = this.select = this.querySelector("select");
      const input = this.input = document.createElement("input");
      const list = this.list = document.createElement("div");
      const id = "team-picker-" + ++nextId;
      input.type = "text";
      input.autocomplete = "off";
      input.setAttribute("role", "combobox");
      input.setAttribute("aria-autocomplete", "list");
      input.setAttribute("aria-controls", id);
      input.setAttribute("aria-expanded", "false");
      list.id = id;
      list.className = "team-picker-list";
      list.setAttribute("role", "listbox");
      list.hidden = true;
      const label = select.labels[0] || this.closest(".field")?.querySelector("label");
      if (label) {
        input.id = id + "-input";
        label.htmlFor = input.id;
      }
      const labelText = select.getAttribute("aria-label") || (label &&
        Array.from(label.childNodes).filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent.trim()).filter(Boolean).join(" "));
      if (labelText) input.setAttribute("aria-label", labelText);
      select.hidden = true;
      this.append(input, list);
      select.addEventListener("change", () => this.sync());
      select.addEventListener("invalid", event => {
        event.preventDefault();
        input.focus();
      });
      input.addEventListener("focus", () => {
        input.select();
        this.show("");
      });
      input.addEventListener("click", () => { if (list.hidden) this.show(""); });
      input.addEventListener("input", event => {
        event.stopPropagation();
        this.dirty = true;
        this.validate();
        this.show(input.value);
      });
      input.addEventListener("change", event => event.stopPropagation());
      input.addEventListener("blur", () => {
        if (this.dirty && this.validate()) this.commit(this.exact());
        this.close();
      });
      input.addEventListener("keydown", event => {
        if (event.key === "Escape" && !list.hidden) {
          event.preventDefault();
          event.stopPropagation();
          this.sync();
        } else if (["ArrowDown", "ArrowUp"].includes(event.key)) {
          event.preventDefault();
          if (list.hidden) this.show(this.dirty ? input.value : "");
          const step = event.key === "ArrowDown" ? 1 : -1;
          this.highlight(Math.min(this.matches.length - 1, Math.max(0, this.active + step)));
        } else if (event.key === "Enter" && !list.hidden) {
          event.preventDefault();
          const option = this.matches[this.active] || this.exact();
          if (option || this.validate()) this.commit(option);
          else input.reportValidity();
        }
      });
      list.addEventListener("mousedown", event => event.preventDefault());
      list.addEventListener("click", event => {
        const item = event.target.closest("[data-index]");
        if (item) { event.preventDefault(); this.commit(this.matches[item.dataset.index]); }
      });
      this.observer = new MutationObserver(() => {
        if (!this.dirty || select.disabled) this.sync();
        else { this.validate(); if (!list.hidden) this.show(input.value); }
      });
    }
    options() {
      return Array.from(this.select.options).filter(option => !option.disabled);
    }
    exact() {
      const typed = this.input.value.trim().toLocaleLowerCase();
      const matches = this.options().filter(option => option.label.trim().toLocaleLowerCase() === typed ||
        (typed && option.dataset.aliases?.split("|").includes(typed)));
      return matches.length === 1 ? matches[0] : undefined;
    }
    validate() {
      this.input.required = this.select.required;
      const valid = !this.input.value.trim() ? !this.select.required : Boolean(this.exact());
      const en = document.documentElement.lang.startsWith("en");
      this.input.setCustomValidity(valid ? "" : en ? "Choose a team from the list." : "Выберите команду из списка.");
      return valid;
    }
    sync() {
      const { input, select } = this;
      this.dirty = false;
      input.disabled = select.disabled;
      input.required = select.required;
      input.placeholder = this.options().find(option => !option.value)?.label ||
        (document.documentElement.lang.startsWith("en") ? "Search teams" : "Найти команду");
      input.value = select.value ? select.selectedOptions[0].label : "";
      input.setCustomValidity("");
      this.close();
    }
    commit(option) {
      if (option?.disabled || (!option?.value && this.select.required)) return;
      const value = option?.value || "";
      if (this.select.value !== value) {
        this.select.value = value;
        this.select.dispatchEvent(new Event("input", { bubbles: true }));
        this.select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      this.sync();
    }
    show(query) {
      const text = query.trim().toLocaleLowerCase();
      this.matches = this.options().filter(option => (!this.select.required || option.value) &&
        (option.label.toLocaleLowerCase().includes(text) || option.dataset.aliases?.includes(text))).sort((a, b) =>
        Number(Boolean(a.value)) - Number(Boolean(b.value)) ||
        a.label.localeCompare(b.label, document.documentElement.lang || undefined, { sensitivity: "base", numeric: true }));
      this.active = -1;
      this.input.removeAttribute("aria-activedescendant");
      this.list.replaceChildren(...this.matches.map((option, index) => {
        const item = document.createElement("div");
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", "false");
        item.dataset.index = index;
        item.id = this.list.id + "-" + index;
        item.textContent = option.label;
        return item;
      }));
      if (!this.matches.length) this.list.textContent = document.documentElement.lang.startsWith("en") ? "No matches" : "Совпадений нет";
      this.list.hidden = false;
      this.input.setAttribute("aria-expanded", "true");
    }
    highlight(index) {
      this.list.children[this.active]?.setAttribute("aria-selected", "false");
      this.active = index;
      const item = this.list.children[index];
      if (!item) return;
      item.setAttribute("aria-selected", "true");
      this.input.setAttribute("aria-activedescendant", item.id);
      item.scrollIntoView({ block: "nearest" });
    }
    close() {
      this.list.hidden = true;
      this.input.setAttribute("aria-expanded", "false");
      this.input.removeAttribute("aria-activedescendant");
    }
  }
  customElements.define("team-picker", TeamPicker);
  document.addEventListener("reset", event => queueMicrotask(() => {
    event.target.querySelectorAll("team-picker").forEach(picker => picker.sync());
  }));
})();
