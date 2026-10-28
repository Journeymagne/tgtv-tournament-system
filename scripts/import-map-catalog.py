"""Import the user's existing catalog and render supplied PDFs (requires PyMuPDF).

Usage: python scripts/import-map-catalog.py LOCAL_CATALOG PDF_DIRECTORY
PDF_DIRECTORY must contain companion.pdf, wtc-itd.pdf and squad-games.pdf.
"""
import hashlib
import json
import shutil
import sys
import urllib.request
from pathlib import Path
import pymupdf as fitz

local, pdfs = map(Path, sys.argv[1:3])
root = Path(__file__).resolve().parents[1] / 'public' / 'maps'
root.mkdir(parents=True, exist_ok=True)
sources = {
    'Octarius 2025': 'https://assets.warhammer-community.com/eng_kt_approved_ops_2025_tournament_companion-fpsaag6ryp-uwnxgflxow.pdf',
    'WTC ITD 2026': 'https://wtc-belgium.com/wp-content/uploads/2026/07/WTC-ITD-2026-LAYOUT.pdf',
    'Squad-Games Gallowdark+': 'https://docs.google.com/presentation/d/1Iy30wBFfDi6YnTs4ELDqr3JgYf4pOszZifUS2vpc67A/edit',
}
maps = json.loads((local / 'catalog.json').read_text(encoding='utf-8'))['maps']
for m in maps:
    src = local / m['file']
    assert hashlib.sha256(src.read_bytes()).hexdigest() == m['sha256'], src
    dest = root / m['file']
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dest)
    if '--refresh-wahapedia' in sys.argv and 'wahapedia.ru' in m.get('source_url', ''):
        request = urllib.request.Request(m['source_url'], headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(request, timeout=30) as response:
            dest.write_bytes(response.read())
    if m['set'] == 'WTC Open 2025':
        m['source_url'] = 'https://wtc-belgium.com/wp-content/uploads/2025/08/WTC25-KT3-MapPack.1.6-1.pdf'
    m['slot'] = sum(1 for x in maps[:maps.index(m)] if x['set'] == m['set']) + 1

def render(name, doc, page_index, slot, clip=None):
    filename = f'{name}/Map-{slot:02}.png'
    dest = root / filename
    dest.parent.mkdir(parents=True, exist_ok=True)
    doc[page_index].get_pixmap(matrix=fitz.Matrix(2, 2), clip=clip, alpha=False).save(dest)
    entry = next((m for m in maps if m['set'] == name and m['slot'] == slot), None)
    if entry is None:
        entry = {'set': name, 'number': str(slot), 'slot': slot}
        maps.append(entry)
    entry.update(file=filename, source_url=sources[name], source_page=page_index+1)
    entry.pop('source_file', None)
    if name.startswith('Squad'):
        entry.update(author='Squad Games', license='CC BY 4.0', license_url='https://creativecommons.org/licenses/by/4.0/', note='Gallowdark+: breach points, teleport pads and light terrain. See source slides 3–5.')

doc = fitz.open(pdfs / 'companion.pdf')
for slot in range(1, 7):
    top = 40 if slot % 2 else 393
    render('Octarius 2025', doc, 8+(slot-1)//2, slot, fitz.Rect(85, top, 525, top+345))
doc = fitz.open(pdfs / 'wtc-itd.pdf')
for slot in range(1, 7): render('WTC ITD 2026', doc, slot+3, slot)
doc = fitz.open(pdfs / 'squad-games.pdf')
for slot in range(1, 14): render('Squad-Games Gallowdark+', doc, slot+4, slot)
for slot in range(2, 6):
    dest = root / 'Squad-Games Gallowdark+' / f'Reference-{slot}.png'
    doc[slot-1].get_pixmap(matrix=fitz.Matrix(2, 2)).save(dest)
for m in maps:
    data = (root / m['file']).read_bytes()
    pix = fitz.Pixmap(data)
    m.update(width=pix.width, height=pix.height, sha256=hashlib.sha256(data).hexdigest())
    m['imageUrl'] = '/maps/' + '/'.join(__import__('urllib.parse', fromlist=['quote']).quote(p) for p in m['file'].split('/'))
catalog = {'updatedAt': '2026-10-28', 'sets': list(dict.fromkeys(m['set'] for m in maps)), 'maps': maps}
(root / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
(root / 'catalog-data.js').write_text('globalThis.TGTVMapCatalogData = '+json.dumps(catalog, ensure_ascii=False)+';\n', encoding='utf-8')
print(f'Imported {len(maps)} maps in {len(catalog["sets"])} sets')
