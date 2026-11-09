import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CineSeat',
  description: 'Offline-first movie ticket booking — one seat, one buyer, at any moment.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">{children}</body>
    </html>
  );
}
