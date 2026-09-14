import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tiriti Travel',
  description: 'Metabuscador personal de vuelos directos con filtros avanzados y logica open-jaw en destino',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
