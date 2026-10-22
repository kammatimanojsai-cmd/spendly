'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useApp } from '../AppShell';
import { Empty, ErrorBox, Field, LoadingBlock, Sheet, api, refreshAll, useForm, useToast } from '../ui';
import { Ring } from '../charts';
import Icon from '../Icon';
import { parseAmount } from '@/lib/money';
import { formatDay, todayIn } from '@/lib/dates';
import { GLYPHS, PALETTE } from '@/lib/schemas';

type Goal = { id: number; name: string; target: number; saved: number; deadline: string | null; color: string; glyph: string; monthlyNeed: number; daysLeft: number | null; moves: { id: number; amount: number; note: string | null; made_on: string }[] };

function GoalSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useApp();
  const toast = useToast();
  const { errors, busy, submit, formError, setErrors } = useForm();
  const [f, setF] = useState({ name: '', target: '', deadline: '', color: PALETTE[6] as string, glyph: 'plane' });
  return (
    <Sheet open={open} onClose={onClose} title="New savings goal">
      <form className="form" noValidate onSubmit={async (e) => {
        e.preventDefault();
        const target = parseAmount(f.target, user.currency);
        if (!target) return setErrors({ target: 'Enter how much you want to save.' });
        const r = await submit(() => api('/api/goals', { body: { ...f, target, deadline: f.deadline || null } }));
        if (r) { refreshAll(); toast({ kind: 'ok', text: `Goal “${f.name}” created` }); onClose(); setF((s) => ({ ...s, name: '', target: '', deadline: '' })); }
      }}>
        <Field label="What for" error={errors.name}><input className="input" value={f.name} maxLength={40} placeholder="Goa trip, new laptop, emergency fund" onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={!!errors.name} data-autofocus /></Field>
        <div className="row2">
          <Field label="Target" error={errors.target}><input className="input" inputMode="decimal" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} aria-invalid={!!errors.target} /></Field>
          <Field label="By (optional)" error={errors.deadline}><input className="input" type="date" min={todayIn(user.timezone)} value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></Field>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 650, fontSize: '.9rem', marginBottom: 8 }}>Colour</legend>
          <div className="chips">{PALETTE.map((c) => <button type="button" key={c} className="chip" aria-pressed={f.color === c} aria-label={`Colour ${c}`} style={{ width: 36, padding: 0, justifyContent: 'center', background: c }} onClick={() => setF({ ...f, color: c })}>{f.color === c && <Icon name="check" size={16} />}</button>)}</div>
        </fieldset>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 650, fontSize: '.9rem', marginBottom: 8 }}>Icon</legend>
          <div className="chips">{GLYPHS.filter((g) => ['plane', 'home', 'briefcase', 'shield', 'gift', 'heart', 'book', 'car', 'star', 'piggy'].includes(g)).map((g) => (
            <button type="button" key={g} className="chip" aria-pressed={f.glyph === g} aria-label={g} style={{ width: 40, padding: 0, justifyContent: 'center' }} onClick={() => setF({ ...f, glyph: g })}><Icon name={g} size={18} /></button>
          ))}</div>
        </fieldset>
        {formError && <p className="field-err">{formError}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Create goal'}</button>
      </form>
    </Sheet>
  );
}

