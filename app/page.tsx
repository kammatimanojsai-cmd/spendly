import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/server/auth';
import { DemoButton } from '@/components/auth/AuthForms';
import Icon from '@/components/Icon';

export const dynamic = 'force-dynamic';

const FEATURES: [string, string, string][] = [
  ['coins', 'Safe to spend, worked out', 'One number for today, with the arithmetic shown: budgets, what you’ve spent and bills still due.'],
  ['camera', 'Scan a receipt', 'Snap the bill and Spendly reads the total, date and shop. It runs on your phone, so the photo stays there.'],
  ['repeat', 'Recurring that actually recurs', 'Salary and SIPs post themselves on schedule. Bills wait for you to mark them paid.'],
  ['calendar', 'Bill reminders in your calendar', 'Export bills to Google, Apple or Outlook calendar with an alert days before each one is due.'],
  ['wallet', 'Every account in one place', 'Cash, bank, cards and UPI wallets with transfers between them, so balances stay right.'],
  ['target', 'Goals with a plan', 'Set a target and a date. Spendly tells you what to put aside each month to make it.'],
];

export default async function Landing() {
  if (await currentUser()) redirect('/app');
  return (
    <div className="land">
      <nav className="land-nav" aria-label="Site">
        <span className="brand"><span className="brand-mark"><Icon name="coins" size={18} /></span>Spendly</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <Link href="/login" className="btn btn-ghost">Sign in</Link>
          <Link href="/signup" className="btn btn-ink">Sign up</Link>
        </span>
      </nav>
      <main id="main">
        <section className="land-hero">
          <div>
            <h1>How much can I spend today?</h1>
            <p className="lead">Spendly answers that every morning. Track money across all your accounts, plan budgets and bills, and see the maths behind the number.</p>
            <div className="land-cta">
              <Link href="/signup" className="btn btn-primary">Create a free account</Link>
              <DemoButton label="Explore with sample data" />
            </div>
            <p className="hint" style={{ marginTop: 12 }}>No bank logins. You add what you spend, Spendly does the rest.</p>
          </div>
          <div aria-label="Example of the safe-to-spend card" className="ticket" style={{ transform: 'rotate(1.5deg)' }}>
            <div className="ticket-top">
              <div className="ticket-label"><span>Safe to spend today</span><span className="badge">Example</span></div>
              <div className="ticket-amount">₹1,240</div>
              <div className="ticket-sub">per day for the next 12 days</div>
            </div>
            <div className="ticket-perf" />
            <div className="ticket-math">
              <div><span>Monthly budgets</span><span>₹38,000</span></div>
              <div><span>Spent so far</span><span>−₹19,320</span></div>
              <div><span>Bills still due</span><span>−₹3,800</span></div>
              <div className="eq"><span>Left for 12 days</span><span>₹14,880</span></div>
            </div>
          </div>
        </section>
        <section aria-labelledby="what">
          <h2 id="what">What it does</h2>
          <div className="land-grid">
            {FEATURES.map(([icon, title, body]) => (
              <article className="card" key={title}>
                <span className="glyph" style={{ background: 'var(--mango)' }}><Icon name={icon} /></span>
                <h3>{title}</h3>
                <p className="muted">{body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <footer className="land-foot">
        <span>Spendly is a portfolio project. Your data is yours: export it or delete it any time.</span>
        <a href="https://github.com/kammatimanojsai-cmd/spendly">Source on GitHub</a>
      </footer>
    </div>
  );
}
