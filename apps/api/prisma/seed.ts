/**
 * CineSeat seed script (guideline section 16).
 * Idempotent: clears tables and recreates demo data.
 * Run with: npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SEAT_CATEGORY_PREMIUM_ROWS = 2; // last N rows are PREMIUM, the very last is RECLINER

function categoryForRow(row: number, rows: number): string {
  if (row === rows) return 'RECLINER';
  if (row > rows - SEAT_CATEGORY_PREMIUM_ROWS) return 'PREMIUM';
  return 'STANDARD';
}

function atTime(dayOffset: number, hour: number, minute: number): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  return d;
}

async function main(): Promise<void> {
  console.log('Seeding CineSeat database...');

  // Wipe in dependency order.
  await prisma.bookingSeat.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.showSeat.deleteMany();
  await prisma.show.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.screen.deleteMany();
  await prisma.theater.deleteMany();
  await prisma.review.deleteMany();
  await prisma.wishlist.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.movie.deleteMany();
  await prisma.user.deleteMany();

  // --- Users -------------------------------------------------------------
  const adminPassword = bcrypt.hashSync('Admin@123', 10);
  const userPassword = bcrypt.hashSync('User@123', 10);

  const admin = await prisma.user.create({
    data: { email: 'admin@cineseat.dev', passwordHash: adminPassword, name: 'CineSeat Admin', role: 'ADMIN' },
  });

  const userSeed = [
    { email: 'rina@cineseat.dev', name: 'Rina Ahmed', phone: '01700000001', preferredCity: 'Dhaka' },
    { email: 'karim@cineseat.dev', name: 'Karim Hossain', phone: '01700000002', preferredCity: 'Dhaka' },
    { email: 'sadia@cineseat.dev', name: 'Sadia Islam', phone: '01700000003', preferredCity: 'Chattogram' },
    { email: 'tanvir@cineseat.dev', name: 'Tanvir Rahman', phone: '01700000004', preferredCity: 'Chattogram' },
    { email: 'mim@cineseat.dev', name: 'Mim Chowdhury', phone: '01700000005', preferredCity: 'Dhaka' },
  ];
  const users = [];
  for (const u of userSeed) {
    users.push(await prisma.user.create({ data: { ...u, passwordHash: userPassword, role: 'USER' } }));
  }

  // --- Movies ------------------------------------------------------------
  const movies = [
    { title: 'Midnight Express', genre: 'Action', language: 'Bangla', durationMin: 138, status: 'NOW_SHOWING', releaseDate: atTime(-10, 0, 0) },
    { title: 'The Last Monsoon', genre: 'Drama', language: 'Bangla', durationMin: 124, status: 'NOW_SHOWING', releaseDate: atTime(-17, 0, 0) },
    { title: 'Neon Skyline', genre: 'Sci-Fi', language: 'English', durationMin: 141, status: 'NOW_SHOWING', releaseDate: atTime(-3, 0, 0) },
    { title: 'Paper Boats', genre: 'Drama', language: 'Bangla', durationMin: 96, status: 'NOW_SHOWING', releaseDate: atTime(-24, 0, 0) },
    { title: 'Silent Harbor', genre: 'Thriller', language: 'English', durationMin: 117, status: 'NOW_SHOWING', releaseDate: atTime(-7, 0, 0) },
    { title: 'Kathputli', genre: 'Family', language: 'Hindi', durationMin: 132, status: 'NOW_SHOWING', releaseDate: atTime(-30, 0, 0) },
    { title: 'Echoes of Tomorrow', genre: 'Sci-Fi', language: 'English', durationMin: 149, status: 'COMING_SOON', releaseDate: atTime(14, 0, 0) },
    { title: 'Rongdhonu', genre: 'Romance', language: 'Bangla', durationMin: 111, status: 'COMING_SOON', releaseDate: atTime(21, 0, 0) },
    { title: 'Iron Valley', genre: 'Action', language: 'English', durationMin: 128, status: 'COMING_SOON', releaseDate: atTime(35, 0, 0) },
    { title: 'The Cartographer', genre: 'Adventure', language: 'English', durationMin: 135, status: 'COMING_SOON', releaseDate: atTime(42, 0, 0) },
  ];
  const createdMovies = [];
  for (const [i, m] of movies.entries()) {
    createdMovies.push(
      await prisma.movie.create({
        data: {
          ...m,
          description: `${m.title} — demo movie seeded for CineSeat.`,
          posterPath: `/posters/movie-${i + 1}.jpg`, // local disk, added in phase 2
        },
      }),
    );
  }

  // --- Theaters, screens, seats ------------------------------------------
  const theaters = [
    { name: 'CineSeat Bashundhara', city: 'Dhaka', address: 'Rupgan, Bashundhara' },
    { name: 'CineSeat Gulshan', city: 'Dhaka', address: 'Gulshan Avenue' },
    { name: 'CineSeat Agargaon', city: 'Chattogram', address: 'Agargaon Column No. 4' },
  ];
  const screenBlueprints = [
    { name: 'Screen 1', rows: 8, cols: 10 },
    { name: 'Screen 2', rows: 6, cols: 8 },
  ];

  for (const [ti, t] of theaters.entries()) {
    const theater = await prisma.theater.create({ data: t });
    for (const s of screenBlueprints) {
      const screen = await prisma.screen.create({
        data: { theaterId: theater.id, name: s.name, rows: s.rows, cols: s.cols },
      });
      const seats = [];
      for (let row = 1; row <= s.rows; row++) {
        for (let number = 1; number <= s.cols; number++) {
          seats.push({ screenId: screen.id, row, number, category: categoryForRow(row, s.rows) });
        }
      }
      await prisma.seat.createMany({ data: seats });
    }
    console.log(`Theater ${ti + 1}/${theaters.length}: ${theater.name} (${theater.city})`);
  }

  // --- Shows for the next 7 days + show_seats -----------------------------
  const allScreens = await prisma.screen.findMany({ include: { theater: true, seats: true } });
  const showing = createdMovies.filter((m) => m.status === 'NOW_SHOWING');
  const showTimes = [
    { hour: 16, minute: 0 },
    { hour: 20, minute: 30 },
  ];
  const languages = ['Bangla', 'English'];

  let showCount = 0;
  for (let day = 0; day < 7; day++) {
    for (const [si, screen] of allScreens.entries()) {
      for (const [ti, time] of showTimes.entries()) {
        const movie = showing[(day * allScreens.length + si + ti) % showing.length];
        const show = await prisma.show.create({
          data: {
            movieId: movie.id,
            screenId: screen.id,
            startsAt: atTime(day, time.hour, time.minute),
            language: languages[(si + ti) % languages.length],
            format: si % 2 === 0 ? '2D' : (day + ti) % 3 === 0 ? '3D' : '2D',
            basePrice: screen.theater.city === 'Dhaka' ? 40000 : 30000, // minor units (poisha)
          },
        });
        await prisma.showSeat.createMany({
          data: screen.seats.map((seat) => ({ showId: show.id, seatId: seat.id, status: 'AVAILABLE' })),
        });
        showCount++;
      }
    }
  }
  console.log(`Created ${showCount} shows with seat maps.`);

  // --- Coupons -------------------------------------------------------------
  const now = new Date();
  await prisma.coupon.createMany({
    data: [
      { code: 'WEEKEND10', type: 'PERCENT', value: 10, validFrom: now, validTo: atTime(30, 23, 59) },
      { code: 'FLAT100', type: 'FLAT', value: 10000, validFrom: now, validTo: atTime(14, 23, 59) },
      { code: 'FIRST50', type: 'FLAT', value: 5000, validFrom: now, validTo: atTime(60, 23, 59), usageLimit: 100 },
    ],
  });

  // --- Welcome notifications ------------------------------------------------
  await prisma.notification.createMany({
    data: [...users, admin].map((u) => ({
      userId: u.id,
      type: 'ANNOUNCEMENT',
      title: 'Welcome to CineSeat',
      body: 'Book your seats early — one seat, one buyer!',
    })),
  });

  console.log('Seed complete.');
  console.log('Default logins: admin@cineseat.dev / Admin@123, rina@cineseat.dev / User@123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
