'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { useApp, type Account, type Category } from '../AppShell';
import { Field, Sheet, api, refreshAll, useForm, useToast, Skeleton } from '../ui';
import Icon, { Glyph } from '../Icon';
import { parseAmount, minorFactor, CURRENCIES } from '@/lib/money';
import { ACCOUNT_KINDS, GLYPHS, PALETTE } from '@/lib/schemas';

const KIND_LABEL: Record<string, string> = { cash: 'Cash', bank: 'Bank account', card: 'Credit card', wallet: 'UPI / wallet', savings: 'Savings' };
const KIND_GLYPH: Record<string, string> = { cash: 'coins', bank: 'home', card: 'wallet', wallet: 'phone', savings: 'piggy' };

function AccountSheet({ open, edit, onClose }: { open: boolean; edit: Account | null; onClose: () => void }) {
  const { user } = useApp();
  const toast = useToast();
  const { errors, busy, submit, formError, setErrors } = useForm();
  const [f, setF] = useState<{ name: string; kind: string; color: string; opening: string }>({ name: '', kind: 'bank', color: PALETTE[3], opening: '' });
  const [lastEdit, setLastEdit] = useState<number | null | undefined>(undefined);
  if (open && lastEdit !== (edit?.id ?? null)) {
    setLastEdit(edit?.id ?? null);
    setF(edit ? { name: edit.name, kind: edit.kind, color: edit.color, opening: String(edit.opening_balance / minorFactor(user.currency)) } : { name: '', kind: 'bank', color: PALETTE[3], opening: '' });
  }
  const close = () => { setLastEdit(undefined); onClose(); };
  return (
    <Sheet open={open} onClose={close} title={edit ? 'Edit account' : 'New account'}>
      <form className="form" noValidate onSubmit={async (e) => {
        e.preventDefault();
        const neg = f.opening.trim().startsWith('-');
        const ob = f.opening.trim() === '' ? 0 : parseAmount(f.opening.replace('-', ''), user.currency);
        if (ob === null) return setErrors({ opening_balance: 'Enter a number, like 25000 or -1200 for a card balance owed.' });
        const body = { name: f.name, kind: f.kind, color: f.color, opening_balance: neg ? -ob : ob };
        const r = await submit(() => edit ? api(`/api/accounts/${edit.id}`, { method: 'PATCH', body }) : api('/api/accounts', { body }));
        if (r) { refreshAll(); toast({ kind: 'ok', text: edit ? 'Account updated' : `${f.name} added` }); close(); }
      }}>
        <Field label="Name" error={errors.name}><input className="input" value={f.name} maxLength={40} placeholder="HDFC savings, Paytm, Amex" onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={!!errors.name} data-autofocus /></Field>
        <Field label="Type" error={errors.kind}>
          <select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{ACCOUNT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
        </Field>
        <Field label="Balance before your first Spendly entry" error={errors.opening_balance} hint="Use a minus sign for money owed, like a credit card.">
          <input className="input" inputMode="decimal" value={f.opening} placeholder="0" onChange={(e) => setF({ ...f, opening: e.target.value })} aria-invalid={!!errors.opening_balance} />
        </Field>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 650, fontSize: '.9rem', marginBottom: 8 }}>Colour</legend>
          <div className="chips">{PALETTE.map((c) => <button type="button" key={c} className="chip" aria-pressed={f.color === c} aria-label={`Colour ${c}`} style={{ width: 36, padding: 0, justifyContent: 'center', background: c }} onClick={() => setF({ ...f, color: c })}>{f.color === c && <Icon name="check" size={16} />}</button>)}</div>
        </fieldset>
        {formError && <p className="field-err">{formError}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          {edit && (
            <button type="button" className="btn" disabled={busy} onClick={async () => {
              if (edit.tx_count > 0) {
                const r = await submit(() => api(`/api/accounts/${edit.id}`, { method: 'PATCH', body: { archived: true } }));
                if (r) { refreshAll(); toast({ kind: 'ok', text: `${edit.name} archived. Its history stays in your reports.` }); close(); }
              } else {
                const r = await submit(() => api(`/api/accounts/${edit.id}`, { method: 'DELETE' }));
                if (r) { refreshAll(); toast({ kind: 'ok', text: `${edit.name} deleted` }); close(); }
              }
            }}>{edit.tx_count > 0 ? 'Archive' : 'Delete'}</button>
          )}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : edit ? 'Save changes' : 'Add account'}</button>
        </div>
      </form>
    </Sheet>
  );
}

function CategorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { errors, busy, submit, formError } = useForm();
  const [f, setF] = useState({ name: '', kind: 'expense', glyph: 'star', color: PALETTE[4] as string });
  return (
    <Sheet open={open} onClose={onClose} title="New category">
      <form className="form" noValidate onSubmit={async (e) => {
        e.preventDefault();
        const r = await submit(() => api('/api/categories', { body: f }));
        if (r) { refreshAll(); toast({ kind: 'ok', text: `${f.name} added` }); setF({ ...f, name: '' }); onClose(); }
      }}>
        <div className="seg" role="group" aria-label="Type">
          <button type="button" aria-pressed={f.kind === 'expense'} onClick={() => setF({ ...f, kind: 'expense' })}>Spending</button>
          <button type="button" aria-pressed={f.kind === 'income'} onClick={() => setF({ ...f, kind: 'income' })}>Income</button>
        </div>
        <Field label="Name" error={errors.name}><input className="input" value={f.name} maxLength={32} onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={!!errors.name} data-autofocus /></Field>
        <div className="chips">{GLYPHS.map((g) => <button type="button" key={g} className="chip" aria-pressed={f.glyph === g} aria-label={g} style={{ width: 40, padding: 0, justifyContent: 'center' }} onClick={() => setF({ ...f, glyph: g })}><Icon name={g} size={18} /></button>)}</div>
        <div className="chips">{PALETTE.map((c) => <button type="button" key={c} className="chip" aria-pressed={f.color === c} aria-label={`Colour ${c}`} style={{ width: 36, padding: 0, justifyContent: 'center', background: c }} onClick={() => setF({ ...f, color: c })}>{f.color === c && <Icon name="check" size={16} />}</button>)}</div>
        {formError && <p className="field-err">{formError}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Add category'}</button>
      </form>
    </Sheet>
  );
}

