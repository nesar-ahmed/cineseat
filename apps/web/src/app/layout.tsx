import type { Metadata, Viewport } from 'next';
// Self-hosted variable fonts (OFL), bundled from npm — no third-party font CDN.
import '@fontsource-variable/fraunces/soft.css';
import '@fontsource-variable/fraunces/soft-italic.css';
import '@fontsource-variable/plus-jakarta-sans/index.css';
import { SiteFooter } from '../components/layout/site-footer';
import { SiteHeader } from '../components/layout/site-header';
import { Providers } from './providers';
import './globals.css';

const title = 'CineSeat — movie tickets with the seat you actually want';
const description =
  'Book movie tickets in Dhaka and Chattogram. See what is showing, pick your exact seat, hold it for five minutes while you pay, and show your booking code at the cinema.';

export const metadata: Metadata = {
  title,
  description,
  applicationName: 'CineSeat',
  keywords: ['movie tickets', 'cinema', 'showtimes', 'seat booking', 'Dhaka', 'Chattogram'],
  openGraph: { title, description, type: 'website', siteName: 'CineSeat' },
  twitter: { card: 'summary_large_image', title, description },
};

export const viewport: Viewport = {
  themeColor: '#08080f',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Smooth scrolling (globals.css) is for in-page anchors; Next turns it off for route changes.
    <html lang="en" data-scroll-behavior="smooth">
      <body className="min-h-screen bg-ink-950 text-ink-100 antialiased">
        {/* First tab stop, so a keyboard user can skip the navigation. */}
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <Providers>
          <SiteHeader />
          <main id="content" tabIndex={-1} className="outline-none">
            {children}
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
