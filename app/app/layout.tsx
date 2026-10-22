import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/server/auth';
import AppShell from '@/components/AppShell';
import { emailProvider } from '@/lib/server/email';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  return <AppShell user={user} emailReady={!!emailProvider()}>{children}</AppShell>;
}
