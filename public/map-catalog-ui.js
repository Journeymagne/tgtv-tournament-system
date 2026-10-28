(function () {
  'use strict';
  const catalog = TGTVMapCatalog;
  function preview(container, table) {
    const map = catalog.find(table);
    const signature = JSON.stringify([map?.imageUrl, table?.imageId]);
    if (container.dataset.mapSignature === signature) return;
    container.dataset.mapSignature = signature;
    container.replaceChildren();
    if (!map && !table?.imageId) return;
    const link = document.createElement('a');
    link.href = table?.imageId ? `/api/tournament-table-images/${Number(table.imageId)}` : map.imageUrl;
    link.target = '_blank'; link.rel = 'noopener';
    const img = document.createElement('img');
    img.src = link.href; img.alt = map ? `${map.set} · ${map.number}` : 'Расстановка';
    img.className = 'team-table-image'; img.loading = 'lazy';
    link.append(img); container.append(link);
    if (map && !table?.imageId) {
      const caption = document.createElement('p'); caption.className = 'muted';
      caption.textContent = `${map.set} · ${map.number} `;
      const source = document.createElement('a');
      source.href = map.source_page_url || map.source_url || '/maps/index.html';
      source.textContent = 'Источник'; source.target = '_blank'; source.rel = 'noopener';
      caption.append(source); container.append(caption);
    }
  }
  function attach(killzone, layout) {
    if (!layout || killzone.dataset.mapBound) return;
    killzone.dataset.mapBound = 'true';
    const box = document.createElement('div'); box.className = 'map-catalog-preview';
    layout.closest('.field')?.after(box);
    const update = () => {
      const maps = catalog.mapsFor(killzone.value), selected = layout.value;
      const entries = maps.length ? maps : Array.from({ length: 6 }, (_, i) => ({ slot: i+1, number: String(i+1) }));
      const signature = entries.map(m => `${m.slot}:${m.number}`).join(',');
      if (layout.dataset.mapOptions !== signature) {
        layout.dataset.mapOptions = signature;
        const empty = new Option(layout.options[0]?.value === '' ? layout.options[0].text : '—', '');
        layout.replaceChildren(empty, ...entries.map(m => new Option(m.number, String(m.slot))));
        layout.value = entries.some(m => String(m.slot) === selected) ? selected : '';
      }
      const card = killzone.closest('[data-team-table-setup]');
      const custom = card?.querySelector('[name^="teamImageId-"]')?.value || card?.querySelector('[name^="teamImageData-"]')?.value;
      box.hidden = Boolean(custom);
      preview(box, { killzone: killzone.value, layout: layout.value,
        imageId: Number(killzone.closest('.tournament-table-row')?.dataset.mapImageId) || null });
    };
    killzone.addEventListener('change', update); layout.addEventListener('change', update);
    killzone.closest('[data-team-table-setup]')?.addEventListener('map-image-change', update);
    update();
  }
  function scan() {
    document.querySelectorAll('select[name="killzone"], select[name="roundKillzone"], select[name^="teamKillzone-"], select[name^="table-killzone-"]').forEach(k => {
      const scope = k.closest('[data-team-table-setup], .tournament-table-row, form') || document;
      const name = k.name === 'roundKillzone' ? 'roundLayout' : k.name.startsWith('teamKillzone-') ? k.name.replace('teamKillzone-', 'teamLayout-')
        : k.name.startsWith('table-killzone-') ? k.name.replace('table-killzone-', 'table-deployment-') : scope.querySelector('[name="deployment"]') ? 'deployment' : scope.querySelector('[name="killzoneLayout"]') ? 'killzoneLayout' : 'layout';
      attach(k, scope.querySelector(`[name="${name}"]`));
    });
  }
  let pending = false;
  new MutationObserver(() => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; scan(); }); } })
    .observe(document.body, { childList: true, subtree: true });
  scan();
  globalThis.TGTVMapPreview = preview;
})();
