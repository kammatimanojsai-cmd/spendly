'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, Field, useForm } from '../ui';
import Icon from '../Icon';

export function DemoButton({ className = 'btn', label = 'Try the demo' }: { className?: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <span style={{ display: 'inline-grid', gap: 6 }}>
      <button className={className} disabled={busy} onClick={async () => {
        setBusy(true); setErr('');
        try { await api('/api/auth/demo', { method: 'POST' }); router.push('/app'); router.refresh(); }
        catch (e: any) { setErr(e.message); setBusy(false); }
      }}>{busy ? 'Building your sandbox…' : label}</button>
      {err && <small className="field-err" role="alert">{err}</small>}
    </span>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'block' }}>
      <input {...props} type={show ? 'text' : 'password'} className="input" style={{ paddingRight: 52 }} />
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShow((s) => !s)} aria-pressed={show}
        aria-label={show ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 4, top: 5, minHeight: 36 }}>
        {show ? 'Hide' : 'Show'}
      </button>
    </span>
  );
}

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const { errors, busy, formError, submit } = useForm();
  return (
    <form className="form" noValidate onSubmit={async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.currentTarget));
      const r = await submit(() => api<{ devVerifyLink?: string }>(`/api/auth/${mode}`, { body: fd }));
      if (r) {
        const q = mode === 'signup' ? `?verify=sent${r.devVerifyLink ? `&dev=${encodeURIComponent(r.devVerifyLink)}` : ''}` : '';
        router.push('/app' + q); router.refresh();
      }
    }}>
      {mode === 'signup' && (
        <Field label="Your name" error={errors.name}><input className="input" name="name" autoComplete="name" required aria-invalid={!!errors.name} /></Field>
      )}
      <Field label="Email" error={errors.email}><input className="input" name="email" type="email" autoComplete="email" required aria-invalid={!!errors.email} /></Field>
      <Field label="Password" error={errors.password} hint={mode === 'signup' ? 'At least 8 characters with a letter and a number.' : undefined}>
        <PasswordInput name="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required aria-invalid={!!errors.password} />
      </Field>
      {formError && !Object.keys(errors).length && <p className="field-err" role="alert">{formError}</p>}
      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? (mode === 'signup' ? 'Creating your account…' : 'Signing in…') : mode === 'signup' ? 'Create account' : 'Sign in'}
        {!busy && <Icon name="check" size={18} />}
      </button>
    </form>
  );
}

export function ForgotForm() {
  const { busy, submit, formError } = useForm();
  const [msg, setMsg] = useState('');
  const [dev, setDev] = useState('');
  return (
    <form className="form" noValidate onSubmit={async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.currentTarget));
      const r = await submit(() => api<{ message: string; devResetLink?: string }>('/api/auth/forgot', { body: fd }));
      if (r) { setMsg(r.message); setDev(r.devResetLink || ''); }
    }}>
      <Field label="Email"><input className="input" name="email" type="email" autoComplete="email" required /></Field>
      {msg && <p className="notice" role="status">{msg} Check your inbox and spam folder.</p>}
      {dev && <p className="hint"><a className="link" href={dev}>Developer reset link</a> (email isn’t configured locally)</p>}
      {formError && <p className="field-err" role="alert">{formError}</p>}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const { errors, setErrors, busy, submit, formError } = useForm();
  return (
    <form className="form" noValidate onSubmit={async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
      if (fd.password !== fd.confirm) { setErrors({ confirm: 'The two passwords don’t match.' }); return; }
      const r = await submit(() => api('/api/auth/reset', { body: { token, password: fd.password } }));
      if (r) { router.push('/app?reset=1'); router.refresh(); }
    }}>
      <Field label="New password" error={errors.password} hint="At least 8 characters with a letter and a number.">
        <PasswordInput name="password" autoComplete="new-password" required aria-invalid={!!errors.password} />
      </Field>
      <Field label="Confirm new password" error={errors.confirm}>
        <PasswordInput name="confirm" autoComplete="new-password" required aria-invalid={!!errors.confirm} />
      </Field>
      {formError && !errors.password && !errors.confirm && (
        <p className="field-err" role="alert">{formError} {errors.token && <a className="link" href="/forgot-password">Request a new link</a>}</p>
      )}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
    </form>
  );
}

export function ResendVerify({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<{ busy?: boolean; msg?: string; err?: string; dev?: string }>({});
  return (
    <span style={{ display: 'inline-grid', gap: 4 }}>
      <button className={compact ? 'btn btn-sm' : 'btn'} disabled={state.busy} onClick={async () => {
        setState({ busy: true });
        try { const r = await api<{ devVerifyLink?: string }>('/api/auth/resend', { method: 'POST' }); setState({ msg: 'Sent. Check your inbox and spam folder.', dev: r.devVerifyLink }); }
        catch (e: any) { setState({ err: e.message }); }
      }}>{state.busy ? 'Sending…' : 'Resend link'}</button>
      {state.msg && <small role="status">{state.msg}</small>}
      {state.err && <small className="field-err" role="alert">{state.err}</small>}
      {state.dev && <small><a className="link" href={state.dev}>Developer link</a></small>}
    </span>
  );
}
