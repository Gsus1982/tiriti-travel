import { IconPlaneTakeoff } from './Icons';
import { APP_VERSION } from '@/lib/version';
import ThemeToggle from './ThemeToggle';

export default function TopNav() {
  return (
    <nav className="bg-ink text-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconPlaneTakeoff className="w-5 h-5 text-indigo-light" />
          <span className="font-display text-lg tracking-tight">Tiriti Travel</span>
          <span className="text-[10px] text-white/35 font-medium mt-1">v{APP_VERSION}</span>
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
