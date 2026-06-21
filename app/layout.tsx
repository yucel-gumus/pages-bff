import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'pages-bff',
  description: 'BFF for GitHub Pages static apps',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}