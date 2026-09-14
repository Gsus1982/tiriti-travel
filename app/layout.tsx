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
      <head>
        <script
          // Se ejecuta antes de pintar para evitar el "flash" de tema claro cuando el
          // usuario ya habia elegido oscuro. No usa next/script porque necesita correr
          // sincronamente antes del primer render, no despues de hidratar.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('tiriti_theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`
          }}
        />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
