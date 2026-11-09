import { ArrowRightIcon, TicketIcon } from '../../components/ui/icons';

export function CallToAction() {
  return (
    <section id="get-started" className="container-x py-16 sm:py-24">
      <div className="card grain relative overflow-hidden px-6 py-12 text-center sm:px-12 sm:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-800/40 via-ink-900/10 to-transparent"
        />
        <div className="relative">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-400/15 text-gold-300">
            <TicketIcon className="h-6 w-6" />
          </span>
          <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-ink-50 sm:text-5xl">
            Doors open at 8:30.
            <span className="block italic text-brand-500">Pick the seat first.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-ink-300">
            Sign-in, seat holds and profile editing are live against the API today. Checkout, tickets
            and the admin panel land in the phases after them.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 xs:flex-row">
            <a href="#browse" className="btn-primary">
              Browse tonight’s shows
              <ArrowRightIcon className="h-4 w-4" />
            </a>
            <a
              href="https://github.com/nesar-ahmed/cineseat"
              target="_blank"
              rel="noreferrer"
              className="btn-ghost"
            >
              Read the source
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
