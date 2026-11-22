'use client';

import { useEffect, useState } from 'react';
import type { Booking } from '@cineseat/shared';
import { CalendarIcon, CheckIcon, CopyIcon } from '../../components/ui/icons';
import { CINEMA_TIME_ZONE, dayInfo, money, runtime, time12 } from '../catalog/format';
import { PosterArt } from '../catalog/poster-art';
import { useMovie } from '../catalog/queries';
import { CATEGORY_LABEL } from '../seats/seat-grid';

/**
 * The ticket as a pass: the show on the body, the booking code on the stub,
 * torn along a perforation. `valid` is false for anything unpaid — the pass
 * then says so, so it can never be mistaken for an entry ticket.
 */
export function TicketPass({ booking, valid }: { booking: Booking; valid: boolean }) {
  const { show } = booking;
  const movie = useMovie(show.movie.id).data;
  const paid = booking.payment?.status === 'SUCCESS' ? booking.payment : null;
  const ends = endTime(show.startsAt, show.movie.durationMin);

  return (
    <article aria-label={`Ticket for ${show.movie.title}`} className="drop-shadow-2xl">
      {/* Body */}
      <div className="notch-bottom relative overflow-hidden rounded-t-[28px] border border-b-0 border-ink-800 bg-ink-900">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-40 overflow-hidden sm:h-48">
          {movie ? (
            <PosterArt
              movie={movie}
              variant="backdrop"
              showTitle={false}
              className={`h-full w-full scale-110 blur-sm saturate-[1.15] ${valid ? 'opacity-70' : 'opacity-40 grayscale'}`}
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-ink-900/45 to-ink-900" />
        </div>

        <div className="relative px-5 pb-6 pt-24 sm:px-8 sm:pt-28">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            <div className="w-24 shrink-0 sm:w-28">
              {movie ? (
                <PosterArt
                  movie={movie}
                  className="aspect-[2/3] w-full rounded-2xl text-[10px] shadow-lift ring-1 ring-white/15"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="aspect-[2/3] w-full rounded-2xl bg-white/[0.06]"
                />
              )}
            </div>
            <div className="min-w-0">
              <ul className="flex flex-wrap gap-1.5" aria-label="Show details">
                {[show.format, show.language, show.movie.certificate].map((chip) => (
                  <li
                    key={chip}
                    className="rounded-md border border-white/15 bg-ink-950/60 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-200"
                  >
                    {chip}
                  </li>
                ))}
              </ul>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
                {show.movie.title}
              </h2>
              <p className="mt-1 text-sm text-ink-300">{runtime(show.movie.durationMin)}</p>
            </div>
          </div>

          <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <Info label="Date" value={dayInfo(show.date).long} />
            <Info label="Showtime" value={time12(show.time)} sub={`Ends around ${ends}`} />
            <Info
              label="Cinema"
              value={show.theater.name.replace(/^CineSeat /, '')}
              sub={show.theater.city}
            />
            <Info label="Screen" value={show.screen.name} />
          </dl>

          <div className="mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-400">
              Seats
            </p>
            <ul aria-label="Seats" className="mt-2 flex flex-wrap gap-2">
              {booking.seats.map((seat) => (
                <li
                  key={seat.id}
                  className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-1.5 text-sm"
                >
                  <span className="font-bold text-ink-50">{seat.label}</span>{' '}
                  <span className="text-xs text-ink-400">{CATEGORY_LABEL[seat.category]}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Stub, behind the perforation */}
      <div className="notch-top relative rounded-b-[28px] border border-t-0 border-ink-800 bg-ink-900">
        <div
          aria-hidden="true"
          className="absolute inset-x-6 top-0 border-t-2 border-dashed border-white/15"
        />
        <div className="flex flex-col gap-5 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-400">
              {valid ? `Booking code · Admit ${booking.seats.length}` : 'Not a valid ticket'}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <p
                className={`font-mono text-3xl font-bold tracking-[0.12em] sm:text-4xl ${
                  valid ? 'text-gold-200' : 'text-ink-500 line-through decoration-1'
                }`}
              >
                {booking.code}
              </p>
              {valid ? <CopyCodeButton code={booking.code} /> : null}
            </div>
            <p className="mt-1.5 text-xs text-ink-400">
              {valid
                ? 'Show this code at the cinema counter to get in.'
                : booking.status === 'PENDING'
                  ? 'Finish paying to turn this into your ticket.'
                  : 'This booking was not paid, so it cannot be used to enter.'}
            </p>
          </div>
          <div className="shrink-0 sm:text-right">
            <p className="font-display text-3xl font-semibold tabular-nums text-ink-50">
              {money(booking.total)}
            </p>
            <p className="text-xs text-ink-400">
              {paid?.method
                ? `Paid with ${paid.method}`
                : valid
                  ? 'Paid'
                  : booking.status === 'PENDING'
                    ? 'Not paid yet'
                    : 'Not charged'}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

function Info({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-400">
        {label}
      </dt>
      <dd className="mt-1 truncate font-semibold text-ink-50">{value}</dd>
      {sub ? <dd className="truncate text-xs text-ink-400">{sub}</dd> : null}
    </div>
  );
}

/** Copies the code; says so for two seconds, out loud for screen readers too. */
export function CopyCodeButton({ code, label = false }: { code: string; label?: boolean }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard blocked (permissions, insecure origin): the code stays on screen to read.
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={label ? 'btn-ghost w-full' : 'btn-icon h-9 w-9'}
      aria-label={label ? undefined : `Copy booking code ${code}`}
    >
      {copied ? (
        <CheckIcon className="h-4 w-4 text-emerald-300" />
      ) : (
        <CopyIcon className="h-4 w-4" />
      )}
      {label ? (copied ? 'Copied' : 'Copy booking code') : null}
      <span role="status" className="sr-only">
        {copied ? 'Booking code copied' : ''}
      </span>
    </button>
  );
}

/** "Add to calendar": an .ics file made in the browser, nothing sent anywhere. */
export function CalendarButton({ booking }: { booking: Booking }) {
  const download = () => {
    const { show } = booking;
    const start = new Date(show.startsAt);
    const end = new Date(start.getTime() + show.movie.durationMin * 60_000);
    const stamp = (date: Date) =>
      date
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
    const text = (value: string) => value.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CineSeat//Booking//EN',
      'BEGIN:VEVENT',
      `UID:${booking.id}@cineseat`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${text(`${show.movie.title} (${show.format})`)}`,
      `LOCATION:${text(`${show.theater.name}, ${show.screen.name}, ${show.theater.address}, ${show.theater.city}`)}`,
      `DESCRIPTION:${text(`Booking ${booking.code}\nSeats ${booking.seats.map((seat) => seat.label).join(', ')}`)}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `cineseat-${booking.code}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button type="button" onClick={download} className="btn-ghost w-full">
      <CalendarIcon className="h-4 w-4" />
      Add to calendar
    </button>
  );
}

/** "9:58 PM": when the film ends, on the cinema's clock. */
function endTime(startsAt: string, minutes: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CINEMA_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(Date.parse(startsAt) + minutes * 60_000));
}
