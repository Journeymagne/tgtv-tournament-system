"""Import current operative/weapon cards by PDF coordinates, excluding update logs."""
import sys,json,re,unicodedata
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'vendor'))
import pymupdf as fitz
ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path(r'C:/Users/Journeymagne/Documents/Kill Team References/Warhammer Community/2026-09-25')
def slug(s):return re.sub(r'[^a-z0-9]+','-',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()).strip('-')
def clean(s):return re.sub(r'\s+',' ',s).strip().replace('�','’')
def get_lines(page):
 out=[]
 for b in page.get_text('dict',flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)['blocks']:
  for l in b.get('lines',[]):
   out.append(dict(text=clean(''.join(s['text'] for s in l['spans'])),bbox=l['bbox'],spans=l['spans']))
 return out
def value(page,x0,x1,y):
 return clean(page.get_text(clip=fitz.Rect(x0,y+7,x1,y+30)))
inventory=json.loads((SOURCE/'analysis/pdf-inventory.json').read_text(encoding='utf-8'))
teams=[];warnings=[]
for entry in inventory:
 if 'team-rules' not in entry['categories']:continue
 path=SOURCE/entry['path'].replace('\\','/');doc=fitz.open(path);ops={};rules=[];tid=path.stem
 for pageidx,page in enumerate(doc):
  lines=get_lines(page);words=page.get_text('words');full=page.get_text()
  if re.search(r'UPDATE\s+LOG',full):break
  anchors=[l for l in lines if l['text']=='APL' and l['bbox'][0]>340];drawings=page.get_drawings() if anchors else []
  for anchor in anchors:
   y=anchor['bbox'][1];top=y-15;bottom=min(top+198.4,page.rect.height)
   names=[l for l in lines if 125<l['bbox'][0]<350 and abs(l['bbox'][1]-y)<6 and any((s['font'].startswith('DINCondensed') or s['font'].startswith('DINEngschrift')) and s['size']>=11 for s in l['spans']) and not l['text'].isdigit()]
   name=clean(' '.join(l['text'] for l in sorted(names,key=lambda l:l['bbox'][0])))
   if not name: warnings.append(f'{tid} p{pageidx+1}: missing operative name');continue
   try:
    apl=int(re.search(r'\d+',value(page,350,378,y))[0]);move=re.sub(r"^MOVE\s*", "", value(page,378,406,y))
    save=int(re.search(r'\d+',value(page,406,434,y))[0]);wounds=int(re.search(r'\d+',value(page,434,475,y))[0])
   except (ValueError,TypeError):warnings.append(f'{tid} {name}: unsupported stats');continue
   oid=slug(name);op=ops.get(oid)
   if not op:
    op=dict(id=oid,name=name.title(),apl=apl,move=move,save=save,wounds=wounds,weapons=[],sourcePage=pageidx+1,rulesText='');ops[oid]=op
   headers={w[4]:w for w in words if w[4] in ['NAME','ATK','HIT','DMG','WR'] and top+30<w[1]<top+65}
   if all(k in headers for k in ['ATK','HIT','DMG','WR']):
    atk_col=headers['ATK'][0];hit_col=headers['HIT'][0];dmg_col=headers['DMG'][0];wr_col=headers['WR'][0]
   else:atk_col,hit_col,dmg_col,wr_col=254,274,290,312
   damage_rows=[l for l in lines if dmg_col-6<l['bbox'][0]<dmg_col+16 and top+42<l['bbox'][1]<bottom-15 and re.fullmatch(r'\d+/\d+',l['text'])]
   damage_rows.sort(key=lambda l:l['bbox'][1])
   for j,row in enumerate(damage_rows):
    ry=row['bbox'][1];nexty=damage_rows[j+1]['bbox'][1] if j+1<len(damage_rows) else min(ry+28,bottom-15)
    candidates=[l for l in lines if 145<l['bbox'][0]<atk_col-2 and ry-1<=l['bbox'][1]<nexty-1 and any('Demi' in s['font'] and s['size']<=8 for s in l['spans'])]
    wname=clean(' '.join(l['text'] for l in sorted(candidates,key=lambda l:l['bbox'][1])));wname=re.sub(r'\s+\d+$','',wname)
    atk=next((w[4] for w in words if atk_col-2<w[0]<hit_col-4 and abs(w[1]-ry)<1 and re.fullmatch(r'\d+',w[4])),'');hit=next((w[4] for w in words if hit_col-3<w[0]<dmg_col-2 and abs(w[1]-ry)<1 and re.fullmatch(r'\d\+',w[4])),'')
    special_lines=[l for l in lines if wr_col-3<l['bbox'][0]<470 and ry-1<=l['bbox'][1]<nexty-1 and any('Demi' in s['font'] and s['size']<=8 for s in l['spans'])]
    special=clean(' '.join(l['text'] for l in sorted(special_lines,key=lambda l:l['bbox'][1]))).strip('- ')
    if not wname or not re.fullmatch(r'\d+',atk) or not re.fullmatch(r'\d\+',hit):warnings.append(f'{tid} {name}: unsupported weapon {wname} {atk}/{hit}');continue
    icons=[d for d in drawings if 134<d['rect'].x0<153 and d['rect'].x1<154 and ry-1<d['rect'].y0<ry+9]
    kind='ranged' if len(icons)>=4 else 'melee'
    nd,cd=map(int,row['text'].split('/'));weapon=dict(id=slug(wname),name=wname,kind=kind,attacks=int(atk),hit=int(hit[0]),normal=nd,critical=cd,rules=special,sourcePage=pageidx+1)
    if not any(w['id']==weapon['id'] for w in op['weapons']):op['weapons'].append(weapon)
   text=page.get_text(clip=fitz.Rect(130,top+40,475,bottom-15),sort=True)
   if len(text)>30:op['rulesText']+='\n'+text
  # Rules use a two-column, four-card layout with explicit category labels.
  categories=[l for l in lines if l['text'] in ['FACTION RULE','STRATEGY PLOY','FIREFIGHT PLOY','FACTION EQUIPMENT']]
  for number,cat in enumerate(categories):
   cy=cat['bbox'][1];left=99 if cat['bbox'][0]<300 else 297;right=left+195;bottom=min(cy+328,page.rect.height-20)
   ls=[l for l in lines if left<=l['bbox'][0]<right and cy+25<l['bbox'][1]<cy+80]
   titles=[l for l in ls if any((s['font'].startswith('DINCondensed') and s['size']>=11) or (s['font'].startswith('DINEngschrift') and s['size']>=11) or s['font'].startswith('Orator') for s in l['spans'])]
   if not titles:continue
   name=clean(' '.join(l['text'] for l in sorted(titles,key=lambda l:(round(l['bbox'][1]/4),l['bbox'][0]))))
   body_y=max(l['bbox'][3] for l in titles)
   subtitles=[l for l in ls if any(s['font']=='TradeGothicNextLTPro-Bd' and s['size']>=11 for s in l['spans'])]
   if subtitles:name+=' / '+clean(' '.join(l['text'] for l in subtitles))
   body=page.get_text(clip=fitz.Rect(left+5,body_y,right-5,bottom),sort=True).strip()
   if body:rules.append(dict(id=f'{slug(name)}-{pageidx+1}-{number}',name=name.title(),category=cat['text'],text=body,sourcePage=pageidx+1))
 doc.close()
 valid=[o for o in ops.values() if o['weapons']]
 for o in ops.values():
  if not o['weapons']:warnings.append(f"{tid} {o['name']}: NO WEAPONS")
 for o in valid:o['rulesText']=o['rulesText'].strip()
 if not valid:warnings.append(f'{tid}: NO OPERATIVES')
 teams.append(dict(id=tid,name=entry['title'],updated=entry['last_updated'],sourceUrl=entry['url'],operatives=valid,rules=rules))
teams.sort(key=lambda t:t['name'])
catalog=dict(snapshot='2026-09-25',source='https://www.warhammer-community.com/en-gb/downloads/kill-team/',teams=teams,counts=dict(teams=len(teams),operatives=sum(len(t['operatives']) for t in teams),weapons=sum(len(o['weapons']) for t in teams for o in t['operatives']),rules=sum(len(t['rules']) for t in teams)))
(ROOT/'src/simulation').mkdir(exist_ok=True)
(ROOT/'src/simulation/catalog.json').write_text(json.dumps(catalog,ensure_ascii=False),encoding='utf-8')
(ROOT/'public/catalog.json').write_text(json.dumps(catalog,ensure_ascii=False),encoding='utf-8')
(ROOT/'work/import-report.json').write_text(json.dumps(dict(counts=catalog['counts'],warnings=warnings,teams=[dict(name=t['name'],operatives=len(t['operatives']),weapons=sum(len(o['weapons']) for o in t['operatives']),rules=len(t['rules'])) for t in teams]),ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(dict(counts=catalog['counts'],warning_count=len(warnings),warnings=warnings[:16]),ensure_ascii=False))
