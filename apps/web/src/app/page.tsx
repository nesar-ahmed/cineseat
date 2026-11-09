export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-24 text-center">
      <span className="rounded-full border border-brand-500/40 bg-brand-900/40 px-4 py-1 text-sm text-brand-50">
        Phase 0 — monorepo scaffolded
      </span>
      <h1 className="text-5xl font-bold tracking-tight">
        Cine<span className="text-brand-500">Seat</span>
      </h1>
      <p className="max-w-xl text-neutral-400">
        Production-grade movie ticket booking. NestJS API on <code>:4000</code>, Next.js web app here on{' '}
        <code>:3000</code>, shared Zod types in <code>@cineseat/shared</code>.
      </p>
      <div className="grid w-full grid-cols-1 gap-3 text-left text-sm sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <p className="font-semibold">apps/api</p>
          <p className="text-neutral-400">NestJS + Prisma + SQLite</p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <p className="font-semibold">apps/web</p>
          <p className="text-neutral-400">Next.js + Tailwind v3</p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <p className="font-semibold">packages/shared</p>
          <p className="text-neutral-400">Zod schemas + types</p>
        </div>
      </div>
    </main>
  );
}
