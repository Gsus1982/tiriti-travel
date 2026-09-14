import type { Metadata, Viewport } from 'next';
import { APP_VERSION } from '@/lib/version';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tiriti Travel',
  description: `Metabuscador personal de vuelos directos con filtros avanzados y logica open-jaw en destino (v${APP_VERSION})`,
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Tiriti Travel'
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0e1013'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
