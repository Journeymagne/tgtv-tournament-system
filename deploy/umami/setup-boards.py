#!/usr/bin/env python3
"""Create private KT Companion traffic boards using the Umami API."""
import datetime
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.parse
import urllib.request
import uuid

os.umask(0o077)
root = Path('/app/ktcompanion-analytics')
website = (root / 'website-id').read_text().strip()
backup = root / 'backups' / ('pre-boards-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
backup.mkdir(parents=True, mode=0o700)
with (backup / 'analytics.dump').open('wb') as stream:
    subprocess.run(['docker', 'exec', 'ktcompanion-analytics-db-1', 'pg_dump', '-U', 'umami', '-d', 'umami', '-Fc'], stdout=stream, check=True)
with (backup / 'analytics.dump').open('rb') as stream:
    subprocess.run(['docker', 'exec', '-i', 'ktcompanion-analytics-db-1', 'pg_restore', '--list'], stdin=stream, stdout=subprocess.DEVNULL, check=True)

def api(path, data=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request('http://127.0.0.1:3010/api/' + path,
        data=json.dumps(data).encode() if data is not None else None, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)

token = api('auth/login', json.loads((root / 'admin.json').read_text()))['token']
old_dashboard = api('dashboard', token=token)
old_boards = api('boards?pageSize=100', token=token)
(backup / 'dashboard.json').write_text(json.dumps(old_dashboard, ensure_ascii=False))
(backup / 'boards.json').write_text(json.dumps(old_boards, ensure_ascii=False))

# Classify previously untagged pageviews; timestamps, sessions, URLs and counts
# are preserved. Existing custom tags are never overwritten.
sql = """BEGIN;
UPDATE website_event SET tag = CASE
 WHEN url_path IN ('/', '/home.html') THEN 'Главная'
 WHEN url_path ~ '^/(tournament|tournaments|teams|miniapp)(/|$)' OR url_path='/index.html' THEN 'Турниры'
 WHEN url_path ~ '^/studio(/|$)' THEN 'Студия'
 WHEN url_path ~ '^/dice(/|$)' THEN 'Кубики'
 WHEN url_path ~ '^/combat(/|$)' THEN 'Боевой калькулятор'
 WHEN url_path ~ '^/initiative(/|$)' OR url_path='/killteam-initiative-calculator.html' THEN 'Инициатива'
 WHEN url_path ~ '^/tracker(/|$)' OR url_path='/killteam-activation-tracker.html' THEN 'Трекер активаций'
 WHEN url_path ~ '^/(faq|community-faq)(/|$)' THEN 'FAQ'
 WHEN url_path ~ '^/(knowthykt|training|know-thy-kill-team)(/|$)' THEN 'KTKT'
 WHEN url_path ~ '^/account(/|$)' OR url_path='/account-email.html' THEN 'Личный кабинет'
 ELSE 'Прочее' END
WHERE website_id = :'website'::uuid AND event_type=1 AND COALESCE(tag,'')='';
COMMIT;
"""
subprocess.run(['docker', 'exec', '-i', 'ktcompanion-analytics-db-1', 'psql', '-X', '-U', 'umami', '-d', 'umami', '-v', 'ON_ERROR_STOP=1', '-v', 'website=' + website], input=sql, text=True, check=True)

def component(kind, title, props=None, description=None):
    value = {'type': kind, 'title': title, 'entityType': 'website', 'entityId': website}
    if props: value['props'] = props
    if description: value['description'] = description
    return value

def row(*components):
    return {'id': str(uuid.uuid4()), 'columns': [{'id': str(uuid.uuid4()), 'size': 1, 'component': c} for c in components]}

def table(title, dimension, **params):
    props = {'type': dimension, 'limit': 20, 'itemCount': 20, 'metric': 'Посетители', 'showPercentage': False, 'filterLink': False}
    if params: props['params'] = params
    return component('MetricsTable', title, props)

overview = [
    row(component('WebsiteMetricsBar', 'Аудитория всего сайта')),
    row(component('WebsiteChart', 'Динамика посетителей и просмотров'), table('Популярность разделов — по посетителям', 'tag')),
    row(component('TextBlock', 'Как читать рейтинг', {'text': 'Разделы отсортированы по числу посетителей за выбранный период. Все страницы каждого сервиса объединены: например, отдельные турниры относятся к «Турниры». Один посетитель может пользоваться несколькими разделами, поэтому суммы по разделам могут превышать аудиторию всего сайта. Период меняется сверху.'})),
    row(table('Популярные страницы', 'path'), table('С каких страниц начинают', 'entry'), table('На каких страницах заканчивают', 'exit')),
]
sections = ['Турниры', 'Студия', 'Боевой калькулятор', 'Инициатива', 'Трекер активаций', 'Кубики', 'FAQ', 'KTKT', 'Главная', 'Личный кабинет']
detail = [row(component('TextBlock', 'Страницы внутри разделов', {'text': 'Для каждого раздела показаны наиболее посещаемые страницы и число их посетителей. Сравнение общей популярности разделов находится на доске «Куда заходят посетители».'}))]
for index in range(0, len(sections), 3):
    detail.append(row(*(table(section, 'path', tag='eq.' + section) for section in sections[index:index+3])))
sources = [
    row(component('WebsiteMetricsBar', 'Аудитория всего сайта')),
    row(table('Источники переходов', 'referrer'), table('Каналы привлечения', 'channel')),
    row(table('Устройства посетителей', 'device'), table('Страны посетителей', 'country')),
    row(component('WeeklyTraffic', 'Когда заходят — дни и часы')),
]

plans = [
    ('Куда заходят посетители', 'Сравнение разделов сайта по посетителям, динамика аудитории и популярные страницы.', overview),
    ('Разделы подробно', 'Популярные страницы внутри каждого сервиса KT Companion.', detail),
    ('Источники и устройства', 'Откуда приходят посетители, какие устройства используют и когда заходят.', sources),
]
existing = {item['name']: item for item in old_boards.get('data', [])}
results = []
for name, description, rows in plans:
    payload = {'type': 'website', 'name': name, 'description': description, 'parameters': {'websiteId': website, 'rows': rows}}
    path = 'boards/' + existing[name]['id'] if name in existing else 'boards'
    saved = api(path, payload, token)
    actual = api('boards/' + saved['id'], token=token)
    assert actual['parameters']['rows'] == rows
    results.append({'name': name, 'url': 'https://stats.ktcompanion.ru/boards/' + saved['id']})

# Fill an empty personal landing dashboard; preserve any user-authored layout.
if not old_dashboard or not old_dashboard.get('parameters', {}).get('rows'):
    api('dashboard', {'name': 'Куда заходят посетители', 'description': plans[0][1], 'parameters': {'websiteId': website, 'rows': overview}}, token)

query = urllib.parse.urlencode({'startAt': int((time.time() - 30 * 86400) * 1000), 'endAt': int(time.time() * 1000), 'type': 'tag', 'limit': 20})
ranking = api('websites/' + website + '/metrics?' + query, token=token)
print('Section ranking:', json.dumps(ranking, ensure_ascii=False))
(root / 'boards.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
print(json.dumps(results, ensure_ascii=False, indent=2))
print('Backup:', backup)
