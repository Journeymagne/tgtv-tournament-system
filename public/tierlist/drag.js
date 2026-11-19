// Mouse drops and touch drops share the same destination and undoable board edit.
export function bindTierlistDrag(workspace, move) {
  const doc = workspace.ownerDocument, view = doc.defaultView;
  let source = null, highlighted = null, touch = null, preview = null, frame = 0;

  function highlight(zone) {
    if (zone === highlighted) return;
    highlighted?.classList.remove('drag-over');
    highlighted = zone;
    highlighted?.classList.add('drag-over');
  }
  function start(card) {
    source = card;
    source.classList.add('dragging');
    doc.body.classList.add('tl-card-dragging');
  }
  function clear() {
    view.cancelAnimationFrame(frame);
    preview?.remove(); preview = null;
    source?.classList.remove('dragging'); source = null;
    doc.body.classList.remove('tl-card-dragging');
    highlight(null); touch = null;
  }
  function drop(target) {
    const id = source?.isConnected && source.dataset.id;
    const zone = target?.closest('[data-zone]');
    const before = target?.closest('.tl-card')?.dataset.id;
    clear();
    if (id && zone && workspace.contains(zone)) move(id, zone.dataset.zone, before);
  }

  workspace.addEventListener('dragstart', event => {
    const card = event.target.closest('.tl-card');
    if (!card) return;
    if (touch || !card.draggable) { event.preventDefault(); return; }
    start(card);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.dataset.id);
  });
  workspace.addEventListener('dragover', event => {
    if (!source || touch) return;
    const zone = event.target.closest('[data-zone]');
    highlight(zone);
    if (zone) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }
  });
  workspace.addEventListener('dragleave', event => {
    if (highlighted && !highlighted.contains(event.relatedTarget)) highlight(null);
  });
  workspace.addEventListener('drop', event => {
    if (!source || touch) return;
    event.preventDefault(); drop(event.target);
  });
  workspace.addEventListener('dragend', () => { if (!touch) clear(); });

  function followFinger() {
    preview.style.left = touch.x + 'px';
    preview.style.top = touch.y + 'px';
    const edge = 64;
    const scroll = Math.min(0, touch.y - edge) + Math.max(0, touch.y - (view.innerHeight - edge));
    if (scroll) view.scrollBy(0, scroll / 4);
    highlight(doc.elementFromPoint(touch.x, touch.y)?.closest('[data-zone]'));
    frame = view.requestAnimationFrame(followFinger);
  }
  workspace.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) { clear(); return; }
    const card = event.target.closest('.tl-card');
    if (!card?.draggable) return;
    const point = event.touches[0];
    touch = { card, id: point.identifier, x: point.clientX, y: point.clientY, started: event.timeStamp };
  }, { passive: true });
  workspace.addEventListener('contextmenu', event => { if (touch) event.preventDefault(); });
  workspace.addEventListener('touchmove', event => {
    if (!touch) return;
    if (!event.cancelable || event.touches.length !== 1) { clear(); return; }
    const point = event.touches[0];
    if (!source) {
      if (Math.hypot(point.clientX - touch.x, point.clientY - touch.y) < 6) return;
      // A swipe scrolls normally. Holding the card first starts a drag.
      if (event.timeStamp - touch.started < 250 || !touch.card.isConnected) { clear(); return; }
      start(touch.card);
      preview = touch.card.querySelector('img').cloneNode();
      preview.className = 'tl-drag-preview'; preview.alt = '';
      preview.style.width = touch.card.offsetWidth + 'px';
      preview.style.height = touch.card.offsetHeight + 'px';
      doc.body.append(preview);
      frame = view.requestAnimationFrame(followFinger);
    }
    event.preventDefault();
    touch.x = point.clientX; touch.y = point.clientY;
  }, { passive: false });
  workspace.addEventListener('touchend', event => {
    if (!touch) return;
    const point = Array.from(event.changedTouches).find(item => item.identifier === touch.id);
    if (!point) return;
    if (!source) { clear(); return; }
    event.preventDefault();
    drop(doc.elementFromPoint(point.clientX, point.clientY));
  }, { passive: false });
  workspace.addEventListener('touchcancel', clear);
  view.addEventListener('blur', clear);
}
