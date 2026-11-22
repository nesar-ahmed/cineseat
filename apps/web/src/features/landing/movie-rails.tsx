'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from '../../components/ui/icons';
import { SectionHeading } from '../../components/ui/section-heading';
import { movieHref } from '../catalog/links';
import { MovieCard } from '../catalog/movie-card';
import { useMovies } from '../catalog/queries';

/** Each tab is one catalog query; the rail shows its first dozen titles. */
const TABS = [
  {
    id: 'now',
    label: 'Now showing',
    href: '/movies',
    params: { status: 'NOW_SHOWING', sort: 'popular', pageSize: 12 },
  },
  {
    id: 'soon',
    label: 'Coming soon',
    href: '/movies?tab=soon',
    params: { status: 'COMING_SOON', sort: 'release', pageSize: 12 },
  },
] as const;

const CELL =
  'w-[44%] shrink-0 snap-start xs:w-[36%] sm:w-[28%] md:w-[22%] lg:w-[calc((100%-5*1.25rem)/6)]';

export function MovieRails() {
  const [active, setActive] = useState(0);
  const [edges, setEdges] = useState({ start: true, end: false });
  const rail = useRef<HTMLUListElement>(null);
  const id = useId();
  const tab = TABS[active];
  const lists = [useMovies(TABS[0].params), useMovies(TABS[1].params)];
  const current = lists[active];

  const measure = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft < 8,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8,
    });
  }, []);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    el.scrollTo({ left: 0 });
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [active, measure, current.data]);

  const scrollBy = (direction: 1 | -1) => {
    const el = rail.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  return (
    <section aria-labelledby={`${id}-title`} className="container-x pt-20 sm:pt-28">
      <SectionHeading
        id={`${id}-title`}
        eyebrow="In cinemas"
        title="What’s playing"
        action={
          <>
            <div
              role="tablist"
              aria-label="Movie lists"
              className="flex rounded-full border border-white/10 bg-white/[0.03] p-1"
            >
              {TABS.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`${id}-tab-${item.id}`}
                  aria-selected={index === active}
                  aria-controls={`${id}-panel`}
                  onClick={() => setActive(index)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition motion-reduce:transition-none ${
                    index === active ? 'bg-white text-ink-950' : 'text-ink-300 hover:text-ink-50'
                  }`}
                >
                  {item.label}
                  <span
                    className={`ml-1.5 text-xs ${index === active ? 'text-ink-600' : 'text-ink-400'}`}
                  >
                    {lists[index].data?.total ?? '…'}
                  </span>
                </button>
              ))}
            </div>
            <div className="hidden gap-2 md:flex">
              <button
                type="button"
                onClick={() => scrollBy(-1)}
                disabled={edges.start}
                aria-label="Scroll left"
                className="btn-icon"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollBy(1)}
                disabled={edges.end}
                aria-label="Scroll right"
                className="btn-icon"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          </>
        }
      />

      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${tab.id}`}
        className="relative mt-10"
      >
        <ul ref={rail} className="rail -mx-5 scroll-px-5 px-5 sm:-mx-8 sm:scroll-px-8 sm:px-8">
          {current.isError && !current.data ? (
            <li className="w-full py-10 text-center text-sm text-ink-400">
              Couldn’t load movies right now.{' '}
              <button
                type="button"
                onClick={() => void current.refetch()}
                className="font-semibold text-brand-300 hover:text-brand-200"
              >
                Try again
              </button>
            </li>
          ) : !current.data ? (
            Array.from({ length: 6 }, (_, i) => (
              <li
                key={i}
                aria-hidden="true"
                className={`${CELL} animate-pulse motion-reduce:animate-none`}
              >
                <div className="aspect-[2/3] rounded-2xl bg-white/[0.05]" />
                <div className="mt-3 h-3.5 w-3/4 rounded bg-white/[0.06]" />
                <div className="mt-2 h-3 w-1/2 rounded bg-white/[0.04]" />
              </li>
            ))
          ) : (
            current.data.items.map((movie) => (
              <li key={movie.id} className={CELL}>
                <MovieCard movie={movie} href={movieHref(movie.id)} />
              </li>
            ))
          )}
          <li className={CELL}>
            <Link
              href={tab.href}
              className="group flex aspect-[2/3] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 text-center text-sm font-semibold text-ink-300 transition hover:border-brand-500/60 hover:text-ink-50"
            >
              <span className="btn-icon group-hover:border-brand-500 group-hover:bg-brand-500 group-hover:text-white">
                <ArrowRightIcon className="h-4 w-4" />
              </span>
              See all {tab.label.toLowerCase()}
            </Link>
          </li>
        </ul>
      </div>
    </section>
  );
}
