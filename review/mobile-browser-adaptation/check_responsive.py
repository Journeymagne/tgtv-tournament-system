"""Browser regression checks. Requires Python Playwright and installed browsers.

python review/mobile-browser-adaptation/check_responsive.py --origin http://127.0.0.1:3016
Only run against a local preview database: some interaction checks edit local drafts.
"""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ROUTES = {
    'home': '/', 'leaderboard': '/tournament#/leaderboard',
    'games': '/tournament#/games', 'tournaments': '/tournament#/tournaments',
    'statistics': '/tournament#/statistics', 'calendar': '/tournament#/calendar',
    'profile': '/tournament#/profile', 'administration': '/tournament#/administration',
    'documentation': '/tournament#/documentation', 'teams': '/tournament#/teams',
    'studio': '/studio', 'studio-editor': '/studio#/editor', 'dice': '/dice',
    'faq': '/faq', 'faq-info': '/faq/info', 'faq-conduct': '/faq/conduct',
    'training': '/knowthykt', 'tierlist': '/tierlist', 'account': '/account',
    'initiative': '/initiative', 'tracker': '/tracker', 'combat': '/combat',
    'miniapp': '/miniapp', 'maps': '/maps/index.html',
    'my-games': '/tournament#/mygames', 'challenge': '/tournament#/challenge',
    'achievements': '/tournament#/achievements', 'feedback': '/tournament#/feedback',
    'admin-people': '/tournament#/administration/people',
    'admin-content': '/tournament#/administration/content',
    'tournament-create': '/tournament#/administration/tournaments/admin/create',
    'documentation-article': '/tournament#/documentation/changelog',
    'training-bank': '/knowthykt#bank', 'training-progress': '/knowthykt#progress',
    'training-sources': '/knowthykt#sources', 'training-changelog': '/knowthykt#changelog',
    'training-moderation': '/knowthykt#moderation',
    'combat-fight': '/combat/fight', 'combat-help': '/combat/help',
    'combat-rules': '/combat/rules/combat',
}
WIDTHS = [320, 360, 375, 390, 430, 768, 1024, 1440]
REPRESENTATIVE = {'home', 'leaderboard', 'administration', 'studio-editor', 'faq', 'training', 'tierlist', 'combat'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', default='http://127.0.0.1:3016')
    parser.add_argument('--output', default='work/mobile-runtime/result')
    parser.add_argument('--engines', nargs='+', default=['chromium', 'firefox', 'webkit'])
    parser.add_argument('--chrome', default='C:/Program Files/Google/Chrome/Application/chrome.exe')
    parser.add_argument('--quick', action='store_true', help='Only the reproduced regression cases')
    parser.add_argument('--interactions-only', action='store_true')
    args = parser.parse_args()
    if urlparse(args.origin).hostname not in ['127.0.0.1', 'localhost']:
        parser.error('A loopback preview is required')
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    report = {'origin': args.origin, 'layouts': [], 'checks': [], 'failures': [], 'errors': [], 'resources': []}

    def check(name, condition, detail=None):
        row = {'name': name, 'passed': bool(condition)}
        if detail is not None:
            row['detail'] = detail
        report['checks'].append(row)
        if not condition:
            report['failures'].append(row)
            print(json.dumps(row, ensure_ascii=True), flush=True)

    def visit(page, route):
        # Hash navigation completes before application rendering. Reload a real
        # document so networkidle covers its data and each route is measured.
        page.goto('about:blank')
        response = page.goto(args.origin + route, wait_until='networkidle')
        assert response is None or response.ok, f'{route}: HTTP {response.status}'
        page.wait_for_load_state('networkidle')
        if route == '/studio#/editor':
            page.locator('[data-studio-view="editor"]').click()

    def attempt(name, task):
        try:
            task()
        except Exception as error:
            check(name, False, str(error))

    def observe(page, engine):
        page.on('pageerror', lambda e: report['errors'].append({'engine':engine,'message':str(e)}))
        page.on('console', lambda m: report['errors'].append({'engine':engine,'console':m.text,'location':m.location,'page':page.url}) if m.type == 'error' else None)
        page.on('response', lambda r: report['resources'].append({'engine':engine,'status':r.status,'url':r.url}) if r.status >= 400 else None)
        page.on('requestfailed', lambda r: report['resources'].append({'engine':engine,'error':r.failure,'url':r.url}) if 'ABORT' not in (r.failure or '').upper() and 'cancelled' not in (r.failure or '').lower() else None)

    with sync_playwright() as p:
        for engine in args.engines:
            browser = getattr(p, engine).launch(headless=True, **({'executable_path': args.chrome} if engine == 'chromium' else {}))
            context = browser.new_context(viewport={'width': 390, 'height': 844})
            context.add_init_script("try{localStorage.setItem('tgtv-locale','ru');localStorage.setItem('tgtv-theme','dark');}catch{}")
            page = context.new_page()
            page.set_default_timeout(6000)
            observe(page, engine)
            me = context.request.get(args.origin + '/api/me').json()
            check(engine + ': administrator autologin', me.get('user', {}).get('isAdmin') is True)

            routes = dict(ROUTES)
            if not args.quick:
                visit(page, '/tournament#/tournaments')
                public_routes = page.locator('a[href^="/tournaments/"]').evaluate_all('els=>[...new Set(els.map(e=>e.getAttribute("href").split("#")[0]))].slice(0,3)')
                for index, route in enumerate(public_routes):
                    routes[f'public-tournament-{index + 1}'] = route
                    routes[f'tournament-settings-{index + 1}'] = route + '#settings'
                visit(page,'/tournament#/leaderboard')
                profile_route=page.locator('tbody a[href*="/players/"]').first.get_attribute('href')
                routes['player-profile']=profile_route
                visit(page,'/tournament#/games')
                game_route=page.locator('[data-game-open]').first.get_attribute('href')
                routes['game-detail']=game_route
            for name, route in ([] if args.interactions_only else dict(administration=ROUTES['administration']).items() if args.quick else routes.items()):
                visit(page, route)
                for width, height in ([(320, 568)] if args.quick else [(w, 900 if w >= 768 else 844) for w in WIDTHS] + [(844, 390)]):
                    page.set_viewport_size({'width': width, 'height': height})
                    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
                    metrics = page.evaluate('''() => ({width:innerWidth,scroll:document.documentElement.scrollWidth,
                        heading:document.querySelector('[data-content] h2,main h1,h1')?.textContent,
                        viewport:document.querySelector('meta[name="viewport"]')?.content,
                        brokenImages:[...document.images].filter(e=>{const r=e.getBoundingClientRect();return r.width && r.height && r.top<innerHeight && r.bottom>0 && e.complete && !e.naturalWidth}).map(e=>e.src)})''')
                    report['layouts'].append({'engine': engine, 'route': name, 'height': height, **metrics})
                    check(f'{engine}: {name} {width}x{height} fits', metrics['scroll'] <= width + 1, metrics)
                    check(f'{engine}: {name} images {width}x{height}', not metrics['brokenImages'], metrics['brokenImages'])
                    check(f'{engine}: {name} zoom allowed', bool(metrics['viewport']) and 'user-scalable=no' not in metrics['viewport'] and 'maximum-scale=1' not in metrics['viewport'])
                    if not args.quick and name in REPRESENTATIVE and (width in [390, 768, 1440] or height == 390):
                        page.screenshot(path=str(out / f'{engine}-{name}-{width}x{height}.png'))

            page.close()
            touch_context = browser.new_context(viewport={'width':390,'height':844}, has_touch=True,
                **({'is_mobile':True,'device_scale_factor':2} if engine != 'firefox' else {}))
            touch_context.add_init_script("try{localStorage.setItem('tgtv-locale','ru');localStorage.setItem('tgtv-theme','dark');}catch{}")
            page = touch_context.new_page()
            page.set_default_timeout(6000)
            observe(page, engine)

            def navigation():
                page.set_viewport_size({'width': 390, 'height': 844})
                visit(page, '/tournament#/leaderboard')
                sidebar = page.locator('.sidebar')
                check(engine + ': closed mobile navigation is inert', sidebar.evaluate('e=>e.inert'))
                toggle = page.locator('[data-sidebar-toggle]')
                toggle.tap()
                check(engine + ': menu focus enters navigation', sidebar.evaluate('e=>e.contains(document.activeElement)'))
                page.keyboard.press('Shift+Tab')
                check(engine + ': menu traps reverse tab', sidebar.evaluate('e=>e.contains(document.activeElement)'))
                page.keyboard.press('Escape')
                expect(toggle).to_have_attribute('aria-expanded', 'false')
                check(engine + ': menu returns focus', toggle.evaluate('e=>e===document.activeElement'))
                page.set_viewport_size({'width': 1440, 'height': 900})
                expect(sidebar).not_to_have_attribute('inert', '')
                check(engine + ': desktop navigation active', not sidebar.evaluate('e=>e.inert'))
                expect(page.locator('.sidebar-close')).not_to_be_visible()
                check(engine + ': desktop close control hidden', True)

            attempt(engine + ': navigation scenario', navigation)

            def touch_fields():
                page.set_viewport_size({'width': 320, 'height': 568})
                visit(page, '/faq')
                check(engine + ': FAQ bookmark touch target', page.locator('.bookmark').first.evaluate('e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44}'))
                check(engine + ': mobile search font avoids focus zoom', page.locator('#faq-search').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)>=16'))

            attempt(engine + ': touch scenario', touch_fields)
            if not args.quick:
                def tables():
                    page.set_viewport_size({'width':320,'height':568})
                    visit(page,'/tournament#/leaderboard')
                    expect(page.locator('[data-view="administration"]')).to_have_count(1)
                    wrapper=page.locator('.table-wrap').first
                    expect(wrapper).to_have_attribute('tabindex','0')
                    wrapper.focus()
                    page.keyboard.press('ArrowRight')
                    page.wait_for_function('() => document.querySelector(".table-wrap").scrollLeft>0')
                    check(engine+': table arrow-key scrolling',True)
                    check(engine+': table focus visible',wrapper.evaluate('e=>getComputedStyle(e).outlineStyle!=="none"'))
                    search=page.locator('#leaderboard-search')
                    search.fill('zz-no-player-90210')
                    expect(page.locator('tbody a[href*="/players/"]')).to_have_count(0)
                    search.fill('')
                    first=page.locator('tbody a[href*="/players/"]').first
                    expect(first).to_be_visible()
                    previous=first.get_attribute('href')
                    page.locator('[data-pagination-target="leaderboard"][data-pagination-page="2"]').tap()
                    expect(first).not_to_have_attribute('href',previous)
                    page.locator('[data-statistics-order-direction="leaderboard"]').tap()
                    check(engine+': leaderboard search pagination sorting',True)
                attempt(engine+': table scenario',tables)

                def notifications():
                    for route, selector, toggle in [('/tournament#/leaderboard','[data-notification-panel]','[data-notification-toggle]'),('/faq','.shared-notification-popup','.shared-notifications>summary')]:
                        for width, height in [(320,568),(844,390)]:
                            page.set_viewport_size({'width':width,'height':height})
                            visit(page,route)
                            if height == 390:
                                check(engine+': landscape header scrolls away',page.locator('.companion-utility').evaluate('e=>getComputedStyle(e).position!=="sticky"'))
                            page.locator(toggle).tap()
                            panel=page.locator(selector)
                            expect(panel).to_be_visible()
                            box=panel.bounding_box()
                            check(f'{engine}: notifications fit {route} {width}x{height}', box['x']>=0 and box['y']>=0 and box['x']+box['width']<=width+1 and box['y']+box['height']<=height+1,box)
                            page.keyboard.press('Escape')
                            expect(panel).not_to_be_visible()
                attempt(engine+': notification scenario',notifications)

                def faq():
                    page.set_viewport_size({'width':320,'height':568})
                    visit(page,'/faq')
                    page.locator('#mobile-filters').tap()
                    expect(page.locator('#mobile-filters')).to_have_attribute('aria-expanded','true')
                    expect(page.locator('#filters')).to_be_visible()
                    page.locator('#team-search').fill('Kommandos')
                    expect(page.locator('#team-search')).to_have_value('Kommandos')
                    page.keyboard.press('Escape')
                    expect(page.locator('#mobile-filters')).to_have_attribute('aria-expanded','false')
                    page.locator('#faq-search').fill('zz-no-matching-rule-90210')
                    expect(page.locator('.faq-card')).to_have_count(0)
                    page.locator('#faq-search').fill('')
                    page.locator('[data-open]').first.tap()
                    expect(page.locator('#detail-dialog')).to_be_visible()
                    page.screenshot(path=str(out/f'{engine}-faq-detail-320.png'))
                    page.keyboard.press('Escape')
                    expect(page.locator('#detail-dialog')).not_to_be_visible()
                    page.locator('#new-entry').tap()
                    page.locator('#edit-question').fill('x')
                    page.locator('#save-entry').tap()
                    check(engine+': FAQ invalid question reported',page.locator('#edit-question').evaluate('e=>!e.validity.valid'))
                    expect(page.locator('#edit-question')).to_be_in_viewport()
                    page.screenshot(path=str(out/f'{engine}-faq-validation-320.png'))
                    page.keyboard.press('Escape')
                    check(engine+': FAQ interactions',True)
                attempt(engine+': FAQ scenario',faq)

                def studio():
                    visit(page,'/studio#/editor')
                    page.locator('.studio-export-menu>summary').tap()
                    expect(page.locator('.studio-export-options')).to_be_visible()
                    page.keyboard.press('Escape')
                    expect(page.locator('.studio-export-menu')).not_to_have_attribute('open','')
                    for width,height in [(320,568),(844,390)]:
                        page.set_viewport_size({'width':width,'height':height})
                        page.locator('#new-project').tap()
                        dialog=page.locator('#create-project-dialog')
                        expect(dialog).to_be_visible()
                        box=dialog.bounding_box()
                        check(f'{engine}: Studio dialog fits {width}x{height}',box['x']>=0 and box['y']>=0 and box['x']+box['width']<=width+1 and box['y']+box['height']<=height+1,box)
                        dialog.locator('[data-create-project]').last.scroll_into_view_if_needed()
                        page.screenshot(path=str(out/f'{engine}-studio-dialog-{width}x{height}.png'))
                        page.keyboard.press('Escape')
                        expect(dialog).not_to_be_visible()
                    check(engine+': Studio menu and dialog',True)
                attempt(engine+': Studio scenario',studio)

                def tierlist():
                    page.set_viewport_size({'width':390,'height':844})
                    visit(page,'/tierlist')
                    card=page.locator('#pool .tl-card').first
                    card_id=card.get_attribute('data-id')
                    card.tap()
                    page.locator('.tl-rank[data-rank="S"]').tap()
                    expect(page.locator('#tier-S .tl-card[data-id="'+card_id+'"]')).to_have_count(1)
                    page.locator('#undo').tap()
                    expect(page.locator('#pool .tl-card[data-id="'+card_id+'"]')).to_have_count(1)
                    title=page.locator('#list-title')
                    title.fill('')
                    page.locator('#save-list').tap()
                    expect(page.locator('#page-status')).not_to_be_empty()
                    page.locator('#my-lists').tap()
                    expect(page.locator('dialog[open]')).to_be_visible()
                    page.keyboard.press('Escape')
                    check(engine+': tierlist touch move, undo and validation',True)
                attempt(engine+': tierlist scenario',tierlist)

                def tools():
                    page.set_viewport_size({'width':320,'height':568})
                    visit(page,'/tracker')
                    page.locator('#myCount').fill('8')
                    page.locator('#oppCount').fill('6')
                    page.locator('#oppCount').press('Tab')
                    check(engine+': tracker recomputes track',page.locator('.slot').count()>0)
                    visit(page,'/initiative')
                    page.locator('#run').tap()
                    expect(page.locator('#download')).to_be_enabled()
                    check(engine+': initiative calculation',True)
                    visit(page,'/knowthykt#training')
                    if page.locator('[data-action="resume"]').count():
                        page.locator('[data-action="resume"]').tap()
                    else:
                        page.locator('[data-mode="1"]').tap()
                        page.locator('[data-action="start"]').tap()
                    expect(page.locator('[data-action="start"]')).to_have_count(0)
                    check(engine+': training session starts',page.locator('[data-action="start"]').count()==0)
                    page.screenshot(path=str(out/f'{engine}-training-session-320.png'))
                attempt(engine+': tools scenario',tools)

                def appearance():
                    page.set_viewport_size({'width':390,'height':844})
                    visit(page,'/')
                    page.locator('[data-theme-choice="light"]').tap()
                    expect(page.locator('html')).to_have_attribute('data-theme','light')
                    page.locator('[data-lang-toggle]').tap()
                    expect(page.locator('html')).to_have_attribute('lang','en')
                    check(engine+': light English header fits',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                    page.screenshot(path=str(out/f'{engine}-home-light-en-390.png'))
                attempt(engine+': appearance scenario',appearance)

            touch_context.close()
            context.close()
            browser.close()

    check('no uncaught JavaScript errors', not report['errors'], report['errors'])
    check('no failed resource responses', not report['resources'], report['resources'])
    (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'layouts': len(report['layouts']), 'checks': len(report['checks']), 'failures': len(report['failures']), 'output': str(out)}), flush=True)
    return 1 if report['failures'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
