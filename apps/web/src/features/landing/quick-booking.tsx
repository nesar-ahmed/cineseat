'use client';

import { useId, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarIcon, FilmIcon, MapPinIcon, SearchIcon } from '../../components/ui/icons';
import { dayInfo } from '../catalog/format';
import { movieHref } from '../catalog/links';
import { useCatalogFilters, useMovies } from '../catalog/queries';

/**
 * "Quick tickets": movie → where → when in one row, the way cinema chains put
 * booking front and centre. With a movie picked it opens that movie's page on the
 * chosen city and day; otherwise the catalog lists everything playing there.
 */
export function QuickBooking() {
  const router = useRouter();
  const id = useId();
  const [movie, setMovie] = useState('');
  const [city, setCity] = useState('');
  const [cinema, setCinema] = useState('');
  const [date, setDate] = useState('');

  // Movies, cities, cinemas and bookable dates all come from the API.
  const showing =
    useMovies({ status: 'NOW_SHOWING', sort: 'title', pageSize: 100 }).data?.items ?? [];
  const filters = useCatalogFilters().data;
  const cinemas = useMemo(
    () => (filters?.theaters ?? []).filter((item) => !city || item.city === city),
    [filters, city],
  );
  const days = useMemo(
    () => (filters?.dates ?? []).map((value) => dayInfo(value, filters?.dates[0])),
    [filters],
  );
  // Until the schedule loads, today is the default.
  const chosenDate = date || days[0]?.date || '';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (movie) {
      // The movie page lists every cinema by city; a picked cinema narrows it to its city.
      const cinemaCity = filters?.theaters.find((item) => item.id === cinema)?.city;
      router.push(movieHref(movie, { city: city || cinemaCity, date: chosenDate }));
      return;
    }
    const params = new URLSearchParams();
    if (city) params.set('city', city);
    if (cinema) params.set('cinema', cinema);
    if (chosenDate) params.set('date', chosenDate);
    router.push(`/movies?${params.toString()}`);
  };

  // The select inside has no outline of its own, so the whole cell shows keyboard focus.
  const field =
    'relative flex min-w-0 items-center gap-3 rounded-2xl px-4 py-2.5 transition hover:bg-white/[0.04] focus-within:bg-white/[0.05] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold-400';
  const label = 'block text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-400';
  // Borderless native selects inside each field; the whole cell is the hit area.
  const select =
    'mt-0.5 w-full cursor-pointer appearance-none truncate bg-transparent pr-2 text-sm font-semibold text-ink-50 outline-none [&>option]:bg-ink-900';

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="container-x relative z-10 -mt-16 sm:-mt-20 lg:-mt-24"
    >
      <h2 id={`${id}-title`} className="sr-only">
        Quick tickets
      </h2>
      <form
        onSubmit={submit}
        className="glass grid gap-1 rounded-[28px] p-2 shadow-lift sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.2fr_1fr_auto] lg:items-center lg:gap-0 lg:divide-x lg:divide-white/[0.06]"
      >
        <label className={field}>
          <FilmIcon className="h-5 w-5 shrink-0 text-brand-400" />
          <span className="min-w-0 flex-1">
            <span className={label}>Movie</span>
            <select
              value={movie}
              onChange={(event) => setMovie(event.target.value)}
              className={select}
            >
              <option value="">All movies</option>
              {showing.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </span>
        </label>

        <label className={field}>
          <MapPinIcon className="h-5 w-5 shrink-0 text-brand-400" />
          <span className="min-w-0 flex-1">
            <span className={label}>City</span>
            <select
              value={city}
              onChange={(event) => {
                setCity(event.target.value);
                setCinema('');
              }}
              className={select}
            >
              <option value="">All cities</option>
              {(filters?.cities ?? []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </span>
        </label>

        <label className={field}>
          <MapPinIcon className="h-5 w-5 shrink-0 text-ink-400" />
          <span className="min-w-0 flex-1">
            <span className={label}>Cinema</span>
            <select
              value={cinema}
              onChange={(event) => setCinema(event.target.value)}
              className={select}
            >
              <option value="">Any cinema</option>
              {cinemas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name.replace('CineSeat ', '')}
                </option>
              ))}
            </select>
          </span>
        </label>

        <label className={field}>
          <CalendarIcon className="h-5 w-5 shrink-0 text-brand-400" />
          <span className="min-w-0 flex-1">
            <span className={label}>Date</span>
            <select
              value={chosenDate}
              onChange={(event) => setDate(event.target.value)}
              className={select}
            >
              {days.length === 0 ? <option value="">Today</option> : null}
              {days.map((item) => (
                <option key={item.date} value={item.date}>
                  {item.offset < 2 ? `${item.label}, ${item.day} ${item.month}` : item.long}
                </option>
              ))}
            </select>
          </span>
        </label>

        <div className="p-1 sm:col-span-2 lg:col-span-1 lg:border-0 lg:pl-2">
          <button
            type="submit"
            className="btn-primary h-14 w-full rounded-[20px] px-7 text-[15px] lg:w-auto"
          >
            <SearchIcon className="h-5 w-5" />
            Find showtimes
          </button>
        </div>
      </form>
    </section>
  );
}
