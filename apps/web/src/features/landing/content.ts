/**
 * Static content for sections that have no API of their own. Everything here
 * states only what the site does: seat surcharges match the API's pricing
 * (`apps/api/src/shows/pricing.ts`), the offers are the seeded coupons with the
 * rules checkout enforces, and the answers follow the real booking flow.
 */
import type { Certificate } from '@cineseat/shared';

/**
 * Where each seat tier is in every hall, and what it costs on top of the show's
 * price (premium +৳100, recliner +৳200, in whole taka).
 */
export const EXPERIENCES = [
  {
    id: 'standard',
    name: 'Standard',
    surcharge: 0,
    blurb: 'Most of the hall, from the front rows back.',
    where: 'Front and middle rows',
  },
  {
    id: 'premium',
    name: 'Premium',
    surcharge: 100,
    blurb: 'The row just in front of the recliners.',
    where: 'Second row from the back',
  },
  {
    id: 'recliner',
    name: 'Recliner',
    surcharge: 200,
    blurb: 'The back row of every hall. Book early.',
    where: 'Back row',
  },
] as const;

/** The coupons the seed creates (money in taka here; minor units in the API). */
export const OFFERS = [
  {
    code: 'WEEKEND10',
    headline: '10% off',
    title: 'Weekend nights',
    detail: 'For shows on Friday, Saturday and Sunday — on every seat in the booking.',
    tone: 'brand',
  },
  {
    code: 'FLAT100',
    headline: '৳100 off',
    title: 'Bring the crew',
    detail: 'Flat discount on any booking of three seats or more.',
    tone: 'gold',
  },
  {
    code: 'FIRST50',
    headline: '৳50 off',
    title: 'Your first booking',
    detail: 'New to CineSeat? Take ৳50 off your first booking, while the first 100 last.',
    tone: 'ink',
  },
] as const;

export const FAQS = [
  {
    question: 'How long are my seats held?',
    answer:
      'Five minutes from the moment you reserve them. The countdown stays on screen through checkout, and starting the payment adds a few more minutes. If time runs out, the seats go back on sale.',
  },
  {
    question: 'How many seats can I book at once?',
    answer:
      'Up to six seats in one booking, all for the same show. Need more? Make a second booking.',
  },
  {
    question: 'Can someone else buy the seat I am holding?',
    answer:
      'No. While your seats are held, nobody else can reserve or pay for them — they show as held on everyone else’s seat map.',
  },
  {
    question: 'Do I need an account?',
    answer:
      'You can browse movies, showtimes and seat maps without one. Reserving seats needs a free account, so your bookings stay together under My bookings.',
  },
  {
    question: 'What if my payment does not go through?',
    answer:
      'Your seats stay held until the timer runs out, so you can try again straight away with another card or wallet.',
  },
  {
    question: 'What do I show at the cinema?',
    answer:
      'Your booking code (it starts with CS-). You see it as soon as the payment is confirmed, and it is always in My bookings in your account.',
  },
] as const;

export const CERTIFICATE_LABEL: Record<Certificate, string> = {
  U: 'Universal — all ages',
  'U/A': 'Parental guidance under 12',
  A: 'Adults only (18+)',
};
