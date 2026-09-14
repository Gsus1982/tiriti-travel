import { IconChevronDown } from './Icons';

export default function FilterAccordion({
  title,
  defaultOpen = false,
  children
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="group border-b border-slate-100 dark:border-slate-800 last:border-b-0 py-3 first:pt-0 last:pb-0" open={defaultOpen}>
      <summary className="flex items-center justify-between cursor-pointer list-none text-sm font-medium text-ink dark:text-slate-100">
        {title}
        <IconChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}
