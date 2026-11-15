// Shared by the live screens. No timers run on static pages.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TGTV_LIVE = api;
})(typeof window === "undefined" ? globalThis : window, function () {
  const listeners = new WeakMap();

  // Updating retained nodes must replace handlers that close over older data.
  function on(element, type, handler) {
    if (!element) return;
    let events = listeners.get(element);
    if (!events) listeners.set(element, events = new Map());
    if (events.has(type)) element.removeEventListener(type, events.get(type));
    element.addEventListener(type, handler);
    events.set(type, handler);
  }

  function nodeKey(node) {
    if (node.nodeType !== 1) return "";
    for (const attr of ["id", "data-live-key", "data-tournament-round-panel", "data-tournament-round-tab", "data-challenge-card"]) {
      if (node.hasAttribute(attr)) return `${node.tagName}:${attr}:${node.getAttribute(attr)}`;
    }
    if (node.hasAttribute("data-team-pairing-form")) {
      return [node.tagName, "teamPairingForm", "teamMatchId", "side", "step"].map((key, index) => index ? node.dataset[key] || "" : key).join(":");
    }
    return "";
  }

  function patchChildren(parent, nextParent) {
    let current = parent.firstChild;
    for (const next of [...nextParent.childNodes]) {
      const key = nodeKey(next);
      if (key && nodeKey(current || {}) !== key) {
        const match = [...parent.childNodes].find((node) => nodeKey(node) === key);
        if (match) parent.insertBefore(match, current);
        else parent.insertBefore(next.cloneNode(true), current);
        current = current ? current.previousSibling : parent.lastChild;
      }
      if (!current) {
        parent.appendChild(next.cloneNode(true));
        continue;
      }
      const following = current.nextSibling;
      if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName || (nodeKey(current) && nodeKey(current) !== key)) {
        current.replaceWith(next.cloneNode(true));
      } else if (!current.isEqualNode(next)) {
        if (current.nodeType === 1) {
          // Search results and local messages belong to the current interaction.
          if (!current.hasAttribute("data-live-preserve")) {
            // Enhanced selects have their own DOM and listeners. Rebuild that
            // small widget; the pairing renderer restores its current draft.
            if (current.matches("[data-combo]")) current.replaceWith(next.cloneNode(true));
            else {
              for (const attr of [...current.attributes]) {
                if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
              }
              for (const attr of next.attributes) {
                if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
              }
              patchChildren(current, next);
            }
          }
        } else if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
      }
      current = following;
    }
    while (current) {
      const following = current.nextSibling;
      current.remove();
      current = following;
    }
  }

  function content(element, html, live = false) {
    if (!live) { element.innerHTML = html; return; }
    const template = element.ownerDocument.createElement("template");
    template.innerHTML = html;
    patchChildren(element, template.content);
  }

  function blocked(element, doc) {
    const selection = doc.defaultView?.getSelection();
    if (selection && !selection.isCollapsed) {
      for (let index = 0; index < selection.rangeCount; index += 1) {
        if (selection.getRangeAt(index).intersectsNode(element)) return true;
      }
    }
    const active = doc.activeElement;
    if (active && element.contains(active) && active.matches('input, textarea, select, [contenteditable="true"]')) return true;
    return Boolean(doc.querySelector('dialog[open], [role="dialog"][aria-modal="true"]') ||
      element.querySelector('[data-combo].open'));
  }

  function createController({ target, fetch: fetchData, apply, blocked: isBlocked, window: win, document: doc }) {
    let timer = null;
    let deferredTimer = null;
    let pending = null;
    let inFlight = false;
    let revision = 0;
    let writes = 0;
    let resumeAfterFlight = false;
    const sameTarget = (a, b) => a && b && a.key === b.key && a.anchor === b.anchor;
    const visible = () => doc.visibilityState !== "hidden";

    function schedule(delay) {
      if (timer !== null) win.clearTimeout(timer);
      timer = null;
      const current = target();
      if (pending && !sameTarget(pending.target, current)) pending = null;
      if (!visible() || !current) return;
      timer = win.setTimeout(run, delay ?? current.interval);
    }

    function flush() {
      if (!pending || !visible() || writes) return;
      const current = target();
      if (!sameTarget(pending.target, current) || pending.revision !== revision) { pending = null; return; }
      if (isBlocked(current)) return;
      const update = pending;
      pending = null;
      apply(current, update.data);
      schedule();
    }

    async function run() {
      timer = null;
      if (inFlight) { resumeAfterFlight = true; return; }
      const current = target();
      if (!visible() || !current) return;
      if (writes) { schedule(); return; }
      const requestRevision = revision;
      const before = JSON.stringify(current.snapshot);
      inFlight = true;
      try {
        const data = await fetchData(current);
        if (!visible() || writes || revision !== requestRevision || !sameTarget(current, target())) return;
        if (JSON.stringify(current.project(data)) === before) { pending = null; return; }
        pending = { target: current, data, revision: requestRevision };
        flush();
      } catch {
        // Keep the last successful view and retry; never replace it with an error.
      } finally {
        inFlight = false;
        schedule(resumeAfterFlight ? 0 : undefined);
        resumeAfterFlight = false;
      }
    }

    function invalidate() { revision += 1; pending = null; }
    function resume() {
      if (!visible()) return;
      if (inFlight) { resumeAfterFlight = true; return; }
      schedule(0);
    }
    function deferFlush() {
      if (!pending) return;
      if (deferredTimer !== null) win.clearTimeout(deferredTimer);
      deferredTimer = win.setTimeout(() => { deferredTimer = null; flush(); }, 150);
    }
    doc.addEventListener("visibilitychange", () => {
      invalidate();
      if (visible()) resume();
      else schedule();
    });
    win.addEventListener("focus", resume);
    for (const event of ["selectionchange", "focusout", "pointerup", "change"]) doc.addEventListener(event, deferFlush);
    return {
      schedule, run, flush, invalidate,
      startWrite() { writes += 1; invalidate(); },
      endWrite() { writes = Math.max(0, writes - 1); invalidate(); schedule(); }
    };
  }

  return { on, content, blocked, createController };
});
