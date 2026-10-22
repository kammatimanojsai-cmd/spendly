'use client';

import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { mutate } from 'swr';
import Icon from './Icon';

// ---------- data ----------
export class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>) { super(message); }
}

export async function api<T = any>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'You appear to be offline. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== 'undefined' && !url.startsWith('/api/auth')) window.location.href = '/login';
  if (!res.ok) throw new ApiError(res.status, data.error || 'Request failed.', data.fields);
  return data as T;
}
export const fetcher = (url: string) => api(url);
/** After any write, refresh every cached view so balances, budgets and charts never disagree. */
export const refreshAll = () => mutate(() => true);

// ---------- toasts ----------
type Toast = { id: number; text: string; kind: 'ok' | 'error'; action?: { label: string; run: () => void } };
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-2), { ...t, id }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), t.action ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}
              initial={{ opacity: 0, y: 16, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}>
              <span>{t.text}</span>
              {t.action && <button onClick={() => { t.action!.run(); setItems((s) => s.filter((x) => x.id !== t.id)); }}>{t.action.label}</button>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- sheet (accessible modal) ----------
export function Sheet({ open, onClose, title, children, labelledBy }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; labelledBy?: string }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement as HTMLElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const list = [...f].filter((el) => !el.hasAttribute('disabled'));
        if (!list.length) return;
        const first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector<HTMLElement>('[data-autofocus], input, select, button')?.focus(), 30);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; lastFocus.current?.focus?.(); };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy || id}
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
            <div className="grab" />
            <div className="sheet-head">
              <h2 id={labelledBy || id}>{title}</h2>
              <button className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------- form bits ----------
/** Label names the control; hint/error are linked with aria-describedby (not part of the name). */
export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: React.ReactElement<any> }) {
  const id = useId();
  const descId = `${id}-desc`;
  const described = error || hint;
  const props = (isValidElement(children) ? children.props : {}) as Record<string, any>;
  const control = isValidElement(children)
    ? cloneElement(children as React.ReactElement<Record<string, any>>, { id: props.id ?? id, 'aria-describedby': described ? descId : undefined, 'aria-invalid': props['aria-invalid'] ?? (error ? true : undefined) })
    : children;
  return (
    <div className="field">
      <label htmlFor={props.id ?? id}>{label}</label>
      {control}
      {error ? <small id={descId} className="field-err" role="alert">{error}</small> : hint ? <small id={descId} className="hint">{hint}</small> : null}
    </div>
  );
}

export function useForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  async function submit<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true); setErrors({}); setFormError('');
    try { return await fn(); }
    catch (e: any) { setErrors(e.fields || {}); setFormError(e.message || 'Something went wrong.'); }
    finally { setBusy(false); }
  }
  return { errors, setErrors, busy, formError, submit };
}

// ---------- states ----------
export function Skeleton({ h = 80, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} aria-hidden="true" />;
}

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return <div className="stack" aria-busy="true" aria-label={label}><Skeleton h={150} /><Skeleton h={90} /><Skeleton h={220} /></div>;
}

export function ErrorBox({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <span><b>Couldn’t load this.</b> {error.message}</span>
      {retry && <button className="btn btn-sm" onClick={retry}>Try again</button>}
    </div>
  );
}

export function Empty({ icon = 'sparkle', title, body, action }: { icon?: string; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <span className="glyph" style={{ background: 'var(--mango)', width: 56, height: 56 }}><Icon name={icon} size={28} /></span>
      <h3>{title}</h3>
      <p className="muted" style={{ maxWidth: '38ch' }}>{body}</p>
      {action}
    </div>
  );
}

export function Progress({ value, max, pace }: { value: number; max: number; pace?: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const cls = value > max ? 'over' : pace !== undefined && value / max > pace + 0.1 ? 'warn' : '';
  return (
    <div className={`bar ${cls}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
