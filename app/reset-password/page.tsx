import Link from 'next/link';
import { ResetForm } from '@/components/auth/AuthForms';
import Icon from '@/components/Icon';

export const metadata = { title: 'Choose a new password' };
export const dynamic = 'force-dynamic';

export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main className="auth-wrap" id="main">
      <div className="card auth-card sticker">
        <Link href="/" className="brand"><span className="brand-mark"><Icon name="coins" size={18} /></span>Spendly</Link>
        <h1>Choose a new password</h1>
        {token ? <ResetForm token={token} /> : (
          <p className="notice" style={{ marginTop: 12 }}>This link is missing its code. <Link className="link" href="/forgot-password">Request a new link</Link>.</p>
        )}
      </div>
    </main>
  );
}
