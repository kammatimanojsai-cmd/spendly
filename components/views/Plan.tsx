'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useApp } from '../AppShell';
import { Empty, ErrorBox, Field, LoadingBlock, Progress, Sheet, api, refreshAll, useForm, useToast } from '../ui';
import Icon, { Glyph } from '../Icon';
import { parseAmount, minorFactor } from '@/lib/money';
import { describeRule } from '@/lib/recurrence';
import { formatDay, todayIn, daysInMonth, parts } from '@/lib/dates';

type Budget = { id: number; category_id: number; amount: number; name: string; color: string; glyph: string; spent: number };
type Rule = { id: number; title: string; kind: string; amount: number; mode: 'auto' | 'bill'; freq: any; interval: number; active: boolean; next_date: string | null; monthly: number; account_name: string; category_name: string | null; category_color: string | null; category_glyph: string | null; remind_days: number };
type Bill = { rule_id: number; title: string; amount: number; date: string; index: number; overdue: boolean; days_until: number };

function BudgetSheet({ open, onClose, edit, used }: { open: boolean; onClose: () => void; edit: Budget | null; used: Set<number> }) {
  const { categories, user } = useApp();
  const toast = useToast();
  const { errors, busy, submit, formError, setErrors } = useForm();
  const [cat, setCat] = useState<number | ''>('');
  const [amt, setAmt] = useState('');
  const options = categories.filter((c) => c.kind === 'expense' && (!used.has(c.id) || c.id === edit?.category_id));
  return (
    <Sheet open={open} onClose={onClose} title={edit ? `Budget for ${edit.name}` : 'New monthly budget'}>
      <form className="form" noValidate onSubmit={async (e) => {
        e.preventDefault();
        const amount = parseAmount(amt, user.currency);
        const category_id = edit ? edit.category_id : Number(cat);
        if (!category_id) return setErrors({ category_id: 'Pick a category.' });
        if (!amount) return setErrors({ amount: 'Enter a monthly amount above zero.' });
        const r = await submit(() => api('/api/budgets', { method: 'PUT', body: { category_id, amount } }));
        if (r) { refreshAll(); toast({ kind: 'ok', text: 'Budget saved' }); onClose(); setAmt(''); setCat(''); }
      }}>
        {!edit && (
          <Field label="Category" error={errors.category_id}>
            <select className="select" value={cat} onChange={(e) => setCat(Number(e.target.value))} aria-invalid={!!errors.category_id}>
              <option value="">Choose…</option>
              {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Each month" error={errors.amount}>
          <input className="input" inputMode="decimal" placeholder={edit ? String(edit.amount / minorFactor(user.currency)) : '5000'} value={amt} onChange={(e) => setAmt(e.target.value)} aria-invalid={!!errors.amount} data-autofocus />
        </Field>
        {formError && <p className="field-err">{formError}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          {edit && <button type="button" className="btn btn-danger" disabled={busy} onClick={async () => {
            const r = await submit(() => api(`/api/budgets/${edit.id}`, { method: 'DELETE' }));
            if (r) { refreshAll(); toast({ kind: 'ok', text: 'Budget removed' }); onClose(); }
          }}>Remove</button>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save budget'}</button>
        </div>
      </form>
    </Sheet>
  );
}

function RuleSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { accounts, categories, user } = useApp();
  const toast = useToast();
  const { errors, busy, submit, formError, setErrors } = useForm();
  const today = todayIn(user.timezone);
  const [f, setF] = useState({ title: '', kind: 'expense', amount: '', account_id: 0, category_id: 0, freq: 'monthly', interval: 1, start_date: today, end_date: '', mode: 'bill', remind_days: 3 });
  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));
  const cats = categories.filter((c) => c.kind === f.kind);
  return (
    <Sheet open={open} onClose={onClose} title="New recurring item">
      <form className="form" noValidate onSubmit={async (e) => {
        e.preventDefault();
        const amount = parseAmount(f.amount, user.currency);
        if (!amount) return setErrors({ amount: 'Enter an amount above zero.' });
        const body = { ...f, amount, account_id: f.account_id || accounts[0]?.id, category_id: f.category_id || null, end_date: f.end_date || null, interval: Number(f.interval), remind_days: Number(f.remind_days) };
        const r = await submit(() => api<{ posted: number }>('/api/recurring', { body }));
        if (r) {
          refreshAll(); onClose();
          toast({ kind: 'ok', text: f.mode === 'auto' && r.posted ? `Saved. Posted ${r.posted} past occurrence${r.posted === 1 ? '' : 's'}.` : 'Recurring item saved' });
          setF((s) => ({ ...s, title: '', amount: '' }));
        }
      }}>
        <div className="seg" role="group" aria-label="How it works">
          <button type="button" aria-pressed={f.mode === 'bill'} onClick={() => set('mode', 'bill')}>Bill I pay</button>
          <button type="button" aria-pressed={f.mode === 'auto'} onClick={() => set('mode', 'auto')}>Posts itself</button>
        </div>
        <p className="hint">{f.mode === 'bill' ? 'Shows up as due and reminds you. You mark it paid, so the amount can change each time.' : 'Recorded automatically on each date, like salary or a SIP. Past dates since the start are filled in.'}</p>
        <div className={`seg ${f.kind}`} role="group" aria-label="Type">
          <button type="button" aria-pressed={f.kind === 'expense'} onClick={() => { set('kind', 'expense'); set('category_id', 0); }}>Money out</button>
          <button type="button" aria-pressed={f.kind === 'income'} onClick={() => { set('kind', 'income'); set('category_id', 0); }}>Money in</button>
        </div>
        <Field label="Name" error={errors.title}><input className="input" value={f.title} maxLength={60} placeholder={f.kind === 'income' ? 'Salary' : 'Rent, Netflix, phone bill…'} onChange={(e) => set('title', e.target.value)} aria-invalid={!!errors.title} data-autofocus /></Field>
        <div className="row2">
          <Field label="Amount" error={errors.amount}><input className="input" inputMode="decimal" value={f.amount} onChange={(e) => set('amount', e.target.value)} aria-invalid={!!errors.amount} /></Field>
          <Field label="Account" error={errors.account_id}>
            <select className="select" value={f.account_id || accounts[0]?.id} onChange={(e) => set('account_id', Number(e.target.value))}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </Field>
        </div>
        <Field label="Category" error={errors.category_id}>
          <select className="select" value={f.category_id} onChange={(e) => set('category_id', Number(e.target.value))}>
            <option value={0}>None</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <div className="row2">
          <Field label="Repeats" error={errors.freq}>
            <select className="select" value={f.freq} onChange={(e) => set('freq', e.target.value)}>
              <option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="daily">Daily</option>
            </select>
          </Field>
          <Field label="Every" error={errors.interval} hint={describeRule({ freq: f.freq as any, interval: Number(f.interval) || 1 })}>
            <input className="input" type="number" min={1} max={52} value={f.interval} onChange={(e) => set('interval', e.target.value)} />
          </Field>
        </div>
        <div className="row2">
          <Field label={f.mode === 'bill' ? 'First due date' : 'Starts on'} error={errors.start_date}><input className="input" type="date" value={f.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>
          <Field label="Ends (optional)" error={errors.end_date}><input className="input" type="date" value={f.end_date} onChange={(e) => set('end_date', e.target.value)} /></Field>
        </div>
        {f.mode === 'bill' && (
          <Field label="Remind me (days before)" error={errors.remind_days}><input className="input" type="number" min={0} max={30} value={f.remind_days} onChange={(e) => set('remind_days', e.target.value)} /></Field>
        )}
        {formError && <p className="field-err">{formError}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save recurring item'}</button>
      </form>
    </Sheet>
  );
}

export default function PlanView() {
  const { fmt, user } = useApp();
  const toast = useToast();
  const b = useSWR<{ budgets: Budget[] }>('/api/budgets');
  const r = useSWR<{ rules: Rule[]; bills: Bill[] }>('/api/recurring');
  const [budgetSheet, setBudgetSheet] = useState<{ edit: Budget | null } | null>(null);
  const [ruleSheet, setRuleSheet] = useState(false);
  const [busy, setBusy] = useState('');
  const today = todayIn(user.timezone);
  const { y, m, d } = parts(today);
  const pace = d / daysInMonth(y, m);

  if (b.error || r.error) return <ErrorBox error={(b.error || r.error)!} retry={() => { b.mutate(); r.mutate(); }} />;
  if (!b.data || !r.data) return <LoadingBlock />;
  const budgets = b.data.budgets;
  const used = new Set(budgets.map((x) => x.category_id));
  const totalBudget = budgets.reduce((s, x) => s + x.amount, 0);
  const totalSpent = budgets.reduce((s, x) => s + x.spent, 0);
  const committed = r.data.rules.filter((x) => x.active && x.kind === 'expense').reduce((s, x) => s + x.monthly, 0);

  async function act(ruleId: number, action: 'pay' | 'skip', title: string) {
    setBusy(`${ruleId}${action}`);
    try { await api(`/api/recurring/${ruleId}/${action}`, { body: {} }); refreshAll(); toast({ kind: 'ok', text: action === 'pay' ? `${title} marked as paid` : `${title} skipped this time` }); }
    catch (e: any) { toast({ kind: 'error', text: e.message }); } finally { setBusy(''); }
  }

  return (
    <div className="dash">
      <div className="page-head span2"><h1>Plan</h1></div>
      <section className="card card-pad" aria-labelledby="bud-h">
        <div className="section-title"><h2 id="bud-h">Monthly budgets</h2><button className="btn btn-sm" onClick={() => setBudgetSheet({ edit: null })}><Icon name="plus" size={18} />Add</button></div>
        {budgets.length === 0 ? (
          <Empty icon="chart" title="No budgets yet" body="Give a category a monthly limit. Spendly warns you when spending runs ahead of the month." action={<button className="btn btn-primary" onClick={() => setBudgetSheet({ edit: null })}>Create a budget</button>} />
        ) : (
          <>
            <p className="muted" style={{ marginBottom: 12 }}><b className="num" style={{ color: 'var(--ink)' }}>{fmt(totalSpent)}</b> of {fmt(totalBudget)} used, {Math.round(pace * 100)}% of the month gone.</p>
            <div className="cat-rows">
              {budgets.map((x) => (
                <button key={x.id} className="cat-row li-btn" style={{ padding: 6 }} onClick={() => setBudgetSheet({ edit: x })} aria-label={`Edit ${x.name} budget`}>
                  <div className="cat-row-top">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Glyph name={x.glyph} color={x.color} size={28} />{x.name}</span>
                    <span>{fmt(x.spent)} <span className="hint">of {fmt(x.amount)}</span></span>
                  </div>
                  <Progress value={x.spent} max={x.amount} pace={pace} />
                  <span className="hint" style={{ textAlign: 'left' }}>
                    {x.spent > x.amount ? <span className="spend">{fmt(x.spent - x.amount)} over</span> : `${fmt(x.amount - x.spent)} left`}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <div className="stack">
        <section className="card card-pad" aria-labelledby="bill-h">
          <div className="section-title">
            <h2 id="bill-h">Upcoming bills</h2>
            {r.data.rules.some((x) => x.mode === 'bill' && x.active) && <a className="btn btn-sm" href="/api/export/bills.ics" download><Icon name="calendar" size={18} />Add to calendar</a>}
          </div>
          {r.data.bills.length === 0 ? (
            <Empty icon="calendar" title="No bills due in the next 45 days" body="Add rent, phone or subscriptions as bills to get reminders and see them in your daily number." />
          ) : (
            <div className="list">
              {r.data.bills.slice(0, 10).map((x, i) => {
                const first = r.data!.bills.findIndex((y) => y.rule_id === x.rule_id) === i;
                return (
                  <div className="li" key={`${x.rule_id}-${x.index}`}>
                    <Glyph name="calendar" color={x.overdue ? '#FFE1DE' : x.days_until <= 3 ? '#FFF1D1' : '#FFFFFF'} />
                    <span style={{ minWidth: 0 }}>
                      <span className="li-title" style={{ display: 'block' }}>{x.title}</span>
                      <span className="li-sub" style={{ display: 'block' }}>{x.overdue ? <span className="badge overdue">Overdue since {formatDay(x.date)}</span> : `${formatDay(x.date, 'long')}${x.days_until <= 7 ? ` (in ${x.days_until} day${x.days_until === 1 ? '' : 's'})` : ''}`}</span>
                    </span>
                    <span style={{ display: 'grid', justifyItems: 'end', gap: 6 }}>
                      <b className="num">{fmt(x.amount)}</b>
                      {first && (
                        <span style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => act(x.rule_id, 'skip', x.title)}>Skip</button>
                          <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => act(x.rule_id, 'pay', x.title)}>{busy === `${x.rule_id}pay` ? 'Saving…' : 'Paid'}</button>
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="card card-pad" aria-labelledby="rec-h">
          <div className="section-title"><h2 id="rec-h">Recurring</h2><button className="btn btn-sm" onClick={() => setRuleSheet(true)}><Icon name="plus" size={18} />Add</button></div>
          {r.data.rules.length === 0 ? (
            <Empty icon="repeat" title="Nothing recurring yet" body="Add salary so it records itself, and bills so you never miss one." action={<button className="btn btn-primary" onClick={() => setRuleSheet(true)}>Add recurring item</button>} />
          ) : (
            <>
              <p className="muted" style={{ marginBottom: 6 }}>Regular costs come to about <b className="num" style={{ color: 'var(--ink)' }}>{fmt(committed)}</b> a month.</p>
              <div className="list">
                {r.data.rules.map((x) => (
                  <div className="li" key={x.id} style={{ opacity: x.active ? 1 : 0.55 }}>
                    <Glyph name={x.mode === 'auto' ? 'repeat' : x.category_glyph || 'calendar'} color={x.category_color || '#E6E9FF'} />
                    <span style={{ minWidth: 0 }}>
                      <span className="li-title" style={{ display: 'block' }}>{x.title} {x.mode === 'auto' ? <span className="badge">Automatic</span> : <span className="badge">Bill</span>}</span>
                      <span className="li-sub" style={{ display: 'block' }}>{describeRule(x)}, {x.account_name}{x.next_date ? `. Next ${formatDay(x.next_date)}` : x.active ? '' : '. Paused'}</span>
                    </span>
                    <span style={{ display: 'grid', justifyItems: 'end', gap: 6 }}>
                      <b className={`num ${x.kind === 'income' ? 'earn' : ''}`}>{x.kind === 'income' ? '+' : ''}{fmt(x.amount)}</b>
                      <span style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm btn-ghost" onClick={async () => { await api(`/api/recurring/${x.id}`, { method: 'PATCH', body: { active: !x.active } }); refreshAll(); }}>{x.active ? 'Pause' : 'Resume'}</button>
                        <button className="btn btn-sm btn-ghost icon-btn" aria-label={`Delete ${x.title}`} onClick={async () => {
                          if (!confirm(`Delete “${x.title}”? Past transactions it created stay in your history.`)) return;
                          await api(`/api/recurring/${x.id}`, { method: 'DELETE' }); refreshAll(); toast({ kind: 'ok', text: 'Recurring item deleted' });
                        }}><Icon name="trash" size={18} /></button>
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <BudgetSheet open={!!budgetSheet} edit={budgetSheet?.edit ?? null} used={used} onClose={() => setBudgetSheet(null)} />
      <RuleSheet open={ruleSheet} onClose={() => setRuleSheet(false)} />
    </div>
  );
}
