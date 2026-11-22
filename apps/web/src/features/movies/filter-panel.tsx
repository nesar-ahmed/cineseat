'use client';

import { useId, type ReactNode } from 'react';
import { HeartIcon, StarIcon } from '../../components/ui/icons';
import type { CatalogFacets, CatalogFilters, Certificate, ShowFormat } from '@cineseat/shared';
import { RATING_STEPS, RUNTIME_BANDS, type CatalogQuery } from './catalog-query';

/** Option → result count, per filter group (from GET /catalog/facets). */
export type FacetCounts = Record<
  'genres' | 'languages' | 'certificates' | 'formats' | 'theaters',
  Map<string, number>
>;

export function toFacetCounts(facets: CatalogFacets): FacetCounts {
  const map = (options: { value: string; count: number }[]) =>
    new Map(options.map((option) => [option.value, option.count]));
  return {
    genres: map(facets.genres),
    languages: map(facets.languages),
    certificates: map(facets.certificates),
    formats: map(facets.formats),
    theaters: map(facets.theaters),
  };
}

type Props = {
  query: CatalogQuery;
  /** The vocabulary (GET /catalog/filters); groups stay empty until it arrives. */
  filters: CatalogFilters | undefined;
  /** Null hides the counts — while loading, or when they would not be accurate. */
  counts: FacetCounts | null;
  savedCount: number;
  onChange: (patch: Partial<CatalogQuery>) => void;
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function Group({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  const id = useId();
  return (
    // A labelled group rather than <fieldset>/<legend>, whose special layout fights the spacing.
    <div
      role="group"
      aria-labelledby={id}
      className="border-b border-white/[0.06] py-5 first:pt-0 last:border-0"
    >
      <h3
        id={id}
        className="mb-3 flex w-full items-baseline justify-between font-sans text-xs font-semibold uppercase tracking-[0.18em] text-ink-300"
      >
        {title}
        {hint ? <span className="normal-case tracking-normal text-ink-400">{hint}</span> : null}
      </h3>
      {children}
    </div>
  );
}

/** A multi-select option with its live result count; empty options dim but stay reachable. */
function Option({
  label,
  count,
  pressed,
  onClick,
  title,
}: {
  label: ReactNode;
  count?: number;
  pressed: boolean;
  onClick: () => void;
  title?: string;
}) {
  const empty = count === 0 && !pressed;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      title={title}
      className={`pill px-3 py-1.5 text-[13px] ${empty ? 'opacity-40' : ''}`}
    >
      {label}
      {count !== undefined ? (
        <span className="text-[11px] tabular-nums text-ink-400">{count}</span>
      ) : null}
    </button>
  );
}

export function FilterPanel({ query, filters, counts, savedCount, onChange }: Props) {
  const theaters = filters?.theaters ?? [];
  const cinemas = theaters.filter((cinema) => !query.city || cinema.city === query.city);
  const showBased = query.tab !== 'soon';

  return (
    <div>
      <Group title="Watchlist">
        <button
          type="button"
          aria-pressed={query.saved}
          onClick={() => onChange({ saved: !query.saved })}
          className="pill w-full justify-between px-3.5 py-2.5"
        >
          <span className="flex items-center gap-2">
            <HeartIcon
              filled={query.saved}
              className={`h-4 w-4 ${query.saved ? 'text-brand-400' : ''}`}
            />
            Only movies I saved
          </span>
          <span className="text-xs tabular-nums text-ink-400">{savedCount}</span>
        </button>
      </Group>

      {showBased ? (
        <>
          <Group title="City">
            <div
              role="group"
              aria-label="City"
              className="grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-ink-950/50 p-1"
            >
              {[null, ...(filters?.cities ?? [])].map((city) => (
                <button
                  key={city ?? 'all'}
                  type="button"
                  aria-pressed={query.city === city}
                  onClick={() =>
                    onChange({
                      city,
                      // Cinemas outside the new city would silently match nothing.
                      cinemas: city
                        ? query.cinemas.filter(
                            (id) => theaters.find((c) => c.id === id)?.city === city,
                          )
                        : query.cinemas,
                    })
                  }
                  className={`rounded-xl px-2 py-2 text-xs font-semibold transition motion-reduce:transition-none ${
                    query.city === city ? 'bg-white text-ink-950' : 'text-ink-300 hover:text-ink-50'
                  }`}
                >
                  {city ?? 'All'}
                </button>
              ))}
            </div>
          </Group>

          <Group title="Cinema">
            <ul className="space-y-1">
              {cinemas.map((cinema) => {
                const checked = query.cinemas.includes(cinema.id);
                const count = counts?.theaters.get(cinema.id);
                return (
                  <li key={cinema.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm transition hover:bg-white/[0.04] ${count === 0 && !checked ? 'opacity-40' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onChange({ cinemas: toggle(query.cinemas, cinema.id) })}
                        className="h-4 w-4 shrink-0 accent-brand-500"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ink-100">
                          {cinema.name.replace('CineSeat ', '')}
                        </span>
                        <span className="block truncate text-xs text-ink-400">{cinema.city}</span>
                      </span>
                      {count !== undefined ? (
                        <span className="text-[11px] tabular-nums text-ink-400">{count}</span>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          </Group>

          <Group title="Format">
            <div className="flex flex-wrap gap-2">
              {((filters?.formats ?? []) as ShowFormat[]).map((format) => (
                <Option
                  key={format}
                  label={format}
                  count={counts?.formats.get(format)}
                  pressed={query.formats.includes(format)}
                  onClick={() => onChange({ formats: toggle(query.formats, format) })}
                />
              ))}
            </div>
          </Group>
        </>
      ) : null}

      <Group title="Genre" hint={query.genres.length > 1 ? 'any of these' : undefined}>
        <div className="flex flex-wrap gap-2">
          {(filters?.genres ?? []).map((genre) => (
            <Option
              key={genre}
              label={genre}
              count={counts?.genres.get(genre)}
              pressed={query.genres.includes(genre)}
              onClick={() => onChange({ genres: toggle(query.genres, genre) })}
            />
          ))}
        </div>
      </Group>

      <Group title="Language">
        <div className="flex flex-wrap gap-2">
          {(filters?.languages ?? []).map((language) => (
            <Option
              key={language}
              label={language}
              count={counts?.languages.get(language)}
              pressed={query.languages.includes(language)}
              onClick={() => onChange({ languages: toggle(query.languages, language) })}
            />
          ))}
        </div>
      </Group>

      {query.tab !== 'soon' ? (
        <Group title="Audience rating">
          <div className="flex flex-wrap gap-2">
            {RATING_STEPS.map((step) => (
              <Option
                key={step}
                label={
                  <>
                    <StarIcon className="h-3.5 w-3.5 text-gold-400" />
                    {step.toFixed(1)}+
                  </>
                }
                pressed={query.minRating === step}
                onClick={() => onChange({ minRating: query.minRating === step ? null : step })}
              />
            ))}
          </div>
        </Group>
      ) : null}

      <Group title="Running time">
        <div className="flex flex-wrap gap-2">
          {RUNTIME_BANDS.map((band) => (
            <Option
              key={band.value}
              label={band.label}
              pressed={query.runtime === band.value}
              onClick={() =>
                onChange({ runtime: query.runtime === band.value ? null : band.value })
              }
            />
          ))}
        </div>
      </Group>

      <Group title="Certificate">
        <div className="flex flex-wrap gap-2">
          {(filters?.certificates ?? []).map(({ value, label }) => {
            const certificate = value as Certificate;
            return (
              <Option
                key={certificate}
                label={certificate}
                title={label}
                count={counts?.certificates.get(certificate)}
                pressed={query.certificates.includes(certificate)}
                onClick={() => onChange({ certificates: toggle(query.certificates, certificate) })}
              />
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-400">
          U: all ages · U/A: parental guidance under 12 · A: 18+
        </p>
      </Group>
    </div>
  );
}
