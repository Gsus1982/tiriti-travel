import { IconPlaneTakeoff } from './Icons';

export default function TopNav() {
  return (
    <nav className="bg-ink text-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconPlaneTakeoff className="w-5 h-5 text-indigo-light" />
          <span className="font-display text-lg tracking-tight">Tiriti Travel</span>
        </div>
        <p className="hidden sm:block text-xs text-white/50">
          Vuelos directos con datos en vivo -- sin escalas, sin estimaciones
        </p>
      </div>
    </nav>
  );
}
