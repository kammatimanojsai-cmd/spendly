'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { useEffect, useState } from 'react';
import { animate, motion, useReducedMotion } from 'motion/react';
import { useApp } from '../AppShell';
import { ErrorBox, LoadingBlock, Progress, api, refreshAll, useToast, Empty } from '../ui';
import { Donut, CashflowBars, Ring } from '../charts';
import { Glyph } from '../Icon';
import { formatDay } from '@/lib/dates';
import type { Dashboard } from '@/lib/server/dashboard';

function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce) { setShown(value); return; }
    const c = animate(0, value, { duration: 0.9, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => setShown(Math.round(v)) });
    return () => c.stop();
  }, [value, reduce]);
  return <>{format(shown)}</>;
}

function Ticket({ d }: { d: Dashboard }) {
  const { fmt, openTx } = useApp();
  const s = d.safeToSpend;
  if (s.basis === 'none') {
    return (
      <div className="ticket empty">
        <div className="ticket-top">
          <div className="ticket-label"><span>Safe to spend today</span></div>
          <p style={{ margin: '10px 0 14px', fontWeight: 550 }}>Add this month’s income or set a budget, and Spendly will work out a daily number for you.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-ink" onClick={() => openTx({ kind: 'income' })}>Add income</button>
            <Link href="/app/plan" className="btn btn-sm">Set a budget</Link>
          </div>
        </div>
      </div>
    );
  }
  return (
    // The one orchestrated motion moment: the ticket prints in from the top, then the number counts up.
    <motion.section className="ticket" aria-labelledby="sts" initial={{ clipPath: 'inset(0 0 100% 0)', y: -8 }} animate={{ clipPath: 'inset(0 0 0% 0)', y: 0 }}
      transition={{ duration: 0.65, ease: [0.2, 0.8, 0.2, 1] }}>
      <div className="ticket-top">
        <div className="ticket-label"><span id="sts">Safe to spend today</span><span>{formatDay(d.today, 'long')}</span></div>
        <div className="ticket-amount num" aria-live="polite"><CountUp value={s.perDay} format={(n) => fmt(n)} /></div>
        <div className="ticket-sub">
          {s.pool < 0 ? `You’re ${fmt(-s.pool)} over for this month.` : `per day for the next ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'}, based on your ${s.basis === 'budget' ? 'budgets' : 'income'}`}
        </div>
      </div>
      <div className="ticket-perf" />
      <div className="ticket-math num">
        {s.breakdown.map((b) => <div key={b.label}><span>{b.label}</span><span>{b.amount < 0 ? '−' + fmt(-b.amount) : fmt(b.amount)}</span></div>)}
        <div className="eq"><span>Left for {s.daysLeft} day{s.daysLeft === 1 ? '' : 's'}</span><span>{fmt(s.pool)}</span></div>
      </div>
    </motion.section>
  );
}

