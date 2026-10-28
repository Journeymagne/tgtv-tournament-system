const select = document.querySelector('#set');
for (const set of TGTVMapCatalogData.sets) select.add(new Option(set, set));
function renderCatalog() {
  const maps = TGTVMapCatalogData.maps.filter(m => !select.value || m.set === select.value);
  document.querySelector('#count').textContent = `Карт: ${maps.length}`;
  document.querySelector('#maps').replaceChildren(...maps.map(map => {
    const figure = document.createElement('figure'), link = document.createElement('a'), img = document.createElement('img');
    link.href = map.imageUrl; link.target = '_blank'; link.rel = 'noopener';
    img.src = map.imageUrl; img.alt = `${map.set} · ${map.number}`; img.loading = 'lazy';
    link.append(img); figure.append(link);
    const caption = document.createElement('figcaption'), title = document.createElement('strong');
    title.textContent = img.alt; caption.append(title);
    const url = map.source_page_url || map.source_url;
    if (url) { const source = document.createElement('a'); source.href = url; source.textContent = `Источник${map.source_page ? ` · стр. ${map.source_page}` : ''}`; source.target = '_blank'; source.rel = 'noopener'; caption.append(source); }
    else caption.append('Локальный каталог пользователя');
    if (map.license) { const license = document.createElement('small'); license.textContent = `${map.author} · ${map.license}`; caption.append(license); }
    figure.append(caption); return figure;
  }));
}
select.addEventListener('change', renderCatalog); renderCatalog();
for (let page = 2; page <= 5; page++) {
  const a = document.createElement('a'), img = document.createElement('img');
  a.href = `/maps/Squad-Games%20Gallowdark%2B/Reference-${page}.png`;
  a.target = '_blank'; a.rel = 'noopener'; img.src = a.href; img.alt = `Squad Games · справка ${page}`; img.loading = 'lazy'; a.append(img);
  document.querySelector('#references').append(a);
}
