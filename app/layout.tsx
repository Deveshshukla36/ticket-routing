import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { TopNav } from '@/components/top-nav';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'IntentRoute · Ticket Routing',
  description: 'Support-ticket intent classification, smart routing, and model monitoring.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={manrope.variable}>
      <body className="canvas-wash min-h-screen text-ink antialiased">
        <Providers>
          <TopNav />
          <main className="mx-auto w-full max-w-[1440px] px-4 pb-10 pt-2 sm:px-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
