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
      const r = await submit(() => api(`/api/auth/${mode}`, { body: fd }));
      if (r) { router.push('/app'); router.refresh(); }
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
