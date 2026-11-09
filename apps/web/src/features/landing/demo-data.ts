/**
 * Landing-page content.
 *
 * The titles and venues below mirror `apps/api/prisma/seed.ts` so the page reads
 * like the real product while the catalog endpoints are still on their way
 * (phase 2 swaps these for `getMovies()` / a shows query — same shapes).
 * Booking rules come from the API defaults in `apps/api/.env.example`.
 */

export type DemoMovie = {
  id: string;
  title: string;
  genre: string;
  language: string;
  durationMin: number;
  rating: number;
  status: 'NOW_SHOWING' | 'COMING_SOON';
  /** Two-stop duotone used to paint the poster — no image request needed. */
  gradient: [string, string];
  showtimes: string[];
};

export const demoMovies: DemoMovie[] = [
  {
    id: 'midnight-express',
    title: 'Midnight Express',
    genre: 'Action',
    language: 'Bangla',
    durationMin: 138,
    rating: 4.8,
    status: 'NOW_SHOWING',
    gradient: ['#7f1d3a', '#120a1c'],
    showtimes: ['4:00 PM', '8:30 PM'],
  },
  {
    id: 'the-last-monsoon',
    title: 'The Last Monsoon',
    genre: 'Drama',
    language: 'Bangla',
    durationMin: 124,
    rating: 4.6,
    status: 'NOW_SHOWING',
    gradient: ['#1e3a5f', '#0b1420'],
    showtimes: ['4:15 PM', '7:45 PM'],
  },
  {
    id: 'neon-skyline',
    title: 'Neon Skyline',
    genre: 'Sci-Fi',
    language: 'English',
    durationMin: 141,
    rating: 4.7,
    status: 'NOW_SHOWING',
    gradient: ['#3b1d6e', '#0a0f1f'],
    showtimes: ['5:30 PM', '9:00 PM'],
  },
  {
    id: 'paper-boats',
    title: 'Paper Boats',
    genre: 'Drama',
    language: 'Bangla',
    durationMin: 96,
    rating: 4.4,
    status: 'NOW_SHOWING',
    gradient: ['#0f4c5c', '#081821'],
    showtimes: ['4:30 PM', '8:00 PM'],
  },
  {
    id: 'silent-harbor',
    title: 'Silent Harbor',
    genre: 'Thriller',
    language: 'English',
    durationMin: 117,
    rating: 4.5,
    status: 'NOW_SHOWING',
    gradient: ['#3f3f46', '#0c0c12'],
    showtimes: ['6:10 PM', '9:20 PM'],
  },
  {
    id: 'kathputli',
    title: 'Kathputli',
    genre: 'Family',
    language: 'Hindi',
    durationMin: 132,
    rating: 4.3,
    status: 'NOW_SHOWING',
    gradient: ['#7c2d12', '#1b1008'],
    showtimes: ['5:00 PM', '8:15 PM'],
  },
];

export const comingSoonCount = 4;

/** Mirrors the seeded venues: two screens each, 8×10 and 6×8. */
export const demoVenues = [
  { name: 'CineSeat Bashundhara', city: 'Dhaka', address: 'Rupgan, Bashundhara', screens: 2, seats: 128 },
  { name: 'CineSeat Gulshan', city: 'Dhaka', address: 'Gulshan Avenue', screens: 2, seats: 128 },
  { name: 'CineSeat Agargaon', city: 'Chattogram', address: 'Agargaon Column No. 4', screens: 2, seats: 128 },
];

/** Facts the running system actually enforces (see apps/api/.env.example + guideline 2.4). */
export const bookingRules = [
  { label: 'Seat hold', value: '5:00', note: 'countdown starts on pick-up' },
  { label: 'Seats per booking', value: '6 max', note: 'one checkout, one show' },
  { label: 'Full refund until', value: '2h', note: 'before the show starts' },
  { label: 'Shows scheduled', value: '84', note: 'next 7 days, 2 cities' },
];

export const underTheHood = [
  {
    id: 'holds',
    tab: 'Atomic holds',
    headline: 'A seat is claimed with one conditional write',
    body: 'No row locks in SQLite, so the hold is a guarded update: it only succeeds while the seat is still free. Two browsers racing for 5C means one of them gets a 409 and picks again.',
    language: 'TypeScript · Prisma',
    code: `const held = await prisma.$transaction(async (tx) => {
  const taken = await tx.showSeat.updateMany({
    where: { showId, seatId, status: 'AVAILABLE' },
    data:  { status: 'HELD', heldBy: userId, holdExpiresAt },
  });

  if (taken.count === 0) throw new ConflictException('seat taken');
  return tx.hold.create({ data: { showId, userId, seats } });
});`,
  },
  {
    id: 'live',
    tab: 'Live seats',
    headline: 'Every chair on the map updates without a refresh',
    body: 'Browsers join a room per show. When a hold, expiry or booking changes, the gateway pushes just the diff — a few bytes per event instead of polling the seat endpoint.',
    language: 'TypeScript · Socket.IO',
    code: `@SubscribeMessage('show.join')
join(@MessageBody() showId: string, client: Socket) {
  client.join(\`show:\${showId}\`);
}

broadcast(showId: string, changed: ShowSeatDelta[]) {
  this.server.to(\`show:\${showId}\`).emit('seats.updated', changed);
}`,
  },
  {
    id: 'payment',
    tab: 'Honest payments',
    headline: 'The webhook can arrive twice — the booking cannot',
    body: 'The provider reference is unique, and a payment only moves PENDING → SUCCESS once. Replays return the same answer, so a retry never books a second row of seats.',
    language: 'TypeScript',
    code: `async webhook(event: PaymentEvent) {
  const payment = await this.payments.findByIdempotencyKey(event.providerRef);
  if (payment?.status === 'SUCCESS') return payment;          // replay: no-op

  return this.payments.markSuccess(event.providerRef, () =>
    this.bookings.confirm(event.bookingId),                    // one write, one truth
  );
}`,
  },
] as const;

export const steps = [
  {
    title: 'Pick a show',
    body: 'Filter by city, language and format. Showtimes come from the screen calendar, not a static list.',
  },
  {
    title: 'Grab your seats',
    body: 'The map shows what is free, held and sold. Five minutes on the clock, six seats maximum.',
  },
  {
    title: 'Pay and confirm',
    body: 'Coupon, mock gateway, idempotent webhook. Price is always recalculated server-side.',
  },
  {
    title: 'Walk in with a QR',
    body: 'A ticket with a QR plus a PDF copy, checked in from the admin panel.',
  },
];
