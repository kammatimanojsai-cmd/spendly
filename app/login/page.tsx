import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/server/auth';
import { AuthForm, DemoButton } from '@/components/auth/AuthForms';
import Icon from '@/components/Icon';

export const metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function Login() {
  if (await currentUser()) redirect('/app');
  return (
    <main className="auth-wrap" id="main">
      <div className="card auth-card sticker">
        <Link href="/" className="brand"><span className="brand-mark"><Icon name="coins" size={18} /></span>Spendly</Link>
        <h1>Welcome back</h1>
        <p className="muted" style={{ marginBottom: 18 }}>Sign in to see today’s number.</p>
        <AuthForm mode="login" />
        <p className="hint" style={{ marginTop: 12 }}><Link className="link" href="/forgot-password">Forgot password?</Link></p>
        <p className="hint" style={{ marginTop: 8 }}>The site owner gets a notice with your name, email and sign-in time. <Link className="link" href="/privacy">Privacy</Link></p>
        <p className="hint" style={{ marginTop: 16 }}>New here? <Link className="link" href="/signup">Create an account</Link> or <DemoButton className="link" label="try the demo" /></p>
      </div>
    </main>
  );
}
