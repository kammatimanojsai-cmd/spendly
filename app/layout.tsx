import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: { default: 'Spendly — know what you can spend today', template: '%s · Spendly' },
  description: 'A playful personal finance companion: track spending across accounts, budgets, bills, recurring payments, savings goals and receipts.',
};
export const viewport: Viewport = { themeColor: '#E8F5EC', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