export default function MoreView() {
  const { user, fmt } = useApp();
  const router = useRouter();
  const toast = useToast();
  const acc = useSWR<{ accounts: Account[] }>('/api/accounts');
  const cat = useSWR<{ categories: Category[] }>('/api/categories');
  const [accSheet, setAccSheet] = useState<{ edit: Account | null } | null>(null);
  const [catSheet, setCatSheet] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  return (
    <div className="dash">
      <div className="page-head span2"><h1>More</h1></div>

      <section className="card card-pad" aria-labelledby="acc-h">
        <div className="section-title"><h2 id="acc-h">Accounts</h2><button className="btn btn-sm" onClick={() => setAccSheet({ edit: null })}><Icon name="plus" size={18} />Add</button></div>
        {!acc.data ? <Skeleton h={160} /> : (
          <div className="list">
            {acc.data.accounts.map((a) => (
              <button className="li li-btn" key={a.id} onClick={() => setAccSheet({ edit: a })} style={{ opacity: a.archived ? .55 : 1 }}>
                <Glyph name={KIND_GLYPH[a.kind]} color={a.color} />
                <span style={{ minWidth: 0 }}>
                  <span className="li-title" style={{ display: 'block' }}>{a.name}{a.archived && ' (archived)'}</span>
                  <span className="li-sub" style={{ display: 'block' }}>{KIND_LABEL[a.kind]}, {a.tx_count} transaction{a.tx_count === 1 ? '' : 's'}</span>
                </span>
                <span className={`li-amt ${a.balance < 0 ? 'spend' : ''}`}>{fmt(a.balance)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="stack">
        <section className="card card-pad" aria-labelledby="set-h">
          <h2 id="set-h" style={{ marginBottom: 12 }}>Preferences</h2>
          <div className="row2">
            <Field label="Currency" hint="Changes how amounts display; it doesn’t convert them.">
              <select className="select" value={user.currency} onChange={async (e) => { await api('/api/me', { method: 'PATCH', body: { currency: e.target.value } }); refreshAll(); toast({ kind: 'ok', text: `Showing amounts in ${e.target.value}` }); }}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Time zone" hint="Decides when your day starts.">
              <select className="select" value={user.timezone} onChange={async (e) => { await api('/api/me', { method: 'PATCH', body: { timezone: e.target.value } }); refreshAll(); }}>
                {['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'].map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
          </div>
        </section>

        <section className="card card-pad" aria-labelledby="cat-h">
          <div className="section-title"><h2 id="cat-h">Categories</h2><button className="btn btn-sm" onClick={() => setCatSheet(true)}><Icon name="plus" size={18} />Add</button></div>
          {!cat.data ? <Skeleton h={120} /> : (
            <div className="chips">
              {cat.data.categories.map((c) => (
                <span key={c.id} className="chip" style={{ cursor: 'default' }}>
                  <span className="dot" style={{ background: c.color }} />{c.name}
                  <button aria-label={`Delete ${c.name}`} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', display: 'grid' }} onClick={async () => {
                    if (!confirm(`Delete “${c.name}”? ${c.tx_count ? `${c.tx_count} transaction(s) become uncategorised.` : ''}`)) return;
                    await api(`/api/categories/${c.id}`, { method: 'DELETE' }); refreshAll();
                  }}><Icon name="x" size={14} /></button>
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="card card-pad" aria-labelledby="exp-h">
          <h2 id="exp-h" style={{ marginBottom: 6 }}>Your data</h2>
          <p className="muted" style={{ marginBottom: 12 }}>Download everything any time. Spendly never connects to your bank.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a className="btn btn-sm" href="/api/export/csv" download><Icon name="download" size={18} />Transactions (CSV)</a>
            <a className="btn btn-sm" href="/api/export/json" download><Icon name="download" size={18} />Full backup (JSON)</a>
            <a className="btn btn-sm" href="/api/export/bills.ics" download><Icon name="calendar" size={18} />Bills (calendar)</a>
          </div>
        </section>

        <section className="card card-pad" aria-labelledby="acct-h">
          <h2 id="acct-h" style={{ marginBottom: 6 }}>{user.is_demo ? 'Demo workspace' : 'Account'}</h2>
          <p className="muted" style={{ marginBottom: 12 }}>{user.is_demo ? 'This sandbox and its sample data are deleted after 24 hours.' : `Signed in as ${user.email}.`}</p>
          <button className="btn" onClick={async () => { await api('/api/auth/logout', { method: 'POST' }); router.push('/'); router.refresh(); }}><Icon name="logout" size={18} />{user.is_demo ? 'Leave demo' : 'Sign out'}</button>
          {!user.is_demo && (
            <details style={{ marginTop: 16 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 650, color: '#9F1F18' }}>Delete my account</summary>
              <div className="form" style={{ marginTop: 10 }}>
                <p className="muted">This permanently removes your accounts, transactions, budgets, bills and goals. Download a backup first if you want one.</p>
                <Field label="Type DELETE to confirm"><input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /></Field>
                <button className="btn btn-danger" disabled={confirmText !== 'DELETE'} onClick={async () => {
                  await api('/api/me', { method: 'DELETE', body: { confirm: confirmText } }); router.push('/'); router.refresh();
                }}>Delete everything</button>
              </div>
            </details>
          )}
        </section>
      </div>

      <AccountSheet open={!!accSheet} edit={accSheet?.edit ?? null} onClose={() => setAccSheet(null)} />
      <CategorySheet open={catSheet} onClose={() => setCatSheet(false)} />
    </div>
  );
}
