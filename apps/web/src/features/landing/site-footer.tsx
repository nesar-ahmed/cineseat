import { LogoMark } from '../../components/ui/icons';

const columns = [
  {
    title: 'Visit',
    links: [
      { href: '#browse', label: 'Now showing' },
      { href: '#venues', label: 'Venues' },
      { href: '#how', label: 'How booking works' },
    ],
  },
  {
    title: 'Build',
    links: [
      { href: '#engineering', label: 'Under the hood' },
      { href: 'http://localhost:4000/docs', label: 'API docs (dev)' },
      { href: 'https://github.com/nesar-ahmed/cineseat', label: 'Source' },
    ],
  },
  {
    title: 'Project',
    links: [
      { href: 'https://github.com/nesar-ahmed/cineseat/blob/main/LICENSE', label: 'MIT licence' },
      { href: 'https://github.com/nesar-ahmed/cineseat/issues', label: 'Issues' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-ink-800 bg-ink-950">
      <div className="container-x py-12 sm:py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <a href="#top" className="flex items-center gap-3">
              <LogoMark />
              <span className="font-display text-lg tracking-tight text-ink-50">
                Cine<span className="text-brand-500">Seat</span>
              </span>
            </a>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-400">
              A movie ticket booking platform, built as a typed TypeScript monorepo around one hard
              problem: one seat, one buyer, at any moment.
            </p>
          </div>

          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500">
                {column.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => {
                  const external = link.href.startsWith('http');
                  return (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
                        className="text-sm text-ink-300 transition hover:text-ink-50 motion-reduce:transition-none"
                      >
                        {link.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-ink-800 pt-6 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} CineSeat · MIT licensed</p>
          <p>NestJS + Prisma + SQLite · Next.js + Tailwind · shared Zod types</p>
        </div>
      </div>
    </footer>
  );
}
