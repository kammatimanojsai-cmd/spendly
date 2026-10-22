import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/server/auth';
import { AuthForm } from '@/components/auth/AuthForms';
import Icon from '@/components/Icon';

export const metadata = { title: 'Create account' };
export const dynamic = 'force-dynamic';

export default async function Signup() {
  const u = await currentUser();
  if (u && !u.is_demo) redirect('/app');
  return (
    <main className="auth-wrap" id="main">
      <div className="card auth-card sticker">
        <Link href="/" className="brand"><span className="brand-mark"><Icon name="coins" size={18} /></span>Spendly</Link>
        <h1>Start tracking</h1>
        <p className="muted" style={{ marginBottom: 18 }}>Free. We start you with Cash and Bank accounts and everyday categories.</p>
        <AuthForm mode="signup" />
        <p className="hint" style={{ marginTop: 16 }}>Already have an account? <Link className="link" href="/login">Sign in</Link></p>
      </div>
    </main>
  );
}
