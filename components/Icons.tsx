export function IconPlane({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.6}>
      <path d="M10.5 3.5 12 2l1.5 1.5v6.2l6.8 4v2.1l-6.8-2.1v3.9l2.2 1.6v1.7L12 19.5l-3.7 1.4v-1.7l2.2-1.6v-3.9L3.7 15.8v-2.1l6.8-4V3.5Z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconCalendar({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.6}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconBell({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.6}>
      <path d="M6 10a6 6 0 1 1 12 0c0 3.2 1.2 4.9 2 6H4c.8-1.1 2-2.8 2-6Z" strokeLinejoin="round" />
      <path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  );
}

export function IconMapPin({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.6}>
      <path d="M12 21s7-6.6 7-11.5A7 7 0 0 0 5 9.5C5 14.4 12 21 12 21Z" strokeLinejoin="round" />
      <circle cx="12" cy="9.5" r="2.4" />
    </svg>
  );
}

export function IconSliders({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h13M21 18h-1" />
      <circle cx="16" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18" cy="18" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSuitcase({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.6}>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
      <path d="M9 7.5V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8V7.5" strokeLinejoin="round" />
      <path d="M3.5 12.5h17" />
    </svg>
  );
}
