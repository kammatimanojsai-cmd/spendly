import Link from 'next/link';
import Icon from '@/components/Icon';

export const metadata = { title: 'Privacy' };

export default function Privacy() {
  return (
    <div className="land" style={{ maxWidth: 760 }}>
      <nav className="land-nav" aria-label="Site"><Link href="/" className="brand"><span className="brand-mark"><Icon name="coins" size={18} /></span>Spendly</Link></nav>
      <main id="main" className="card card-pad" style={{ marginTop: 24, display: 'grid', gap: 14 }}>
        <h1>Privacy and account activity</h1>
        <p className="muted">Spendly is a portfolio project. This is what it stores and who is notified.</p>
        <h2>What we store</h2>
        <ul style={{ margin: 0, lineHeight: 1.7 }}>
          <li>Your name, email, and a one-way hash of your password (never the password itself).</li>
          <li>The accounts, transactions, budgets, bills and goals you enter. No bank connections, ever.</li>
          <li>A sign-in cookie (http-only, 30 days). Sessions and email links are stored hashed.</li>
          <li>Receipt photos are read on your device and are never uploaded.</li>
        </ul>
        <h2>Emails we send you</h2>
        <p>An email confirmation link, a welcome email, and password reset links you ask for.</p>
        <h2>Site owner notifications</h2>
        <p>To monitor the service, the site owner gets an email when:</p>
        <ul style={{ margin: 0, lineHeight: 1.7 }}>
          <li><b>A new account is created</b>, with the name, email and sign-up time.</li>
          <li><b>Someone signs in</b>, with the name, email and sign-in time (at most once every 30 minutes).</li>
        </ul>
        <p>These notices never include passwords, links, session data or anything you track in Spendly. Failed sign-ins aren’t reported, and demo workspaces never trigger emails.</p>
        <h2>Your control</h2>
        <p>Export everything (CSV or JSON) or delete your account and all its data any time from More in the app.</p>
      </main>
    </div>
  );
}
