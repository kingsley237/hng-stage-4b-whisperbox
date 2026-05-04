import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'WhisperBox — E2E Encrypted Messaging',
  description: 'End-to-end encrypted messaging. The server never sees your messages.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geist.className} bg-slate-950 text-white antialiased`}>
        {children}
      </body>
    </html>
  );
}