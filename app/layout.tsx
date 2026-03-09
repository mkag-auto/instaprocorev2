import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'InstaProcore',
  description: 'Jobsite photo feed',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