function Bills({ d }: { d: Dashboard }) {
  const { fmt } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  const soon = d.bills.filter((b) => b.days_until <= Math.max(7, b.remind_days)).slice(0, 4);
  if (!soon.length) return null;
  return (
    <section className="card card-pad" aria-labelledby="bills-h">
      <div className="section-title"><h2 id="bills-h">Bills due soon</h2><Link href="/app/plan">All bills</Link></div>
      <div className="list">
        {soon.map((b) => (
          <div className="li" key={`${b.rule_id}-${b.index}`}>
            <Glyph name="calendar" color={b.overdue ? '#FFE1DE' : '#FFF1D1'} />
            <span style={{ minWidth: 0 }}>
              <span className="li-title" style={{ display: 'block' }}>{b.title}</span>
              <span className="li-sub" style={{ display: 'block' }}>
                {b.overdue ? <span className="badge overdue">Overdue</span> : b.days_until === 0 ? <span className="badge due">Due today</span> : `Due ${formatDay(b.date)} (in ${b.days_until} day${b.days_until === 1 ? '' : 's'})`}
              </span>
            </span>
            <span style={{ display: 'grid', justifyItems: 'end', gap: 6 }}>
              <b className="num">{fmt(b.amount)}</b>
              <button className="btn btn-sm btn-primary" disabled={busy === b.rule_id} onClick={async () => {
                setBusy(b.rule_id);
                try { await api(`/api/recurring/${b.rule_id}/pay`, { body: {} }); refreshAll(); toast({ kind: 'ok', text: `${b.title} marked as paid` }); }
                catch (e: any) { toast({ kind: 'error', text: e.message }); } finally { setBusy(null); }
              }}>{busy === b.rule_id ? 'Saving…' : 'Mark paid'}</button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Setup() {
  const { openTx } = useApp();
  const steps: [string, string, React.ReactNode][] = [
    ['wallet', 'Set your account balances', <Link key="a" className="btn btn-sm" href="/app/more">Open accounts</Link>],
    ['plus', 'Add something you spent today', <button key="b" className="btn btn-sm btn-primary" onClick={() => openTx(null)}>Add expense</button>],
    ['repeat', 'Add salary and regular bills', <Link key="c" className="btn btn-sm" href="/app/plan">Plan</Link>],
  ];
  return (
    <section className="card card-pad span2" aria-labelledby="setup-h">
      <h2 id="setup-h" style={{ marginBottom: 6 }}>Three things to get going</h2>
      <p className="muted" style={{ marginBottom: 12 }}>Once there’s a little data, this page fills with your daily number, charts and insights.</p>
      <ol className="list" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {steps.map(([icon, text, action], i) => (
          <li className="li" key={text}>
            <span className="glyph" style={{ background: 'var(--mango)' }} aria-hidden="true"><b className="display">{i + 1}</b></span>
            <span className="li-title">{text}</span>
            {action}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function HomeView() {
  const { fmt } = useApp();
  const { data: d, error, mutate } = useSWR<Dashboard>('/api/dashboard');
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (!d) return <LoadingBlock label="Loading your dashboard" />;

  const spendCats = d.categories.filter((c) => c.spent > 0);
  const totalSpent = spendCats.reduce((s, c) => s + c.spent, 0);
  const progress = d.month.day / d.month.daysInMonth;

  return (
    <div className="dash">
      {d.isEmpty && <Setup />}
      <div className="stack">
        <Ticket d={d} />
        <div className="stat-row">
          <div className="card stat"><small>In this month</small><b className="earn">+{fmt(d.month.income)}</b></div>
          <div className="card stat"><small>Out this month</small><b className="spend">−{fmt(d.month.expense)}</b></div>
          <div className="card stat"><small>Net</small><b className={d.month.net < 0 ? 'spend' : ''}>{fmt(d.month.net, { sign: d.month.net > 0 })}</b></div>
        </div>
        {d.insights.length > 0 && (
          <section aria-labelledby="ins-h" className="stack" style={{ gap: 10 }}>
            <h2 id="ins-h">What’s worth knowing</h2>
            {d.insights.map((i) => (
              <div key={i.key} className={`insight ${i.tone}`}><div><b>{i.title}</b><p>{i.body}</p></div></div>
            ))}
          </section>
        )}
        <Bills d={d} />
      </div>

      <div className="stack">
        <section className="card card-pad" aria-labelledby="cat-h">
          <div className="section-title"><h2 id="cat-h">Where it went</h2><Link href="/app/activity">See all</Link></div>
          {spendCats.length === 0 ? (
            <Empty icon="chart" title="No spending yet this month" body="Your categories and budgets will show up here as you add expenses." />
          ) : (
            <div className="donut-wrap">
              <Donut label="Spending by category this month" valueLabel={fmt(totalSpent, { compact: true })}
                slices={spendCats.slice(0, 7).map((c) => ({ key: c.id, value: c.spent, color: c.color, name: c.name }))} />
              <div className="cat-rows">
                {d.categories.slice(0, 6).map((c) => (
                  <div className="cat-row" key={c.id}>
                    <div className="cat-row-top">
                      <span><span className="dot" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: c.color, border: '1.5px solid var(--ink)', marginRight: 6 }} />{c.name}</span>
                      <span>{fmt(c.spent)}{c.budget ? <span className="hint"> of {fmt(c.budget)}</span> : null}</span>
                    </div>
                    {c.budget ? <Progress value={c.spent} max={c.budget} pace={progress} /> : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="card card-pad" aria-labelledby="flow-h">
          <div className="section-title"><h2 id="flow-h">Six months of cash flow</h2></div>
          <CashflowBars data={d.cashflow} fmt={(n) => fmt(n, { compact: true })} />
        </section>

        <section className="card card-pad" aria-labelledby="acc-h">
          <div className="section-title"><h2 id="acc-h">Accounts</h2><Link href="/app/more">Manage</Link></div>
          <p className="muted" style={{ marginBottom: 6 }}>Total across accounts</p>
          <p className="display num" style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: 8 }}>{fmt(d.netWorth)}</p>
          <div className="list">
            {d.accounts.map((a) => (
              <div className="li" key={a.id} style={{ gridTemplateColumns: '44px 1fr auto' }}>
                <Glyph name={a.kind === 'cash' ? 'coins' : a.kind === 'card' ? 'wallet' : a.kind === 'savings' ? 'piggy' : a.kind === 'wallet' ? 'phone' : 'home'} color={a.color} />
                <span className="li-title">{a.name}</span>
                <span className={`li-amt ${a.balance < 0 ? 'spend' : ''}`}>{fmt(a.balance)}</span>
              </div>
            ))}
          </div>
        </section>

        {d.goals.length > 0 && (
          <section className="card card-pad" aria-labelledby="goal-h">
            <div className="section-title"><h2 id="goal-h">Goals</h2><Link href="/app/goals">Open</Link></div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {d.goals.slice(0, 3).map((g) => (
                <div key={g.id} style={{ display: 'grid', justifyItems: 'center', gap: 6, width: 96 }}>
                  <Ring value={g.saved} max={g.target} color={g.color} size={84}><b className="num">{Math.round((g.saved / g.target) * 100)}%</b></Ring>
                  <span style={{ fontWeight: 650, fontSize: '.85rem', textAlign: 'center' }}>{g.name}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
