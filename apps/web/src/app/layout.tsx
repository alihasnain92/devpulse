import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'DevPulse — API Uptime Monitoring & Incident Management',
  description: 'Enterprise-grade uptime monitoring and incident tracking platform.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] antialiased selection:bg-[var(--primary)]/30 selection:text-[var(--text-primary)]">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
