// End-to-end API tests for Spendly against a running server.
//   npm run build && npm start      (fresh DB: rm -rf .pglite first)
//   node scripts/e2e.mjs            BASE_URL defaults to http://localhost:3000
import assert from 'node:assert/strict';

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const HOST = new URL(BASE).host;

class Client {
  cookie = '';
  async req(path, { method = 'GET', body, origin } = {}) {
    const headers = { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(this.cookie && { Cookie: this.cookie }), ...(origin && { Origin: origin }) };
    const res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [kv] = c.split(';'); const [k, v] = kv.split('=');
      if (k === 'sp_session') this.cookie = v ? `sp_session=${v}` : '';
    }
    return res;
  }
  async json(path, opts) {
    const r = await this.req(path, opts);
    const text = await r.text();
    let data = {}; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { status: r.status, ...data };
  }
}

const results = [];
async function step(name, fn) {
  try { await fn(); results.push(['PASS', name]); console.log('PASS', name); }
  catch (e) { results.push(['FAIL', name]); console.log('FAIL', name, '\n   ', e.message); throw e; }
}

const a = new Client();
const b = new Client();
const stamp = Date.now();
const emailA = `alex+${stamp}@example.com`;
const pw = 'Spendly2026';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const ids = {};

try {
  await step('health', async () => {
    const h = await a.json('/api/health');
    assert.equal(h.ok, true, h.error);
  });

  await step('protected API needs a session', async () => {
    assert.equal((await a.json('/api/dashboard')).status, 401);
    assert.equal((await a.json('/api/transactions', { method: 'POST', body: {} })).status, 401);
  });

  await step('signup validates input', async () => {
    const r = await a.json('/api/auth/signup', { method: 'POST', body: { name: '', email: 'nope', password: 'short' } });
    assert.equal(r.status, 400);
    assert.ok(r.fields.name && r.fields.email && r.fields.password, JSON.stringify(r.fields));
  });

  await step('signup creates user with default categories and accounts', async () => {
    const r = await a.json('/api/auth/signup', { method: 'POST', body: { name: 'Alex', email: emailA, password: pw } });
    assert.equal(r.status, 201, r.error);
    const cats = await a.json('/api/categories');
    assert.ok(cats.categories.length >= 14);
    ids.food = cats.categories.find((c) => c.name === 'Food & dining').id;
    ids.groceries = cats.categories.find((c) => c.name === 'Groceries').id;
    ids.salary = cats.categories.find((c) => c.name === 'Salary').id;
    ids.rent = cats.categories.find((c) => c.name === 'Rent').id;
    const acc = await a.json('/api/accounts');
    assert.deepEqual(acc.accounts.map((x) => x.name), ['Cash', 'Bank']);
    ids.cash = acc.accounts[0].id; ids.bank = acc.accounts[1].id;
    const dup = await a.json('/api/auth/signup', { method: 'POST', body: { name: 'Alex', email: emailA.toUpperCase(), password: pw } });
    assert.equal(dup.status, 409);
  });

  await step('cross-site POST is blocked (CSRF)', async () => {
    const r = await a.json('/api/accounts', { method: 'POST', origin: 'https://evil.example', body: { name: 'X', kind: 'cash', color: '#FF6159' } });
    assert.equal(r.status, 403);
  });

  await step('login: wrong password, right password, logout', async () => {
    await a.json('/api/auth/logout', { method: 'POST' });
    assert.equal(a.cookie, '');
    assert.equal((await a.json('/api/auth/login', { method: 'POST', body: { email: emailA, password: 'wrong-pass1' } })).status, 401);
    assert.equal((await a.json('/api/auth/login', { method: 'POST', body: { email: 'ghost@example.com', password: 'x' } })).status, 401);
    const ok = await a.json('/api/auth/login', { method: 'POST', body: { email: emailA, password: pw } });
    assert.equal(ok.status, 200, ok.error);
  });

  await step('accounts: create with opening balance, rename', async () => {
    const r = await a.json('/api/accounts', { method: 'POST', body: { name: 'Credit card', kind: 'card', color: '#7A5CFA', opening_balance: 0 } });
    assert.equal(r.status, 201, r.error);
    ids.card = r.account.id;
    await a.json(`/api/accounts/${ids.bank}`, { method: 'PATCH', body: { name: 'HDFC', opening_balance: 5000000 } });
    const acc = await a.json('/api/accounts');
    assert.equal(acc.accounts.find((x) => x.id === ids.bank).balance, 5000000);
  });

  await step('transactions: validation rules', async () => {
    const bad = await a.json('/api/transactions', { method: 'POST', body: { kind: 'expense', amount: -5, account_id: ids.cash, occurred_on: '2026-02-30' } });
    assert.equal(bad.status, 400);
    assert.ok(bad.fields.amount && bad.fields.occurred_on);
    const sameAcc = await a.json('/api/transactions', { method: 'POST', body: { kind: 'transfer', amount: 100, account_id: ids.cash, to_account_id: ids.cash, occurred_on: today } });
    assert.equal(sameAcc.status, 400);
    const wrongKind = await a.json('/api/transactions', { method: 'POST', body: { kind: 'expense', amount: 100, account_id: ids.cash, category_id: ids.salary, occurred_on: today } });
    assert.equal(wrongKind.status, 400);
    assert.match(wrongKind.fields.category_id, /expense/);
  });

  await step('transactions: expense, income, transfer and correct balances', async () => {
    const add = (body) => a.json('/api/transactions', { method: 'POST', body: { occurred_on: today, ...body } });
    const e1 = await add({ kind: 'expense', amount: 45000, account_id: ids.bank, category_id: ids.food, merchant: 'Swiggy' });
    assert.equal(e1.status, 201, e1.error);
    assert.equal(e1.transaction.category_name, 'Food & dining');
    ids.tx1 = e1.transaction.id;
    await add({ kind: 'expense', amount: 120000, account_id: ids.card, category_id: ids.groceries, merchant: 'DMart', source: 'receipt' });
    await add({ kind: 'income', amount: 900000, account_id: ids.bank, category_id: ids.salary, merchant: 'Bonus' });
    await add({ kind: 'transfer', amount: 120000, account_id: ids.bank, to_account_id: ids.card, note: 'Pay card' });
    const acc = await a.json('/api/accounts');
    const bal = Object.fromEntries(acc.accounts.map((x) => [x.name, x.balance]));
    assert.equal(bal['HDFC'], 5000000 - 45000 + 900000 - 120000);
    assert.equal(bal['Credit card'], -120000 + 120000);
  });

  await step('transactions: filter, search, paginate, edit, delete', async () => {
    const month = today.slice(0, 7);
    assert.equal((await a.json(`/api/transactions?month=${month}&kind=expense`)).items.length, 2);
    assert.equal((await a.json(`/api/transactions?q=swig`)).items[0].merchant, 'Swiggy');
    assert.equal((await a.json(`/api/transactions?account=${ids.card}`)).items.length, 2);
    const p1 = await a.json('/api/transactions?limit=2');
    assert.equal(p1.items.length, 2);
    assert.ok(p1.next);
    const p2 = await a.json(`/api/transactions?limit=2&before=${p1.next}`);
    assert.equal(p2.items.length, 2);
    assert.ok(!p2.items.some((x) => p1.items.some((y) => y.id === x.id)), 'pages overlap');
    const ed = await a.json(`/api/transactions/${ids.tx1}`, { method: 'PATCH', body: { kind: 'expense', amount: 50000, account_id: ids.bank, category_id: ids.food, occurred_on: today, merchant: 'Swiggy', note: 'dinner' } });
    assert.equal(ed.status, 200, ed.error);
    const tmp = await a.json('/api/transactions', { method: 'POST', body: { kind: 'expense', amount: 100, account_id: ids.cash, occurred_on: today } });
    assert.equal((await a.json(`/api/transactions/${tmp.transaction.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await a.json(`/api/transactions/${tmp.transaction.id}`, { method: 'DELETE' })).status, 404);
  });

  await step('budgets: upsert one per category and track spending', async () => {
    await a.json('/api/budgets', { method: 'PUT', body: { category_id: ids.food, amount: 300000 } });
    const r = await a.json('/api/budgets', { method: 'PUT', body: { category_id: ids.food, amount: 400000 } });
    assert.equal(r.budget.amount, 400000);
    assert.equal((await a.json('/api/budgets', { method: 'PUT', body: { category_id: ids.salary, amount: 1000 } })).status, 400);
    const list = await a.json('/api/budgets');
    assert.equal(list.budgets.length, 1);
    assert.equal(list.budgets[0].spent, 50000);
  });

  await step('recurring (auto): back-fills past occurrences exactly once', async () => {
    const start = addDays(today, -70);
    const r = await a.json('/api/recurring', { method: 'POST', body: { title: 'Gym membership', kind: 'expense', amount: 150000, account_id: ids.bank, freq: 'monthly', interval: 1, start_date: start, mode: 'auto' } });
    assert.equal(r.status, 201, r.error);
    assert.ok(r.posted >= 2 && r.posted <= 3, `posted ${r.posted}`);
    const count = async () => (await a.json('/api/transactions?q=Gym&limit=200')).items.length;
    const n1 = await count();
    await Promise.all([a.json('/api/dashboard'), a.json('/api/dashboard'), a.json('/api/recurring')]);
    assert.equal(await count(), n1, 'recurring posted twice');
    ids.gym = r.rule.id;
  });

  await step('bills: appear as due, pay posts a transaction, skip advances', async () => {
    const due = addDays(today, 3);
    const r = await a.json('/api/recurring', { method: 'POST', body: { title: 'Flat rent', kind: 'expense', amount: 1800000, account_id: ids.bank, category_id: ids.rent, freq: 'monthly', start_date: due, mode: 'bill', remind_days: 2 } });
    assert.equal(r.status, 201, r.error);
    ids.rent_rule = r.rule.id;
    let list = await a.json('/api/recurring');
    const bill = list.bills.find((x) => x.rule_id === ids.rent_rule);
    assert.equal(bill.date, due);
    assert.equal(bill.days_until, 3);
    const paid = await a.json(`/api/recurring/${ids.rent_rule}/pay`, { method: 'POST', body: {} });
    assert.equal(paid.status, 201, paid.error);
    assert.equal(paid.occurrence_date, due);
    const tx = await a.json('/api/transactions?q=Flat rent');
    assert.equal(tx.items.length, 1);
    assert.equal(tx.items[0].source, 'bill');
    list = await a.json('/api/recurring');
    assert.ok(list.bills.find((x) => x.rule_id === ids.rent_rule).date > due);
    const sk = await a.json(`/api/recurring/${ids.rent_rule}/skip`, { method: 'POST' });
    assert.equal(sk.status, 200);
    assert.equal((await a.json('/api/transactions?q=Flat rent')).items.length, 1, 'skip must not post');
  });

  await step('goals: contribute, withdraw guard, monthly need', async () => {
    const deadline = addDays(today, 180);
    const g = await a.json('/api/goals', { method: 'POST', body: { name: 'Goa trip', target: 3000000, deadline, color: '#00B8A9', glyph: 'plane' } });
    assert.equal(g.status, 201, g.error);
    ids.goal = g.goal.id;
    const m = await a.json(`/api/goals/${ids.goal}/moves`, { method: 'POST', body: { amount: 500000, made_on: today } });
    assert.equal(m.saved, 500000);
    const over = await a.json(`/api/goals/${ids.goal}/moves`, { method: 'POST', body: { amount: -600000, made_on: today } });
    assert.equal(over.status, 400);
    const list = await a.json('/api/goals');
    const goal = list.goals[0];
    assert.equal(goal.saved, 500000);
    assert.ok(goal.monthlyNeed > 0 && goal.monthlyNeed <= 2500000);
  });

  await step('dashboard: totals, safe-to-spend math and charts are consistent', async () => {
    const d = await a.json('/api/dashboard');
    assert.equal(d.status, 200, d.error);
    const monthTx = (await a.json(`/api/transactions?month=${today.slice(0, 7)}&kind=expense&limit=200`)).items;
    assert.equal(d.month.expense, monthTx.reduce((s, t) => s + t.amount, 0));
    assert.equal(d.safeToSpend.basis, 'budget');
    assert.equal(d.safeToSpend.breakdown.reduce((s, x) => s + x.amount, 0), d.safeToSpend.pool);
    assert.equal(d.safeToSpend.perDay, Math.max(0, Math.floor(d.safeToSpend.pool / d.safeToSpend.daysLeft)));
    assert.equal(d.cashflow.length, 6);
    assert.ok(d.accounts.length === 3 && d.goals.length === 1);
  });

  await step('exports: CSV with formula guard, JSON backup, ICS calendar', async () => {
    await a.json('/api/transactions', { method: 'POST', body: { kind: 'expense', amount: 100, account_id: ids.cash, occurred_on: today, merchant: '=cmd|calc' } });
    const csv = await (await a.req('/api/export/csv')).text();
    assert.match(csv, /Date,Type,Amount,Currency/);
    assert.match(csv, /'=cmd\|calc/);
    assert.match(csv, /,-500,INR,HDFC,/);
    const j = await (await a.req('/api/export/json')).json();
    assert.equal(j.app, 'Spendly');
    assert.ok(j.transactions.length >= 6 && j.recurring.length === 2);
    const ics = await a.req('/api/export/bills.ics');
    assert.match(ics.headers.get('content-type'), /text\/calendar/);
    const body = await ics.text();
    assert.match(body, /SUMMARY:Flat rent/);
    assert.match(body, /TRIGGER:-P2D/);
  });

  await step('isolation: another user cannot see or change your data', async () => {
    const r = await b.json('/api/auth/signup', { method: 'POST', body: { name: 'Bea', email: `bea+${stamp}@example.com`, password: pw } });
    assert.equal(r.status, 201, r.error);
    assert.equal((await b.json('/api/transactions')).items.length, 0);
    assert.equal((await b.json(`/api/transactions/${ids.tx1}`, { method: 'DELETE' })).status, 404);
    assert.equal((await b.json(`/api/accounts/${ids.bank}`, { method: 'PATCH', body: { name: 'pwned' } })).status, 404);
    assert.equal((await b.json(`/api/recurring/${ids.rent_rule}/pay`, { method: 'POST', body: {} })).status, 404);
    assert.equal((await b.json(`/api/goals/${ids.goal}/moves`, { method: 'POST', body: { amount: 100, made_on: today } })).status, 404);
    const bAcc = (await b.json('/api/accounts')).accounts[0].id;
    // using someone else's category or account id in your own transaction is rejected
    const steal = await b.json('/api/transactions', { method: 'POST', body: { kind: 'expense', amount: 100, account_id: ids.bank, occurred_on: today } });
    assert.equal(steal.status, 400);
    const cat = await b.json('/api/transactions', { method: 'POST', body: { kind: 'expense', amount: 100, account_id: bAcc, category_id: ids.food, occurred_on: today } });
    assert.equal(cat.status, 400);
    assert.equal((await b.json('/api/budgets', { method: 'PUT', body: { category_id: ids.food, amount: 100 } })).status, 400);
    const acc = await a.json('/api/accounts');
    assert.equal(acc.accounts.find((x) => x.id === ids.bank).name, 'HDFC');
  });

  await step('demo workspace: seeded, labelled, and posts its salary', async () => {
    const d = new Client();
    const r = await d.json('/api/auth/demo', { method: 'POST' });
    assert.equal(r.status, 201, r.error);
    const me = await d.json('/api/me');
    assert.equal(me.user.is_demo, true);
    const dash = await d.json('/api/dashboard');
    assert.ok(dash.accounts.some((x) => /demo/i.test(x.name)), 'demo accounts must be labelled');
    assert.ok(dash.month.income > 0 && dash.month.expense > 0);
    assert.ok(dash.goals.length === 3);
    assert.ok(dash.insights.length >= 1);
    const sal = (await d.json('/api/transactions?q=Salary&limit=10')).items;
    assert.ok(sal.length >= 3, 'salary should auto-post each month');
    assert.equal((await d.json('/api/auth/login', { method: 'POST', body: { email: me.user.email, password: 'x' } })).status, 401, 'demo users cannot log in with a password');
  });

  await step('login rate limiting', async () => {
    const c = new Client();
    let last;
    for (let i = 0; i < 9; i++) last = await c.json('/api/auth/login', { method: 'POST', body: { email: `bea+${stamp}@example.com`, password: 'nope-nope1' } });
    assert.equal(last.status, 429);
  });

  await step('settings and account deletion removes everything', async () => {
    const s = await b.json('/api/me', { method: 'PATCH', body: { currency: 'USD' } });
    assert.equal(s.user.currency, 'USD');
    assert.equal((await b.json('/api/me', { method: 'DELETE', body: { confirm: 'nope' } })).status, 400);
    assert.equal((await b.json('/api/me', { method: 'DELETE', body: { confirm: 'DELETE' } })).status, 200);
    assert.equal((await b.json('/api/me')).status, 401);
  });
} catch {
  // reported below
} finally {
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} steps passed`);
  process.exit(failed ? 1 : 0);
}
