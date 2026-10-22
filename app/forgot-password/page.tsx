import Link from 'next/link';
import { ForgotForm } from '@/components/auth/AuthForms';
import Icon from '@/components/Icon';

export const metadata = { title: 'Forgot password' };

export default function Forgot() {
  return (
    <main className="auth-wrap" id="main">
      <div className="card auth-card sticker">
        <Link href="/" className="brand"><span className="brand-mark"><Icon name="coins" size={18} /></span>Spendly</Link>
        <h1>Forgot your password?</h1>
        <p className="muted" style={{ marginBottom: 18 }}>Enter your account email and we’ll send a link to choose a new one.</p>
        <ForgotForm />
        <p className="hint" style={{ marginTop: 16 }}><Link className="link" href="/login">Back to sign in</Link></p>
      </div>
    </main>
  );
}
