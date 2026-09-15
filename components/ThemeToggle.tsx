'use client';

import { useEffect, useState } from 'react';
import { IconSun, IconMoon } from './Icons';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      window.localStorage.setItem('tiriti_theme', next ? 'dark' : 'light');
    } catch {
      // localStorage bloqueado (modo privado) -- el tema no persiste, pero cambia igual.
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
    >
      {isDark ? <IconSun className="w-4 h-4" /> : <IconMoon className="w-4 h-4" />}
    </button>
  );
}
