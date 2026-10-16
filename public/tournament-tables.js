(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TGTVTournamentTables = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  function sortValue(text, type) {
    const value = String(text).trim();
    if (type === "text") return value;
    if (!value || ["—", "–", "-"].includes(value)) return null;
    if (type === "record") {
      const record = value.match(/^(\d+)\s*-\s*(\d+)\s*-\s*(\d+)$/);
      return record ? [Number(record[1]), Number(record[2]), -Number(record[3])] : null;
    }
    const number = Number(value.replace(/[%\s]/g, "").replace(",", "."));
    return Number.isFinite(number) ? number : null;
  }

  function sortRows(rows, column, direction) {
    if (column === null) return rows;
    const sign = direction === "asc" ? 1 : -1;
    const compare = (a, b) => typeof a === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
    return [...rows].sort((a, b) => {
      const left = a.values[column], right = b.values[column];
      // Missing statistics stay at the bottom in either direction.
      if (left === null || right === null) return left === right ? a.index - b.index : left === null ? 1 : -1;
      const difference = Array.isArray(left)
        ? left.reduce((result, value, index) => result || compare(value, right[index]), 0)
        : compare(left, right);
      return difference * sign || a.index - b.index;
    });
  }

  function enhance(table, options) {
    if (!table || table.dataset.tournamentTableEnhanced) return;
    table.dataset.tournamentTableEnhanced = "true";
    const doc = table.ownerDocument;
    const { t, view, key } = options;
    const headings = [...table.tHead.rows[0].cells];
    const types = headings.map((_, index) => options.types?.[index] || "number");
    const defaults = { query: "", team: "", classification: "all", minGames: "",
      column: options.defaultSort?.column ?? null, direction: options.defaultSort?.direction || "desc" };
    for (const [name, value] of Object.entries(defaults)) if (view[name] === undefined) view[name] = value;
    if (view.column !== null && (!Number.isInteger(view.column) || !headings[view.column])) view.column = defaults.column;

    const readRows = (source, metadata = []) => [...source.tBodies[0].rows]
      .filter(row => row.cells.length === headings.length)
      .map((node, index) => ({ node, index, ...metadata[index],
        search: `${node.textContent} ${metadata[index]?.searchText || ""}`.toLocaleLowerCase(),
        values: [...node.cells].map((cell, column) => sortValue(cell.textContent, types[column])),
        games: metadata[index]?.games ?? (options.gamesColumn === undefined ? 0 : Number(node.cells[options.gamesColumn].textContent)) }));
    const originalRows = readRows(table, options.metadata);
    const originalEmpty = originalRows.length ? null : table.tBodies[0].firstElementChild?.cloneNode(true);
    const controls = doc.createElement("div");
    controls.className = "tournament-table-controls";
    controls.dataset.tournamentTableControls = key;
    const summary = doc.createElement("p");
    summary.className = "tournament-table-summary muted";
    summary.setAttribute("aria-live", "polite");
    const fields = new Map();
    function field(name, labelText, values) {
      const label = doc.createElement("label");
      label.className = `field compact-field tournament-table-${name}`;
      const title = doc.createElement("span");
      title.textContent = labelText;
      const input = doc.createElement(values ? "select" : "input");
      input.dataset.tournamentTableFilter = name;
      if (values) {
        for (const [value, text] of values) {
          const option = doc.createElement("option");
          option.value = value;
          option.textContent = text;
          input.append(option);
        }
      } else {
        input.type = name === "minGames" ? "number" : "search";
        if (name === "minGames") { input.min = "0"; input.step = "1"; input.inputMode = "numeric"; }
        else input.placeholder = t(options.searchPlaceholder);
      }
      input.value = String(view[name]);
      input.addEventListener(values ? "change" : "input", () => {
        view[name] = name === "minGames" ? Math.max(0, Math.floor(Number(input.value) || 0)) || "" : input.value;
        render();
        options.onChange?.();
      });
      label.append(title, input);
      controls.append(label);
      fields.set(name, input);
    }
    field("query", t("tournaments.table.search"));
    if (options.classification) field("classification", t("stats.filter.classificationLabel"), [
      ["all", t("stats.filter.all")], ["classified", t("stats.classification.classified")],
      ["non-classified", t("stats.classification.nonClassified")]
    ]);
    if (options.factions) field("team", t("games.filter.teamLabel"), [
      ["", t("games.filter.allTeams")], ...[...new Set([...options.factions, view.team].filter(Boolean))]
        .sort((a, b) => a.localeCompare(b)).map(name => [name, name])
    ]);
    if (options.minimumGames) field("minGames", t("tournaments.table.minGames"));
    const reset = doc.createElement("button");
    reset.type = "button";
    reset.className = "small-button tournament-table-reset";
    reset.textContent = t("tournaments.table.reset");
    reset.addEventListener("click", () => {
      Object.assign(view, defaults);
      for (const [name, input] of fields) input.value = String(view[name]);
      render();
      options.onChange?.();
    });
    controls.append(reset);
    table.closest(".table-wrap").before(controls, summary);

    const buttons = headings.map((heading, column) => {
      const label = heading.textContent.trim();
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "sort-button";
      button.dataset.tournamentTableSort = String(column);
      button.addEventListener("click", () => {
        view.direction = view.column === column ? (view.direction === "asc" ? "desc" : "asc")
          : types[column] === "text" || options.ascendingColumns?.includes(column) ? "asc" : "desc";
        view.column = column;
        render();
        options.onChange?.();
      });
      heading.replaceChildren(button);
      return { button, label, heading, column };
    });

    function render() {
      let rows = originalRows;
      if (options.filteredTable) {
        const template = doc.createElement("template");
        template.innerHTML = options.filteredTable(view);
        rows = readRows(template.content.querySelector("table"));
      }
      const query = String(view.query).trim().toLocaleLowerCase();
      rows = rows.filter(row => (!query || row.search.includes(query)) && row.games >= Number(view.minGames || 0) &&
        (!options.matches || options.matches(row, view)));
      rows = sortRows(rows, view.column, view.direction);
      const body = table.tBodies[0];
      body.replaceChildren(...rows.map(row => row.node));
      if (!rows.length) {
        if (!originalRows.length && originalEmpty) body.append(originalEmpty.cloneNode(true));
        else {
          const empty = body.insertRow().insertCell();
          empty.colSpan = headings.length;
          empty.textContent = t("tournaments.table.noResults");
        }
      }
      for (const { button, label, heading, column } of buttons) {
        const active = view.column === column;
        heading.setAttribute("aria-sort", active ? (view.direction === "asc" ? "ascending" : "descending") : "none");
        button.textContent = `${label} ${active ? view.direction === "asc" ? "↑" : "↓" : "↕"}`;
        button.setAttribute("aria-label", `${label}: ${t(active && view.direction === "asc" ? "tournaments.table.sortDescending" :
          active || types[column] === "text" || options.ascendingColumns?.includes(column) ? "tournaments.table.sortAscending" : "tournaments.table.sortDescending")}`);
      }
      summary.textContent = t("tournaments.table.shown", { count: rows.length, total: originalRows.length });
      reset.disabled = Object.keys(defaults).every(name => view[name] === defaults[name]);
    }
    render();
  }

  return { enhance, sortValue, sortRows };
});
