"""Browser journey test for Spendly (Playwright for Python).

    pip install playwright && python -m playwright install chromium
    BASE_URL=http://localhost:3000 python tests/ui_smoke.py

Drives the real UI: sign up, add an expense, scan a receipt (real OCR), set a budget,
add and pay a bill, create a goal and add money, check keyboard + mobile layout, export CSV.
"""
import os, re, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BASE_URL', 'http://localhost:3000').rstrip('/')
HERE = Path(__file__).parent
results = []

def step(name):
    def wrap(fn):
        try:
            fn(); results.append(True); print('PASS', name)
        except Exception as e:
            results.append(False); print('FAIL', name, '\n   ', str(e).splitlines()[0][:300])
            raise
    return wrap

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    email = f'ui{int(time.time())}@example.com'
    try:
        @step('landing renders and links to sign up')
        def _():
            page.goto(BASE + '/')
            expect(page.get_by_role('heading', name='How much can I spend today?')).to_be_visible()
            page.get_by_role('link', name='Create a free account').click()
            page.wait_for_url('**/signup')

        @step('sign up shows field errors, then succeeds')
        def _():
            page.get_by_role('button', name='Create account').click()
            expect(page.get_by_text('Enter a valid email address.')).to_be_visible()
            page.get_by_label('Your name').fill('Priya')
            page.get_by_label('Email').fill(email)
            page.get_by_label('Password', exact=True).fill('Spendly2026')
            page.get_by_role('button', name='Show password').click()
            assert page.get_by_label('Password', exact=True).get_attribute('type') == 'text'
            page.get_by_role('button', name='Create account').click()
            page.wait_for_url(re.compile(re.escape(BASE) + r'/app(\?.*)?$'))
            expect(page.get_by_role('heading', name='Three things to get going')).to_be_visible()
            expect(page.get_by_test_id('verify-banner')).to_contain_text('We sent a confirmation link to ' + email)

        @step('add an expense through the sheet; Escape closes it')
        def _():
            page.get_by_role('button', name='Add a transaction').click()
            dialog = page.get_by_role('dialog')
            expect(dialog).to_be_visible()
            page.keyboard.press('Escape')
            expect(dialog).to_be_hidden()
            page.get_by_role('button', name='Add a transaction').click()
            page.get_by_role('button', name='Add transaction', exact=True).last.click()
            expect(page.get_by_text('Enter an amount above zero')).to_be_visible()
            page.locator('#amt').fill('349')
            page.get_by_role('button', name='Food & dining').click()
            page.get_by_label('Where (optional)').fill('Swiggy')
            page.get_by_role('dialog').get_by_role('button', name='Add transaction').click()
            expect(page.get_by_text('Expense of ₹349 added')).to_be_visible()

        @step('scan a receipt with real OCR and save it')
        def _():
            page.get_by_role('button', name='Add a transaction').click()
            page.set_input_files('input[type=file]', str(HERE / 'fixtures' / 'receipt.png'))
            expect(page.get_by_text('Found ₹777')).to_be_visible(timeout=120_000)
            assert page.input_value('#amt') == '777'
            assert page.get_by_label('Where (optional)').input_value() == 'Spice Route Kitchen'
            page.get_by_role('dialog').get_by_role('button', name='Add transaction').click()
            expect(page.get_by_text('Expense of ₹777 added')).to_be_visible()

        @step('activity lists both, search filters, edit opens the sheet')
        def _():
            page.get_by_role('link', name='Activity').first.click()
            expect(page.get_by_text('Spice Route Kitchen')).to_be_visible()
            expect(page.get_by_text('(scanned)')).to_be_visible()
            page.get_by_placeholder('Search shops, notes or categories').fill('swig')
            expect(page.get_by_text('Spice Route Kitchen')).to_be_hidden()
            page.get_by_text('Swiggy').click()
            expect(page.get_by_role('heading', name='Edit transaction')).to_be_visible()
            page.keyboard.press('Escape')

        @step('budget, bill paid, and the daily number appears')
        def _():
            page.get_by_role('link', name='Plan').first.click()
            page.get_by_role('button', name='Create a budget').click()
            page.get_by_label('Category').select_option(label='Food & dining')
            page.get_by_label('Each month').fill('6000')
            page.get_by_role('button', name='Save budget').click()
            expect(page.get_by_text('Budget saved')).to_be_visible()
            expect(page.get_by_text(re.compile(r'₹1,126 of ₹6,000 used'))).to_be_visible()
            page.get_by_role('button', name='Add recurring item').click()
            page.get_by_label('Name').fill('Broadband')
            page.get_by_label('Amount').fill('799')
            page.get_by_role('button', name='Save recurring item').click()
            expect(page.get_by_text('Recurring item saved')).to_be_visible()
            page.get_by_role('button', name='Paid').first.click()
            expect(page.get_by_text('Broadband marked as paid')).to_be_visible()
            page.get_by_role('link', name='Home').first.click()
            expect(page.locator('.ticket-amount')).to_have_text(re.compile(r'₹[\d,]+'))
            expect(page.get_by_text('Spent in those categories')).to_be_visible()

        @step('goal: create and add money')
        def _():
            page.get_by_role('link', name='Goals').first.click()
            page.get_by_role('button', name='Create your first goal').click()
            page.get_by_label('What for').fill('Bike')
            page.get_by_label('Target').fill('60000')
            page.get_by_role('button', name='Create goal').click()
            page.get_by_role('button', name='Add money').click()
            page.get_by_label('Amount').fill('6000')
            page.get_by_role('button', name='Add to goal').click()
            expect(page.get_by_text('Added ₹6,000 to Bike')).to_be_visible()
            expect(page.get_by_text('10%')).to_be_visible()

        @step('CSV export downloads with the scanned expense')
        def _():
            page.get_by_role('link', name='More').first.click()
            with page.expect_download() as d:
                page.get_by_role('link', name='Transactions (CSV)').click()
            text = Path(d.value.path()).read_text(encoding='utf-8-sig')
            assert 'Spice Route Kitchen' in text and ',receipt' in text, text[:300]

        @step('forgot password and privacy pages work')
        def _():
            p2 = browser.new_page()
            p2.goto(BASE + '/login')
            p2.get_by_role('link', name='Forgot password?').click()
            p2.get_by_label('Email').fill('nobody@example.com')
            p2.get_by_role('button', name='Send reset link').click()
            expect(p2.get_by_text('If that email has a Spendly account')).to_be_visible()
            p2.goto(BASE + '/reset-password?token=bogus')
            p2.get_by_label('New password', exact=True).fill('Spendly2030')
            p2.get_by_label('Confirm new password').fill('Spendly2030')
            p2.get_by_role('button', name='Save new password').click()
            expect(p2.get_by_text('expired or was already used')).to_be_visible()
            p2.goto(BASE + '/privacy')
            expect(p2.get_by_role('heading', name='Site owner notifications')).to_be_visible()
            p2.close()

        @step('mobile: no horizontal scroll, tab bar fits, settings reachable')
        def _():
            m = browser.new_context(viewport={'width': 375, 'height': 812})
            m.add_cookies(ctx.cookies())
            mp = m.new_page()
            mp.goto(BASE + '/app')
            mp.wait_for_selector('.ticket-amount')
            assert mp.evaluate('document.documentElement.scrollWidth') <= 375
            bar = mp.locator('.tabbar').bounding_box()
            assert bar['height'] <= 90, bar
            mp.get_by_role('link', name=re.compile('^More')).click()
            mp.wait_for_url('**/app/more')
            m.close()

        @step('no uncaught page errors')
        def _():
            assert not errors, errors
    except Exception:
        pass
    finally:
        browser.close()

print(f'\n{sum(results)}/{len(results)} UI steps passed')
sys.exit(0 if all(results) else 1)