function MoveSheet({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const { user, fmt } = useApp();
  const toast = useToast();
  const { errors, busy, submit, formError, setErrors } = useForm();
  const [dir, setDir] = useState<'in' | 'out'>('in');
  const [amt, setAmt] = useState('');
  return (
    <Sheet open={!!goal} onClose={onClose} title={goal ? goal.name : ''}>
      {goal && (
        <form className="form" noValidate onSubmit={async (e) => {
          e.preventDefault();
          const v = parseAmount(amt, user.currency);
          if (!v) return setErrors({ amount: 'Enter an amount above zero.' });
          const r = await submit(() => api(`/api/goals/${goal.id}/moves`, { body: { amount: dir === 'in' ? v : -v, made_on: todayIn(user.timezone) } }));
          if (r) { refreshAll(); toast({ kind: 'ok', text: dir === 'in' ? `Added ${fmt(v)} to ${goal.name}` : `Took ${fmt(v)} out of ${goal.name}` }); setAmt(''); onClose(); }
        }}>
          <p className="muted">{fmt(goal.saved)} saved of {fmt(goal.target)}.</p>
          <div className="seg" role="group" aria-label="Direction">
            <button type="button" aria-pressed={dir === 'in'} onClick={() => setDir('in')}>Add money</button>
            <button type="button" aria-pressed={dir === 'out'} onClick={() => setDir('out')}>Take out</button>
          </div>
          <Field label="Amount" error={errors.amount}><input className="input" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} aria-invalid={!!errors.amount} data-autofocus /></Field>
          {formError && <p className="field-err">{formError}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : dir === 'in' ? 'Add to goal' : 'Take out'}</button>
          {goal.moves.length > 0 && (
            <div>
              <h3 style={{ margin: '8px 0' }}>Recent</h3>
              <table className="plain"><tbody>
                {goal.moves.map((m) => <tr key={m.id}><td>{formatDay(m.made_on, 'long')}</td><td style={{ textAlign: 'right' }} className={`num ${m.amount < 0 ? 'spend' : 'earn'}`}>{fmt(m.amount, { sign: m.amount > 0 })}</td></tr>)}
              </tbody></table>
            </div>
          )}
          <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start', color: '#9F1F18' }} onClick={async () => {
            if (!confirm(`Delete the goal “${goal.name}” and its history?`)) return;
            await api(`/api/goals/${goal.id}`, { method: 'DELETE' }); refreshAll(); toast({ kind: 'ok', text: 'Goal deleted' }); onClose();
          }}><Icon name="trash" size={16} />Delete goal</button>
        </form>
      )}
    </Sheet>
  );
}

export default function GoalsView() {
  const { fmt } = useApp();
  const { data, error, mutate } = useSWR<{ goals: Goal[] }>('/api/goals');
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState<Goal | null>(null);
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (!data) return <LoadingBlock />;
  return (
    <div className="stack">
      <div className="page-head"><h1>Goals</h1><button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={18} />New goal</button></div>
      {data.goals.length === 0 ? (
        <div className="card"><Empty icon="target" title="Save for something specific" body="Set a target and a date. Spendly works out what to put aside each month and counts it in your daily number." action={<button className="btn btn-primary" onClick={() => setCreating(true)}>Create your first goal</button>} /></div>
      ) : (
        <div className="grid-cards">
          {data.goals.map((g) => {
            const pct = Math.round((g.saved / g.target) * 100);
            const done = g.saved >= g.target;
            return (
              <article key={g.id} className="card goal-card">
                <div className="goal-ring">
                  <Ring value={g.saved} max={g.target} color={g.color}><Icon name={g.glyph} size={22} /><b className="num" style={{ fontSize: '.85rem' }}>{pct}%</b></Ring>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ fontSize: '1.15rem' }}>{g.name}</h2>
                    <p className="num"><b>{fmt(g.saved)}</b> <span className="muted">of {fmt(g.target)}</span></p>
                    <p className="hint">
                      {done ? 'Done. Nicely saved.'
                        : g.deadline === null ? 'No deadline'
                        : g.daysLeft! < 0 ? `Deadline passed ${formatDay(g.deadline)}`
                        : `${fmt(g.monthlyNeed)} a month to reach it by ${formatDay(g.deadline, 'long')}`}
                    </p>
                  </div>
                </div>
                <button className="btn btn-block" onClick={() => setMoving(g)}>{done ? 'View history' : 'Add money'}</button>
              </article>
            );
          })}
        </div>
      )}
      <GoalSheet open={creating} onClose={() => setCreating(false)} />
      <MoveSheet goal={moving} onClose={() => setMoving(null)} />
    </div>
  );
}
