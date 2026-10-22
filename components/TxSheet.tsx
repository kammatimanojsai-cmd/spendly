'use client';

import { useEffect, useRef, useState } from 'react';
import { Sheet, Field, useForm, api, refreshAll, useToast } from './ui';
import Icon, { Glyph } from './Icon';
import { useApp } from './AppShell';
import { parseAmount, minorFactor } from '@/lib/money';
import { parseReceipt, type ReceiptGuess } from '@/lib/receipt';
import { todayIn } from '@/lib/dates';

export type TxRecord = {
  id: number; kind: 'expense' | 'income' | 'transfer'; amount: number; account_id: number; to_account_id: number | null;
  category_id: number | null; occurred_on: string; merchant: string | null; note: string | null; source?: string;
};

type Scan = { state: 'idle' } | { state: 'reading'; progress: number; preview: string } | { state: 'done'; preview: string; guess: ReceiptGuess } | { state: 'error'; message: string };

export default function TxSheet({ open, initial, onClose }: { open: boolean; initial: Partial<TxRecord> | null; onClose: () => void }) {
  const { accounts, categories, user, fmt } = useApp();
  const toast = useToast();
  const editing = !!initial?.id;
  const today = todayIn(user.timezone);
  const [kind, setKind] = useState<TxRecord['kind']>('expense');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [toAccountId, setToAccountId] = useState<number | ''>('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [source, setSource] = useState<'manual' | 'receipt'>('manual');
  const [scan, setScan] = useState<Scan>({ state: 'idle' });
  const fileRef = useRef<HTMLInputElement>(null);
  const { errors, busy, formError, submit, setErrors } = useForm();

  useEffect(() => {
    if (!open) return;
    const t = initial || {};
    setKind((t.kind as TxRecord['kind']) || 'expense');
    setAmount(t.amount ? String(t.amount / minorFactor(user.currency)) : '');
    setAccountId(t.account_id ?? accounts[0]?.id ?? '');
    setToAccountId(t.to_account_id ?? '');
    setCategoryId(t.category_id ?? null);
    setDate(t.occurred_on || today);
    setMerchant(t.merchant || '');
    setNote(t.note || '');
    setSource('manual');
    setScan({ state: 'idle' });
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const cats = categories.filter((c) => c.kind === kind);
  useEffect(() => { if (categoryId && !cats.some((c) => c.id === categoryId)) setCategoryId(null); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onFile(file: File) {
    if (!file.type.startsWith('image/')) { setScan({ state: 'error', message: 'Choose a photo or screenshot of a receipt (JPG or PNG).' }); return; }
    if (file.size > 12 * 1024 * 1024) { setScan({ state: 'error', message: 'That image is over 12 MB. Try a smaller photo.' }); return; }
    const preview = URL.createObjectURL(file);
    setScan({ state: 'reading', progress: 0, preview });
    try {
      const { createWorker } = await import('tesseract.js');
      // engine + language data are self-hosted under /tesseract (see scripts/copy-ocr-assets.mjs)
      const worker = await createWorker('eng', 1, {
        workerPath: '/tesseract/worker.min.js',
        corePath: '/tesseract',
        langPath: '/tesseract/lang',
        logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') setScan({ state: 'reading', progress: m.progress, preview }); },
      });
      const { data } = await worker.recognize(file);
      await worker.terminate();
      const guess = parseReceipt(data.text);
      setScan({ state: 'done', preview, guess });
      setKind('expense');
      setSource('receipt');
      if (guess.total) setAmount(String(guess.total));
      if (guess.date) setDate(guess.date > today ? today : guess.date);
      if (guess.merchant) setMerchant(guess.merchant);
      if (guess.categoryHint) {
        const c = categories.find((x) => x.kind === 'expense' && x.name === guess.categoryHint);
        if (c) setCategoryId(c.id);
      }
    } catch {
      setScan({ state: 'error', message: 'Couldn’t read that receipt. Try a sharper, well-lit photo, or enter it by hand.' });
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const minor = parseAmount(amount, user.currency);
    if (!minor) { setErrors({ amount: 'Enter an amount above zero, like 249 or 249.50.' }); return; }
    const payload = {
      kind, amount: minor, account_id: Number(accountId), occurred_on: date,
      to_account_id: kind === 'transfer' ? Number(toAccountId) || null : null,
      category_id: kind === 'transfer' ? null : categoryId,
      merchant: kind === 'transfer' ? null : merchant || null, note: note || null, source,
    };
    const r = await submit(() => editing
      ? api(`/api/transactions/${initial!.id}`, { method: 'PATCH', body: payload })
      : api('/api/transactions', { body: payload }));
    if (r) {
      refreshAll();
      toast({ kind: 'ok', text: editing ? 'Transaction updated' : `${kind === 'income' ? 'Income' : kind === 'transfer' ? 'Transfer' : 'Expense'} of ${fmt(minor)} added` });
      onClose();
    }
  }

  async function remove() {
    const snapshot = initial as TxRecord;
    const r = await submit(() => api(`/api/transactions/${snapshot.id}`, { method: 'DELETE' }));
    if (!r) return;
    refreshAll();
    onClose();
    toast({ kind: 'ok', text: 'Transaction deleted', action: { label: 'Undo', run: async () => {
      await api('/api/transactions', { body: { kind: snapshot.kind, amount: snapshot.amount, account_id: snapshot.account_id, to_account_id: snapshot.to_account_id,
        category_id: snapshot.category_id, occurred_on: snapshot.occurred_on, merchant: snapshot.merchant, note: snapshot.note, source: 'manual' } });
      refreshAll();
    } } });
  }

  const symbol = new Intl.NumberFormat('en', { style: 'currency', currency: user.currency }).formatToParts(0).find((p) => p.type === 'currency')?.value;

  return (
    <Sheet open={open} onClose={onClose} title={editing ? 'Edit transaction' : 'New transaction'}>
      {!accounts.length ? (
        <p className="muted">Add an account first in More → Accounts.</p>
      ) : (
        <form className="form" onSubmit={save} noValidate>
          <div className={`seg ${kind}`} role="group" aria-label="Type">
            {(['expense', 'income', 'transfer'] as const).map((k) => (
              <button type="button" key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'expense' ? 'Expense' : k === 'income' ? 'Income' : 'Transfer'}</button>
            ))}
          </div>

          {!editing && kind === 'expense' && (
            <div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              {scan.state === 'idle' && (
                <button type="button" className="scan-drop" style={{ width: '100%' }} onClick={() => fileRef.current?.click()}>
                  <Icon name="camera" size={26} />
                  <b>Scan a receipt</b>
                  <span className="hint">Read on your device. The photo is never uploaded.</span>
                </button>
              )}
              {scan.state === 'reading' && (
                <div className="scan-preview card card-pad flat">
                  <img src={scan.preview} alt="Receipt being read" />
                  <div style={{ display: 'grid', gap: 8 }}>
                    <b>Reading receipt…</b>
                    <div className="progress-line"><i style={{ width: `${Math.round(scan.progress * 100)}%` }} /></div>
                    <span className="hint">{scan.progress === 0 ? 'Loading the text reader (first time only)' : `${Math.round(scan.progress * 100)}%`}</span>
                  </div>
                </div>
              )}
              {scan.state === 'done' && (
                <div className="scan-preview card card-pad flat">
                  <img src={scan.preview} alt="Scanned receipt" />
                  <div style={{ display: 'grid', gap: 8 }}>
                    <b>{scan.guess.total ? `Found ${fmt(Math.round(scan.guess.total * minorFactor(user.currency)))}` : 'No total found'}</b>
                    <span className="hint">
                      {scan.guess.confidence === 'high' ? 'Read from the total line.' : scan.guess.confidence === 'medium' ? 'Best guess. Check the amount.' : 'Low confidence. Enter the details by hand.'}
                    </span>
                    {scan.guess.amounts.length > 1 && (
                      <div className="chips" aria-label="Other amounts on the receipt">
                        {scan.guess.amounts.slice(0, 4).map((a) => (
                          <button type="button" className="chip" key={a} aria-pressed={String(a) === amount} onClick={() => setAmount(String(a))}>{a}</button>
                        ))}
                      </div>
                    )}
                    <button type="button" className="link" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => fileRef.current?.click()}>Scan another</button>
                  </div>
                </div>
              )}
              {scan.state === 'error' && (
                <div className="error-box"><span>{scan.message}</span><button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>Try another</button></div>
              )}
            </div>
          )}

          <div>
            <label className="sr-only" htmlFor="amt">Amount</label>
            <div className="amount-input">
              <span>{symbol}</span>
              <input id="amt" inputMode="decimal" placeholder="0" value={amount} data-autofocus autoComplete="off"
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} aria-invalid={!!errors.amount} />
            </div>
            {errors.amount && <small className="field-err" role="alert">{errors.amount}</small>}
          </div>

          {kind !== 'transfer' && (
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ fontWeight: 650, fontSize: '.9rem', marginBottom: 8 }}>Category</legend>
              <div className="chips">
                {cats.map((c) => (
                  <button type="button" key={c.id} className="chip" aria-pressed={categoryId === c.id} onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}>
                    <span className="dot" style={{ background: c.color }} />{c.name}
                  </button>
                ))}
              </div>
              {errors.category_id && <small className="field-err">{errors.category_id}</small>}
            </fieldset>
          )}

          <div className="row2">
            <Field label={kind === 'transfer' ? 'From' : 'Account'} error={errors.account_id}>
              <select className="select" value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            {kind === 'transfer' ? (
              <Field label="To" error={errors.to_account_id}>
                <select className="select" value={toAccountId} onChange={(e) => setToAccountId(Number(e.target.value))} aria-invalid={!!errors.to_account_id}>
                  <option value="">Choose…</option>
                  {accounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
            ) : (
              <Field label="Date" error={errors.occurred_on}>
                <input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
              </Field>
            )}
          </div>
          {kind === 'transfer' && (
            <Field label="Date" error={errors.occurred_on}><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          )}
          {kind !== 'transfer' && (
            <Field label={kind === 'income' ? 'From (optional)' : 'Where (optional)'} error={errors.merchant}>
              <input className="input" value={merchant} maxLength={80} placeholder={kind === 'income' ? 'Employer, client…' : 'Swiggy, DMart, Uber…'} onChange={(e) => setMerchant(e.target.value)} />
            </Field>
          )}
          <Field label="Note (optional)" error={errors.note}>
            <input className="input" value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} />
          </Field>

          {formError && <p className="field-err" role="alert">{formError}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            {editing && <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}><Icon name="trash" size={18} />Delete</button>}
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add transaction'}</button>
          </div>
          {initial?.source === 'recurring' || initial?.source === 'bill' ? <p className="hint">Created by a recurring item. Editing changes only this entry.</p> : null}
        </form>
      )}
    </Sheet>
  );
}

