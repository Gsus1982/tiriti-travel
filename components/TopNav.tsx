import { APP_VERSION } from '@/lib/version';
import ThemeToggle from './ThemeToggle';

// Logo propio: una golondrina estilizada (motivo clasico de viajero/bohemio, no un
// avion generico reutilizado del resto de la interfaz). Trazo simple para que se lea
// bien de pequeno, en el mismo indigo del resto del acento de la app.
function LogoMark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <path d="M2 13 Q 9 5 16 12 Q 23 5 30 13 Q 23 10 16 15 Q 9 10 2 13 Z" fill="currentColor" />
      <path d="M14.5 14 L16 24 L17.5 14 Z" fill="currentColor" />
    </svg>
  );
}

export default function TopNav() {
  return (
    <nav className="bg-ink text-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LogoMark className="w-6 h-6 text-indigo-light" />
          <span className="font-logo text-2xl text-white leading-none">Tiriti Travel</span>
          <span className="text-[10px] text-white/35 font-medium self-end mb-1">v{APP_VERSION}</span>
        </div>
        <div className="flex items-center gap-4">
          <p className="hidden sm:block text-xs text-white/50">
            Vuelos directos con datos en vivo -- sin escalas, sin estimaciones
          </p>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
