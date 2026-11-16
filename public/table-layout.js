(function () {
  "use strict";
  const app = document.querySelector("#app");
  if (!app) return;
  const widthProperty = "--table-layout-width";
  let frame = 0;
  const observed = new Set();
  const resize = new ResizeObserver(schedule);
  resize.observe(app);

  function schedule() {
    if (!frame) frame = requestAnimationFrame(adapt);
  }

  function adapt() {
    frame = 0;
    const layout = app.querySelector(".layout");
    if (!layout) {
      for (const target of observed) resize.unobserve(target);
      observed.clear();
      return;
    }

    // Always measure the ordinary layout first. Measuring only the expanded
    // layout would alternately remove and restore its width on every resize.
    layout.style.removeProperty(widthProperty);
    const tables = [...layout.querySelectorAll("table")].filter(table =>
      table.getClientRects().length && getComputedStyle(table).display === "table"
      && !table.closest('dialog, [role="dialog"]'));
    const wrappers = new Set(tables.flatMap(table => [table, table.closest(".table-wrap") || table.parentElement]));
    for (const wrapper of observed) {
      if (!wrappers.has(wrapper)) { resize.unobserve(wrapper); observed.delete(wrapper); }
    }
    for (const wrapper of wrappers) {
      if (!observed.has(wrapper)) { resize.observe(wrapper); observed.add(wrapper); }
    }

    function overflow() {
      return tables.reduce((total, table) => {
        const wrapper = table.closest(".table-wrap") || table.parentElement;
        return total + Math.max(0, Math.max(table.scrollWidth, Math.round(table.getBoundingClientRect().width)) - wrapper.clientWidth);
      }, 0);
    }
    const ordinaryWidth = layout.getBoundingClientRect().width;
    const ordinaryOverflow = overflow();
    if (!ordinaryOverflow) return;

    // CSS keeps the normal gutters, including the existing mobile overrides.
    layout.style.setProperty(widthProperty, "100vw");
    let upper = Math.ceil(layout.getBoundingClientRect().width);
    const fullOverflow = overflow();
    if (upper <= ordinaryWidth + 1 || fullOverflow >= ordinaryOverflow) {
      layout.style.removeProperty(widthProperty);
      return;
    }
    if (fullOverflow) return; // Use available space when the screen cannot fit all columns.

    // Find only the extra space these tables need, rather than filling every
    // wide monitor. All probes finish in this frame, before the browser paints.
    let lower = Math.floor(ordinaryWidth);
    while (upper - lower > 1) {
      const middle = Math.floor((lower + upper) / 2);
      layout.style.setProperty(widthProperty, `${middle}px`);
      if (overflow()) lower = middle;
      else upper = middle;
    }
    layout.style.setProperty(widthProperty, `${Math.ceil(upper)}px`);
  }

  new MutationObserver(records => {
    if (records.some(record => record.type !== "attributes"
      || record.attributeName !== "style" || !record.target.matches(".layout"))) schedule();
  }).observe(app, { subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ["class", "style", "hidden", "open", "colspan"] });
  window.addEventListener("resize", schedule);
  window.addEventListener("kt:appearance", schedule);
  document.fonts?.ready.then(schedule);
  schedule();
})();
