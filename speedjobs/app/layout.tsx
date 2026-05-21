import type { Metadata, Viewport } from 'next';
import { Toaster } from 'react-hot-toast';
import { SupabaseProvider } from '@/components/shared/SupabaseProvider';
import './globals.css';

export const metadata: Metadata = {
  title: "SpeedJob's — Emplois d'urgence en temps réel",
  description: "Plateforme de matching d'emplois d'urgence (24-48h) en temps réel.",
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <SupabaseProvider>
          {children}
          <Toaster position="top-center" />
        </SupabaseProvider>
      </body>
    </html>
  );
}
