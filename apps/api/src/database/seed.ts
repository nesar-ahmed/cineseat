/**
 * CineSeat seed script (guideline section 16).
 * Idempotent: clears tables and recreates demo data, all inside one transaction,
 * so a failed run leaves the previous data untouched.
 * Run with: npm run db:seed (after npm run db:migrate)
 */
import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { SCHEDULE_DAYS, type SeatCategory } from '@cineseat/shared';
import {
  DataSource,
  MigrationExecutor,
  type EntityManager,
  type EntityTarget,
  type ObjectLiteral,
} from 'typeorm';
import { addDays, dateInZone, startOfDayInZone } from '../common/time/zoned-time';
import { databasePathFromEnv, timeZoneFromEnv } from '../config/env';
import { seatPrice } from '../shows/pricing';
import { seatsFor } from '../theaters/seat-layout';
import {
  AuditLog,
  Booking,
  BookingSeat,
  Coupon,
  Movie,
  MovieGenre,
  Notification,
  Payment,
  Review,
  Screen,
  Seat,
  Show,
  ShowSeat,
  Theater,
  User,
  Wishlist,
} from './entities';
import { buildDataSourceOptions } from './typeorm.options';

/** Deterministic pseudo-random numbers, so every seed run builds the same demo data. */
function random(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `hour:minute` on today + `dayOffset`, on the cinemas' clock (TIME_ZONE) — not the
 * server's, so an 8:30 PM show is 8:30 PM in Dhaka wherever the seed runs.
 */
function atTime(dayOffset: number, hour: number, minute: number): Date {
  const timeZone = timeZoneFromEnv();
  const day = addDays(dateInZone(new Date(), timeZone), dayOffset);
  return new Date(startOfDayInZone(day, timeZone).getTime() + (hour * 60 + minute) * 60_000);
}

/** Portable "delete every row" (TRUNCATE is not available in SQLite). */
async function wipe(manager: EntityManager, entity: EntityTarget<ObjectLiteral>): Promise<void> {
  await manager.createQueryBuilder().delete().from(entity).execute();
}

/** How far back the demo sales and sign-ups reach, so the admin dashboard has history. */
const HISTORY_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

async function seed(manager: EntityManager): Promise<void> {
  const seededAt = Date.now();
  // Wipe in dependency order.
  for (const entity of [
    BookingSeat,
    Payment,
    Booking,
    ShowSeat,
    Show,
    Seat,
    Screen,
    Theater,
    Review,
    Wishlist,
    Notification,
    AuditLog,
    Coupon,
    MovieGenre,
    Movie,
    User,
  ]) {
    await wipe(manager, entity);
  }

  // --- Users -------------------------------------------------------------
  const adminPassword = bcrypt.hashSync('Admin@123', 10);
  const userPassword = bcrypt.hashSync('User@123', 10);

  const admin = await manager.save(
    manager.create(User, {
      email: 'admin@cineseat.dev',
      passwordHash: adminPassword,
      name: 'CineSeat Admin',
      role: 'ADMIN',
    }),
  );

  const userSeed = [
    {
      email: 'rina@cineseat.dev',
      name: 'Rina Ahmed',
      phone: '01700000001',
      preferredCity: 'Dhaka',
    },
    {
      email: 'karim@cineseat.dev',
      name: 'Karim Hossain',
      phone: '01700000002',
      preferredCity: 'Dhaka',
    },
    {
      email: 'sadia@cineseat.dev',
      name: 'Sadia Islam',
      phone: '01700000003',
      preferredCity: 'Chattogram',
    },
    {
      email: 'tanvir@cineseat.dev',
      name: 'Tanvir Rahman',
      phone: '01700000004',
      preferredCity: 'Chattogram',
    },
    {
      email: 'mim@cineseat.dev',
      name: 'Mim Chowdhury',
      phone: '01700000005',
      preferredCity: 'Dhaka',
    },
  ];
  // Members joined over the past weeks — two of them within the dashboard's last 7 days.
  const joinedDaysAgo = [40, 26, 11, 5, 2];
  const users: User[] = [];
  for (const [i, u] of userSeed.entries()) {
    users.push(
      await manager.save(
        manager.create(User, {
          ...u,
          passwordHash: userPassword,
          role: 'USER',
          createdAt: new Date(seededAt - joinedDaysAgo[i] * DAY_MS),
        }),
      ),
    );
  }

  // --- Movies ------------------------------------------------------------
  // The catalog the web app was designed with: the ten original titles plus eight
  // more. Audience counters (rating, votes, interest, popularity) are demo values;
  // the reviews, wishlist and booking features maintain them from real activity.
  const movies = [
    {
      title: 'Midnight Express',
      tagline: 'One night. One train. No way off.',
      description:
        'When the last train out of Kamalapur is hijacked between stations, an off-duty railway inspector has until dawn to get four hundred passengers home — without the driver, the radio or a second chance.',
      genres: ['Action', 'Thriller'],
      language: 'Bangla',
      durationMin: 138,
      certificate: 'U/A',
      formats: ['2D', '3D'],
      director: 'Rafiq Hasan',
      cast: ['Arif Chowdhury', 'Nabila Karim', 'Tahsin Rahman'],
      status: 'NOW_SHOWING',
      releaseInDays: -10,
      ratingAvg: 4.8,
      ratingCount: 18420,
      interestCount: 0,
      popularity: 98,
    },
    {
      title: 'The Last Monsoon',
      tagline: 'Some rains wash nothing away.',
      description:
        'A retired schoolteacher returns to the river village she left forty years ago, where one stubborn monsoon season decides what her family remembers and what it finally forgives.',
      genres: ['Drama', 'Romance'],
      language: 'Bangla',
      durationMin: 124,
      certificate: 'U',
      formats: ['2D'],
      director: 'Shirin Akter',
      cast: ['Rokeya Banu', 'Imran Kabir', 'Sumaiya Noor'],
      status: 'NOW_SHOWING',
      releaseInDays: -17,
      ratingAvg: 4.6,
      ratingCount: 9650,
      interestCount: 0,
      popularity: 84,
    },
    {
      title: 'Neon Skyline',
      tagline: 'The city never sleeps. Neither does its AI.',
      description:
        'In 2089 Dhaka, a courier who delivers memories between tower blocks finds one that is still being written — and the city’s mind will do anything to get it back.',
      genres: ['Sci-Fi', 'Action'],
      language: 'English',
      durationMin: 141,
      certificate: 'U/A',
      formats: ['2D', '3D'],
      director: 'Maya Rahman',
      cast: ['Daniel Okafor', 'Lina Sato', 'Kabir Mehta'],
      status: 'NOW_SHOWING',
      releaseInDays: -3,
      ratingAvg: 4.7,
      ratingCount: 22310,
      interestCount: 0,
      popularity: 96,
    },
    {
      title: 'Paper Boats',
      tagline: 'Every boat carries a wish.',
      description:
        'Two siblings fold a paper boat for every day their father is away at sea, and set out to float the hundredth one all the way to the Bay of Bengal.',
      genres: ['Drama', 'Family'],
      language: 'Bangla',
      durationMin: 96,
      certificate: 'U',
      formats: ['2D'],
      director: 'Anisul Haque',
      cast: ['Ayaan Islam', 'Mehjabin Sultana', 'Rashed Alam'],
      status: 'NOW_SHOWING',
      releaseInDays: -24,
      ratingAvg: 4.4,
      ratingCount: 6120,
      interestCount: 0,
      popularity: 71,
    },
    {
      title: 'Silent Harbor',
      tagline: 'The fog keeps every secret. Until now.',
      description:
        'A lighthouse keeper on a fog-bound island logs a ship that no port has heard of. By morning, the ship is gone — and so is everyone who saw it.',
      genres: ['Thriller'],
      language: 'English',
      durationMin: 117,
      certificate: 'A',
      formats: ['2D'],
      director: 'Elena Varga',
      cast: ['Thomas Reid', 'Amara Cole', 'Jonas Berg'],
      status: 'NOW_SHOWING',
      releaseInDays: -7,
      ratingAvg: 4.5,
      ratingCount: 11870,
      interestCount: 0,
      popularity: 80,
    },
    {
      title: 'Kathputli',
      tagline: 'Pull the right string.',
      description:
        'A puppeteer’s daughter inherits a failing travelling show and one very opinionated wooden puppet — just in time for the biggest festival of the year.',
      genres: ['Family', 'Comedy'],
      language: 'Hindi',
      durationMin: 132,
      certificate: 'U',
      formats: ['2D', '3D'],
      director: 'Vikram Sethi',
      cast: ['Ananya Desai', 'Rohan Kapoor', 'Farah Naaz'],
      status: 'NOW_SHOWING',
      releaseInDays: -30,
      ratingAvg: 4.3,
      ratingCount: 7340,
      interestCount: 0,
      popularity: 66,
    },
    {
      title: 'Echoes of Tomorrow',
      tagline: 'The future called. It wants a word.',
      description:
        'A radio astronomer picks up a signal that answers her questions a day before she asks them. The replies are getting shorter.',
      genres: ['Sci-Fi', 'Drama'],
      language: 'English',
      durationMin: 149,
      certificate: 'U/A',
      formats: ['2D', '3D'],
      director: 'Hannah Lowe',
      cast: ['Priya Nair', 'Marcus Hale', 'Ines Duarte'],
      status: 'COMING_SOON',
      releaseInDays: 14,
      ratingAvg: null,
      ratingCount: 0,
      interestCount: 12840,
      popularity: 90,
    },
    {
      title: 'Rongdhonu',
      tagline: 'Love, in every colour.',
      description:
        'A wedding photographer and the groom’s reluctant best friend spend one chaotic week of holud, mehndi and monsoon chasing the perfect picture — and each other.',
      genres: ['Romance', 'Comedy'],
      language: 'Bangla',
      durationMin: 111,
      certificate: 'U',
      formats: ['2D'],
      director: 'Nusrat Jahan',
      cast: ['Tanjim Ahmed', 'Sabila Nur', 'Fahim Reza'],
      status: 'COMING_SOON',
      releaseInDays: 21,
      ratingAvg: null,
      ratingCount: 0,
      interestCount: 8930,
      popularity: 78,
    },
    {
      title: 'Iron Valley',
      tagline: 'The last mine. The last stand.',
      description:
        'When a mining company moves to flood their valley, the workers of the last iron town dig in for one final shift that nobody above ground expects them to survive.',
      genres: ['Action', 'Drama'],
      language: 'English',
      durationMin: 128,
      certificate: 'U/A',
      formats: ['2D', '3D'],
      director: 'Carlos Mendez',
      cast: ['Grace Holt', 'Sam Adeyemi', 'Victor Lind'],
      status: 'COMING_SOON',
      releaseInDays: 35,
      ratingAvg: null,
      ratingCount: 0,
      interestCount: 10210,
      popularity: 74,
    },
    {
      title: 'The Cartographer',
      tagline: 'Some places refuse to be found.',
      description:
        'A mapmaker hired to chart a river delta that keeps changing its shape discovers the islands are moving on purpose.',
      genres: ['Adventure', 'Drama'],
      language: 'English',
      durationMin: 135,
      certificate: 'U',
      formats: ['2D'],
      director: 'Oliver Grant',
      cast: ['Mira Chen', 'Tobias Ward', 'Selin Aksoy'],
      status: 'COMING_SOON',
      releaseInDays: 42,
      ratingAvg: null,
      ratingCount: 0,
      interestCount: 6480,
      popularity: 62,
    },
    {
      title: 'Rickshaw Kings',
      tagline: 'Three wheels. Zero brakes. One trophy.',
      description:
        'Old Dhaka’s most hopeless rickshaw crew enters the city’s first-ever rickshaw race, armed with borrowed paint, a stolen horn and a plan that cannot possibly work.',
      genres: ['Comedy'],
      language: 'Bangla',
      durationMin: 112,
      certificate: 'U',
      formats: ['2D'],
      director: 'Mostofa Kamal',
      cast: ['Chanchal Sarkar', 'Pori Moni', 'Zahid Hossain'],
      status: 'NOW_SHOWING',
      releaseInDays: -12,
      ratingAvg: 4.2,
      ratingCount: 8310,
      interestCount: 0,
      popularity: 77,
    },
    {
      title: 'The Hollow Tide',
      tagline: 'Low tide reveals what the sea kept.',
      description:
        'A marine biologist returns to her drowned hometown for one low tide a century, and finds the church bell still ringing beneath the mud.',
      genres: ['Horror', 'Thriller'],
      language: 'English',
      durationMin: 104,
      certificate: 'A',
      formats: ['2D'],
      director: 'Ruth Callahan',
      cast: ['Nora Quinn', 'Eli Marsh', 'Sofia Brandt'],
      status: 'NOW_SHOWING',
      releaseInDays: -5,
      ratingAvg: 4,
      ratingCount: 5270,
      interestCount: 0,
      popularity: 69,
    },
    {
      title: 'Sundarbans',
      tagline: 'Into the last great mangrove.',
      description:
        'A honey collector’s son and a city wildlife photographer get lost for six days in the Sundarbans, with a tiger, a cyclone and each other for company.',
      genres: ['Adventure', 'Family'],
      language: 'Bangla',
      durationMin: 127,
      certificate: 'U',
      formats: ['2D', '3D'],
      director: 'Kamrul Islam',
      cast: ['Siam Hasan', 'Afsana Mimi', 'Rubel Das'],
      status: 'NOW_SHOWING',
      releaseInDays: -8,
      ratingAvg: 4.6,
      ratingCount: 13980,
      interestCount: 0,
      popularity: 88,
    },
    {
      title: 'Orbit of Ash',
      tagline: 'Home is 400 kilometres straight down.',
      description:
        'The crew of a failing space station has ninety minutes — one orbit — to decide who rides the only working capsule back to Earth.',
      genres: ['Sci-Fi', 'Thriller'],
      language: 'English',
      durationMin: 133,
      certificate: 'U/A',
      formats: ['3D', '2D'],
      director: 'Yuri Petrov',
      cast: ['Alex Mercer', 'Hana Ito', 'Jamal Wright'],
      status: 'NOW_SHOWING',
      releaseInDays: -15,
      ratingAvg: 4.1,
      ratingCount: 9020,
      interestCount: 0,
      popularity: 73,
    },
    {
      title: 'Dhaka Noir',
      tagline: 'Every alley has two endings.',
      description:
        'A night-shift detective chases a forger through the old city’s print shops, where the only thing more dangerous than a fake is the truth printed beside it.',
      genres: ['Thriller', 'Drama'],
      language: 'Bangla',
      durationMin: 119,
      certificate: 'A',
      formats: ['2D'],
      director: 'Farhana Mili',
      cast: ['Mosharraf Karim', 'Tisha Rahman', 'Sajal Noor'],
      status: 'NOW_SHOWING',
      releaseInDays: -2,
      ratingAvg: 4.5,
      ratingCount: 10450,
      interestCount: 0,
      popularity: 86,
    },
    {
      title: 'Little Lanterns',
      tagline: 'Even small lights find their way home.',
      description:
        'On the night of the lantern festival, a tiny paper lantern blown off course has to cross the whole city to find the girl who made it.',
      genres: ['Animation', 'Family'],
      language: 'English',
      durationMin: 94,
      certificate: 'U',
      formats: ['2D', '3D'],
      director: 'Aiko Tanaka',
      cast: ['Voices of Lily Park', 'Ben Ortiz', 'Meera Shah'],
      status: 'NOW_SHOWING',
      releaseInDays: -1,
      ratingAvg: 4.7,
      ratingCount: 15310,
      interestCount: 0,
      popularity: 92,
    },
    {
      title: 'Shapla',
      tagline: 'She learned to bloom in still water.',
      description:
        'The first woman to run a ferry on her stretch of the Padma takes on a rival operator, a sceptical village and a river that answers to no one.',
      genres: ['Drama'],
      language: 'Bangla',
      durationMin: 118,
      certificate: 'U',
      formats: ['2D'],
      director: 'Rubaiyat Hossain',
      cast: ['Jaya Ahsan', 'Nasir Uddin', 'Moushumi Hamid'],
      status: 'COMING_SOON',
      releaseInDays: 7,
      ratingAvg: null,
      ratingCount: 0,
      interestCount: 5740,
      popularity: 70,
    },
    {
      title: 'Kites over Karnaphuli',
      tagline: 'The sky is big enough for everyone.',
      description:
        'Chattogram’s fiercest kite-fighting grandmothers come out of retirement to beat a team of teenagers at the river festival — on their own terms.',
      genres: ['Comedy', 'Family'],
      language: 'Bangla',
      durationMin: 105,
      certificate: 'U',
      formats: ['2D'],
      director: 'Saiful Islam',
      cast: ['Dilara Zaman', 'Abul Hayat', 'Nishat Tasnim'],
      status: 'COMING_SOON',
      releaseInDays: 28,
      ratingAvg: null,
      ratingCount: 0,
      interestCount: 4320,
      popularity: 58,
    },
  ];
  const createdMovies: Movie[] = [];
  for (const { genres, releaseInDays, ...m } of movies) {
    const movie = await manager.save(
      manager.create(Movie, {
        ...m,
        genre: genres[0],
        releaseDate: atTime(releaseInDays, 0, 0),
        posterPath: null, // uploaded through POST /movies/:id/poster
      }),
    );
    await manager.insert(
      MovieGenre,
      genres.map((genre, position) => ({ movieId: movie.id, genre, position })),
    );
    createdMovies.push(movie);
  }

  // --- Theaters, screens, seats ------------------------------------------
  const theaters = [
    {
      name: 'CineSeat Bashundhara',
      city: 'Dhaka',
      address: 'Rupgan, Bashundhara',
      amenities: ['Recliner row', '3D', 'Food court'],
    },
    {
      name: 'CineSeat Gulshan',
      city: 'Dhaka',
      address: 'Gulshan Avenue',
      amenities: ['Recliner row', '3D', 'Parking'],
    },
    {
      name: 'CineSeat Agargaon',
      city: 'Chattogram',
      address: 'Agargaon Column No. 4',
      amenities: ['Recliner row', '3D', 'Wheelchair access'],
    },
  ];
  // Back row recliners, the row in front of it premium; only Screen 1 projects 3D.
  const screenBlueprints = [
    { name: 'Screen 1', rows: 8, cols: 10, premiumRows: 1, reclinerRows: 1, formats: ['2D', '3D'] },
    { name: 'Screen 2', rows: 6, cols: 8, premiumRows: 1, reclinerRows: 1, formats: ['2D'] },
  ];

  const screens: (Screen & { theater: Theater; seats: Seat[] })[] = [];
  for (const [ti, t] of theaters.entries()) {
    const theater = await manager.save(manager.create(Theater, t));
    for (const { premiumRows, reclinerRows, ...s } of screenBlueprints) {
      const screen = await manager.save(manager.create(Screen, { ...s, theaterId: theater.id }));
      await manager.insert(
        Seat,
        seatsFor({ rows: s.rows, cols: s.cols, premiumRows, reclinerRows }).map((seat) => ({
          ...seat,
          screenId: screen.id,
        })),
      );
      const seats = await manager.find(Seat, {
        where: { screenId: screen.id },
        order: { row: 'ASC', number: 'ASC' },
      });
      screens.push(Object.assign(screen, { theater, seats }));
    }
    console.log(`Theater ${ti + 1}/${theaters.length}: ${theater.name} (${theater.city})`);
  }

  // --- Shows for the schedule window + show_seats --------------------------
  // Four shows per screen per day, 3h15 apart: enough for the longest title plus
  // the 20-minute turnaround. Every title plays twice a day, in its own language;
  // 3D only where both the film and the screen support it (+৳100).
  const showing = createdMovies.filter((m) => m.status === 'NOW_SHOWING');
  const showTimes = [
    { hour: 11, minute: 30 },
    { hour: 14, minute: 45 },
    { hour: 18, minute: 0 },
    { hour: 21, minute: 15 },
  ];
  const shows: { show: Show; screen: (typeof screens)[number]; day: number; slot: number }[] = [];
  for (let day = 0; day < SCHEDULE_DAYS; day++) {
    for (const [si, screen] of screens.entries()) {
      for (const [ti, time] of showTimes.entries()) {
        const movie = showing[(si * showTimes.length + ti + day * 5) % showing.length];
        const is3d =
          movie.formats.includes('3D') && screen.formats.includes('3D') && (day + ti) % 2 === 0;
        const show = await manager.save(
          manager.create(Show, {
            movieId: movie.id,
            screenId: screen.id,
            startsAt: atTime(day, time.hour, time.minute),
            language: movie.language,
            format: is3d ? '3D' : '2D',
            basePrice: (screen.theater.city === 'Dhaka' ? 40000 : 30000) + (is3d ? 10000 : 0), // poisha
          }),
        );
        shows.push({ show, screen, day, slot: ti });
      }
    }
  }
  console.log(`Created ${shows.length} shows.`);

  // --- Demo occupancy: real confirmed bookings ------------------------------
  // Evening shows fill up more; a few sell out. Seats go in groups of 1–4 from
  // the middle of the hall outwards, each group a booking with a paid mock payment,
  // so seat maps, availability and the booking tables all agree. Each was bought at
  // some point in the last HISTORY_DAYS (more of them recently, as a show nears),
  // which gives the admin dashboard real history to chart.
  const demand = [0.25, 0.35, 0.6, 0.75];
  let bookingCount = 0;
  let soldSeats = 0;
  for (const { show, screen, day, slot } of shows) {
    // Keyed on stable names, not generated ids, so every run fills the same seats.
    const rnd = random(`${screen.theater.name}:${screen.name}:${day}:${slot}`);
    const target = rnd() < 0.06 ? 1 : Math.min(1, Math.max(0, demand[slot] + (rnd() - 0.5) * 0.5));
    const centre = { row: screen.rows * 0.6, col: (screen.cols + 1) / 2 };
    const order = [...screen.seats].sort(
      (a, b) =>
        Math.hypot(a.row - centre.row, (a.number - centre.col) * 0.8) +
        rnd() * 1.5 -
        (Math.hypot(b.row - centre.row, (b.number - centre.col) * 0.8) + rnd() * 1.5),
    );
    const toSell = order.slice(0, Math.round(order.length * target));

    const showSeats = screen.seats.map((seat) => ({
      id: randomUUID(),
      showId: show.id,
      seatId: seat.id,
      status: 'AVAILABLE',
    }));
    const showSeatBySeat = new Map(showSeats.map((row) => [row.seatId, row]));
    const bookings: Partial<Booking>[] = [];
    const bookingSeats: Partial<BookingSeat>[] = [];
    const payments: Partial<Payment>[] = [];
    for (let i = 0; i < toSell.length;) {
      const size = Math.min(toSell.length - i, 1 + Math.floor(rnd() * 4));
      const group = toSell.slice(i, i + size);
      i += size;
      const bookingId = randomUUID();
      const user = users[Math.floor(rnd() * users.length)];
      const prices = group.map((seat) => seatPrice(show.basePrice, seat.category as SeatCategory));
      const total = prices.reduce((sum, price) => sum + price, 0);
      const boughtAt = new Date(seededAt - Math.floor(rnd() ** 1.6 * HISTORY_DAYS * DAY_MS));
      bookings.push({
        id: bookingId,
        userId: user.id,
        showId: show.id,
        status: 'CONFIRMED',
        totalAmount: total,
        createdAt: boughtAt,
        updatedAt: boughtAt,
      });
      group.forEach((seat, k) => {
        const showSeat = showSeatBySeat.get(seat.id)!;
        showSeat.status = 'BOOKED';
        bookingSeats.push({ bookingId, showSeatId: showSeat.id, price: prices[k] });
      });
      payments.push({
        bookingId,
        userId: user.id,
        provider: 'mock',
        providerRef: `seed_${bookingId}`,
        status: 'SUCCESS',
        method: 'Visa •••• 4242',
        createdAt: boughtAt,
        completedAt: boughtAt,
        amount: total,
      });
    }
    await manager.insert(ShowSeat, showSeats);
    if (bookings.length) {
      await manager.insert(Booking, bookings);
      await manager.insert(BookingSeat, bookingSeats);
      await manager.insert(Payment, payments);
    }
    bookingCount += bookings.length;
    soldSeats += toSell.length;
  }
  console.log(`Seat maps ready: ${soldSeats} seats sold in ${bookingCount} demo bookings.`);

  // --- Coupons -------------------------------------------------------------
  const now = new Date();
  // The offers on the home page, with the rules they advertise (checkout enforces them).
  await manager.insert(Coupon, [
    {
      code: 'WEEKEND10',
      description: '10% off weekend shows (Friday to Sunday)',
      type: 'PERCENT',
      value: 10,
      weekdays: '0,5,6',
      validFrom: now,
      validTo: atTime(30, 23, 59),
    },
    {
      code: 'FLAT100',
      description: '৳100 off bookings of three seats or more',
      type: 'FLAT',
      value: 10000,
      minSeats: 3,
      validFrom: now,
      validTo: atTime(14, 23, 59),
    },
    {
      code: 'FIRST50',
      description: '৳50 off your first booking',
      type: 'FLAT',
      value: 5000,
      firstBookingOnly: true,
      validFrom: now,
      validTo: atTime(60, 23, 59),
      usageLimit: 100,
    },
  ]);

  // --- Welcome notifications ------------------------------------------------
  await manager.insert(
    Notification,
    [...users, admin].map((u) => ({
      userId: u.id,
      type: 'WELCOME',
      title: 'Welcome to CineSeat',
      body: 'Book your seats early — one seat, one buyer!',
      dedupeKey: 'welcome',
    })),
  );
}

async function main(): Promise<void> {
  const dataSource = await new DataSource(
    buildDataSourceOptions(databasePathFromEnv()),
  ).initialize();
  try {
    const pending = await new MigrationExecutor(dataSource).getPendingMigrations();
    if (pending.length > 0) {
      throw new Error(
        `Pending migrations (${pending.map((m) => m.name).join(', ')}) — run \`npm run db:migrate\` first.`,
      );
    }

    console.log('Seeding CineSeat database...');
    await dataSource.transaction((manager) => seed(manager));
    console.log('Seed complete.');
    console.log('Default logins: admin@cineseat.dev / Admin@123, rina@cineseat.dev / User@123');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
