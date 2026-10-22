'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWRInfinite from 'swr/infinite';
import { useApp } from '../AppShell';
import { TxRow } from '../TxSheet';
import { Empty, ErrorBox, Skeleton } from '../ui';
import Icon from '../Icon';
import { formatDay, monthKey, shiftMonth, todayIn } from '@/lib/dates';

export default function ActivityView() {
  const { user, accounts, categories, fmt, openTx } = useApp();
  const thisMonth = monthKey(todayIn(user.timezone));
  const [month, setMonth] = useState<string>(thisMonth);
  const [kind, setKind] = useState('');
  const [category, setCategory] = useState('');
  const [account, setAccount] = useState('');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);

  const base = useMemo(() => {
    const p = new URLSearchParams({ limit: '40' });
    if (month !== 'all') p.set('month', month);
    if (kind) p.set('kind', kind);
    if (category) p.set('category', category);
    if (account) p.set('account', account);
    if (debounced) p.set('q', debounced);
    return `/api/transactions?${p}`;
  }, [month, kind, category, account, debounced]);

  const { data, error, size, setSize, isValidating, mutate } = useSWRInfinite<{ items: any[]; next: string | null }>(
    (i, prev) => (i === 0 ? base : prev?.next ? `${base}&before=${prev.next}` : null));
  const items = data?.flatMap((p) => p.items) ?? [];
  const hasMore = !!data?.at(-1)?.next;
  const filtered = !!(kind || category || account || debounced);

  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const t of items) { if (!m.has(t.occurred_on)) m.set(t.occurred_on, []); m.get(t.occurred_on)!.push(t); }
    return [...m.entries()];
  }, [items]);
  const totals = items.reduce((s, t) => ({ in: s.in + (t.kind === 'income' ? t.amount : 0), out: s.out + (t.kind === 'expense' ? t.amount : 0) }), { in: 0, out: 0 });

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Activity</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="btn btn-sm icon-btn" aria-label="Previous month" disabled={month === 'all'} onClick={() => setMonth(shiftMonth(month, -1))}><span aria-hidden="true">‹</span></button>
          <select className="select" style={{ minHeight: 40, width: 'auto' }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
            {Array.from({ length: 18 }, (_, i) => shiftMonth(thisMonth, -i)).map((k) => (
              <option key={k} value={k}>{new Date(k + '-01T00:00:00Z').toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</option>
            ))}
            <option value="all">All time</option>
          </select>
          <button className="btn btn-sm icon-btn" aria-label="Next month" disabled={month === 'all' || month >= thisMonth} onClick={() => setMonth(shiftMonth(month, 1))}><span aria-hidden="true">›</span></button>
        </div>
      </div>

      <div className="card card-pad" style={{ display: 'grid', gap: 12 }}>
        <label style={{ position: 'relative' }}>
          <span className="sr-only">Search</span>
          <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ink-3)' }}><Icon name="search" size={20} /></span>
          <input className="input" style={{ paddingLeft: 40 }} placeholder="Search shops, notes or categories" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="chips" role="group" aria-label="Type">
          {[['', 'All'], ['expense', 'Spent'], ['income', 'Received'], ['transfer', 'Transfers']].map(([v, l]) => (
            <button key={v} className="chip" aria-pressed={kind === v} onClick={() => setKind(v)}>{l}</button>
          ))}
        </div>
        <div className="row2">
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            <option value="none">Uncategorised</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="select" value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Account">
            <option value="">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      {items.length > 0 && (
        <div className="stat-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="card stat"><small>Received (shown)</small><b className="earn">+{fmt(totals.in)}</b></div>
          <div className="card stat"><small>Spent (shown)</small><b className="spend">−{fmt(totals.out)}</b></div>
        </div>
      )}

      <section className="card card-pad" aria-label="Transactions" aria-busy={isValidating}>
        {error ? <ErrorBox error={error} retry={() => mutate()} />
          : !data ? <div className="stack" style={{ gap: 10 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={56} />)}</div>
          : items.length === 0 ? (
            filtered
              ? <Empty icon="search" title="Nothing matches" body="Try a different search or clear the filters." action={<button className="btn btn-sm" onClick={() => { setKind(''); setCategory(''); setAccount(''); setQ(''); }}>Clear filters</button>} />
              : <Empty icon="list" title="No transactions this month" body="Add what you spend and receive and it’ll show up here, grouped by day." action={<button className="btn btn-primary" onClick={() => openTx(null)}>Add a transaction</button>} />
          ) : (
            <>
              {groups.map(([day, list]) => {
                const net = list.reduce((s: number, t: any) => s + (t.kind === 'income' ? t.amount : t.kind === 'expense' ? -t.amount : 0), 0);
                return (
                  <div key={day}>
                    <div className="day-head"><span>{formatDay(day, 'long')}</span><span className="num">{net === 0 ? '' : fmt(net, { sign: net > 0 })}</span></div>
                    <div className="list">{list.map((t: any) => <TxRow key={t.id} t={t} onOpen={() => openTx(t)} />)}</div>
                  </div>
                );
              })}
              {hasMore && (
                <div style={{ display: 'grid', marginTop: 12 }}>
                  <button className="btn" disabled={isValidating} onClick={() => setSize(size + 1)}>{isValidating ? 'Loading…' : 'Show older'}</button>
                </div>
              )}
            </>
          )}
      </section>
    </div>
  );
}
