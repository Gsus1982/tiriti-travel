import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TiritiTravel',
  description: 'Metabuscador personal de vuelos directos con filtros avanzados y lógica open-jaw en destino'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <header className="bg-brand-900 text-white px-6 py-4">
          <h1 className="text-xl font-semibold">TiritiTravel ❄️</h1>
          <p className="text-sm text-brand-50">Metabuscador personal · uso exclusivo Jesús</p>
        </header>
        <main className="px-6 py-6 max-w-6xl mx-auto">{children}</main>
      </body>
    </html>
  );
}