export function TxRow({ t, onOpen }: { t: any; onOpen: () => void }) {
  const { fmt } = useApp();
  const sign = t.kind === 'expense' ? '−' : t.kind === 'income' ? '+' : '';
  const title = t.kind === 'transfer' ? `${t.account_name} → ${t.to_account_name}` : t.merchant || t.category_name || (t.kind === 'income' ? 'Income' : 'Expense');
  return (
    <button className="li li-btn" onClick={onOpen}>
      {t.kind === 'transfer' ? <Glyph name="swap" color="#E6E9FF" /> : <Glyph name={t.category_glyph || 'dots'} color={t.category_color || '#E6E9FF'} />}
      <span style={{ minWidth: 0 }}>
        <span className="li-title" style={{ display: 'block' }}>{title}</span>
        <span className="li-sub" style={{ display: 'block' }}>
          {t.kind === 'transfer' ? t.note || 'Transfer' : [t.category_name || 'Uncategorised', t.account_name].join(', ')}
          {t.source === 'receipt' && ' (scanned)'}{(t.source === 'recurring' || t.source === 'bill') && ' (recurring)'}
        </span>
      </span>
      <span className={`li-amt ${t.kind === 'expense' ? 'spend' : t.kind === 'income' ? 'earn' : ''}`}>
        {sign}{fmt(t.amount)}
      </span>
    </button>
  );
}
