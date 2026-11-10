import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '../features/auth/auth-provider';
import { SiteFooter } from '../features/landing/site-footer';
import { SiteHeader } from '../features/landing/site-header';
import './globals.css';

const title = 'CineSeat — one seat, one buyer, at any moment';
const description =
  'Movie ticket booking with database-level seat holds, live seat maps, coupon-aware checkout and an admin panel. Built as a typed TypeScript monorepo.';

export const metadata: Metadata = {
  title,
  description,
  applicationName: 'CineSeat',
  keywords: ['movie tickets', 'seat booking', 'cinema', 'NestJS', 'Next.js', 'monorepo'],
  openGraph: { title, description, type: 'website', siteName: 'CineSeat' },
  twitter: { card: 'summary_large_image', title, description },
};

export const viewport: Viewport = {
  themeColor: '#08080f',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-950 text-ink-100 antialiased">
        {/* First tab stop, so a keyboard user can skip the navigation. */}
        <a
          href="#top"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <AuthProvider>
          <SiteHeader />
          <main>{children}</main>
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
