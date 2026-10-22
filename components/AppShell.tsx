'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ResendVerify } from './auth/AuthForms';
import useSWR, { SWRConfig } from 'swr';
import { MotionConfig } from 'motion/react';
import Icon from './Icon';
import { ToastProvider, fetcher } from './ui';
import TxSheet, { type TxRecord } from './TxSheet';
import { formatMoney } from '@/lib/money';

export type Account = { id: number; name: string; kind: string; color: string; balance: number; archived: boolean; opening_balance: number; tx_count: number };
export type Category = { id: number; name: string; kind: 'expense' | 'income'; glyph: string; color: string; tx_count?: number };
export type Me = { id: number; name: string; email: string; currency: string; timezone: string; is_demo: boolean; onboarded: boolean; email_verified: boolean };

type Ctx = {
  user: Me;
  fmt: (minor: number, o?: { sign?: boolean; compact?: boolean }) => string;
  accounts: Account[];
  categories: Category[];
  openTx: (t?: Partial<TxRecord> | null) => void;
};
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => useContext(AppCtx)!;

const TABS = [
  { href: '/app', label: 'Home', icon: 'home' },
  { href: '/app/activity', label: 'Activity', icon: 'list' },
  { href: '/app/plan', label: 'Plan', icon: 'calendar' },
  { href: '/app/goals', label: 'Goals', icon: 'target' },
  { href: '/app/more', label: 'More', icon: 'gear' },
];

function Brand() {
  return (
    <Link href="/app" className="brand" aria-label="Spendly home">
      <span className="brand-mark"><Icon name="coins" size={18} /></span>Spendly
    </Link>
  );
}

function Shell({ initialUser, emailReady, children }: { initialUser: Me; emailReady: boolean; children: React.ReactNode }) {
  const path = usePathname();
  const sp = useSearchParams();
  const verify = sp.get('verify');
  const devLink = sp.get('dev');
  const { data: me } = useSWR<{ user: Me }>('/api/me', { fallbackData: { user: initialUser } });
  const { data: acc } = useSWR<{ accounts: Account[] }>('/api/accounts');
  const { data: cat } = useSWR<{ categories: Category[] }>('/api/categories');
  const [tx, setTx] = useState<Partial<TxRecord> | null | undefined>(undefined);
  const user = me?.user ?? initialUser;
  const fmt = useCallback((m: number, o?: { sign?: boolean; compact?: boolean }) => formatMoney(m, user.currency, o), [user.currency]);
  const value = useMemo<Ctx>(() => ({
    user, fmt, accounts: (acc?.accounts ?? []).filter((a) => !a.archived), categories: cat?.categories ?? [], openTx: (t) => setTx(t ?? null),
  }), [user, fmt, acc, cat]);
  const isActive = (href: string) => (href === '/app' ? path === '/app' : path.startsWith(href));
  // On phones "More" lives in the top bar so the add button stays centred in a 5-slot bar.
  const tabs = TABS.map((t) => (
    <Link key={t.href} href={t.href} className={`tab ${t.href === '/app/more' ? 'tab-desktop' : ''}`} aria-current={isActive(t.href) ? 'page' : undefined}>
      <span className="tab-ico"><Icon name={t.icon} /></span>{t.label}
    </Link>
  ));
  return (
    <AppCtx.Provider value={value}>
      <div className="shell">
        <nav className="tabbar" aria-label="Main">
          <Brand />
          {tabs.slice(0, 2)}
          <button className="fab" onClick={() => setTx(null)} aria-label="Add a transaction">
            <Icon name="plus" size={26} stroke={2.6} /><span className="fab-label">Add transaction</span>
          </button>
          {tabs.slice(2)}
        </nav>
        <div>
          <header className="topbar">
            <Brand />
            <span className="topbar-actions">
              {user.is_demo && <span className="badge demo">Demo</span>}
              <Link href="/app/more" className="btn btn-ghost icon-btn" aria-label="More: accounts, categories, export and settings" aria-current={isActive('/app/more') ? 'page' : undefined}><Icon name="gear" /></Link>
            </span>
          </header>
          <main className="main" id="main">
            {user.is_demo && (
              <div className="notice demo" style={{ marginBottom: 16 }}>
                <span>You’re exploring sample data. It’s deleted after 24 hours.</span>
                <Link href="/signup" className="btn btn-sm btn-primary">Start your own</Link>
              </div>
            )}
            {verify === 'success' && <div className="notice" role="status" style={{ marginBottom: 16, background: 'var(--good-bg)' }}>Email confirmed. A welcome email is on its way.</div>}
            {sp.get('reset') && <div className="notice" role="status" style={{ marginBottom: 16, background: 'var(--good-bg)' }}>Password changed. You’re signed in, and other devices were signed out.</div>}
            {verify === 'invalid' && <div className="notice" role="alert" style={{ marginBottom: 16, background: 'var(--warn-bg)' }}>That confirmation link has expired or was already used.{!user.email_verified && ' Send a new one below.'}</div>}
            {!user.is_demo && !user.email_verified && (
              <div className="notice" style={{ marginBottom: 16, background: 'var(--warn-bg)', display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }} data-testid="verify-banner">
                <span>{!emailReady && !devLink
                    ? `Email isn’t set up on this site yet, so no confirmation link could be sent to ${user.email}. Everything else works; you can confirm later.`
                    : verify === 'sent' ? `Account created. We sent a confirmation link to ${user.email}.` : `Confirm your email (${user.email}) so you can reset your password if you forget it.`}
                  {devLink && <> <a className="link" href={devLink}>Developer confirmation link</a></>}</span>
                {(emailReady || devLink) && <ResendVerify compact />}
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
      <TxSheet open={tx !== undefined} initial={tx ?? null} onClose={() => setTx(undefined)} />
    </AppCtx.Provider>
  );
}

export default function AppShell({ user, emailReady = false, children }: { user: Me; emailReady?: boolean; children: React.ReactNode }) {
  return (
    <SWRConfig value={{ fetcher, revalidateOnFocus: true, dedupingInterval: 1500, shouldRetryOnError: false }}>
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <Shell initialUser={user} emailReady={emailReady}>{children}</Shell>
        </ToastProvider>
      </MotionConfig>
    </SWRConfig>
  );
}
