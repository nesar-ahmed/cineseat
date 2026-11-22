import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { Booking, BookingSeat, ShowSeat, User } from '../database/entities';
import {
  NOW,
  createScheduleFixture,
  type ScheduleFixture,
} from '../shows/testing/schedule-fixture';
import { HoldsService } from './holds.service';

const MINUTE = 60_000;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE);

/**
 * Holds on a real SQLite file with a frozen clock (see the schedule fixture):
 * "sat" is an empty 3×4 hall (row A standard ৳400, B premium ৳500, C recliner
 * ৳600); "tonight" has A1–C2 sold, an expired hold on C3 and a live one on C4.
 */
describe('HoldsService (SQLite)', () => {
  let f: ScheduleFixture;
  let holds: HoldsService;
  let bookings: Repository<Booking>;
  let alice: string;
  let bob: string;

  /** Show-seat id by label ("B2") for a show, read from the public seat map. */
  const seatIds = async (showId: string, ...labels: string[]) => {
    const map = await f.shows.seatMap(showId, NOW);
    return labels.map((label) => {
      const seat = map.seats.find((item) => item.label === label);
      if (!seat) throw new Error(`No seat ${label}`);
      return seat.id;
    });
  };
  /** Seat states by label, as everyone sees them at `when`. */
  const states = async (showId: string, when: Date, ...labels: string[]) => {
    const map = await f.shows.seatMap(showId, when);
    return labels.map((label) => map.seats.find((seat) => seat.label === label)?.status);
  };
  const hold = async (userId: string, showId: string, labels: string[], when = NOW) =>
    holds.place(userId, { showId, seatIds: await seatIds(showId, ...labels) }, when);

  beforeEach(async () => {
    f = await createScheduleFixture();
    bookings = f.dataSource.getRepository(Booking);
    holds = new HoldsService(f.lane, bookings, f.config);
    const users = f.dataSource.getRepository(User);
    alice = (await users.save({ email: 'alice@cineseat.dev', name: 'Alice', passwordHash: 'x' }))
      .id;
    bob = (await users.save({ email: 'bob@cineseat.dev', name: 'Bob', passwordHash: 'x' })).id;
  });

  afterEach(() => f.destroy());

  it('holds seats for HOLD_MINUTES and prices each by its category', async () => {
    const result = await hold(alice, f.ids.sat, ['C1', 'A1', 'B1']);

    expect(result).toMatchObject({
      showId: f.ids.sat,
      expiresAt: at(5).toISOString(),
      currency: 'BDT',
      totalAmount: 40000 + 50000 + 60000,
    });
    expect(result.seats).toEqual([
      expect.objectContaining({ label: 'A1', category: 'STANDARD', price: 40000 }),
      expect.objectContaining({ label: 'B1', category: 'PREMIUM', price: 50000 }),
      expect.objectContaining({ label: 'C1', category: 'RECLINER', price: 60000 }),
    ]);
    const stored = await bookings.findOneByOrFail({ id: result.id });
    expect(stored).toMatchObject({ userId: alice, status: 'PENDING', expiresAt: at(5) });
  });

  it('shows held seats as taken to everyone, and as available the moment the hold lapses', async () => {
    await hold(alice, f.ids.sat, ['A1', 'A2']);

    await expect(states(f.ids.sat, at(4.9), 'A1', 'A2', 'A3')).resolves.toEqual([
      'HELD',
      'HELD',
      'AVAILABLE',
    ]);
    expect((await f.shows.seatMap(f.ids.sat, at(4.9))).counts.held).toBe(2);
    expect((await f.shows.findOne(f.ids.sat, at(4.9))).seats.available).toBe(10);

    // No sweep has run: reads alone already give the seats back.
    await expect(states(f.ids.sat, at(5), 'A1', 'A2')).resolves.toEqual(['AVAILABLE', 'AVAILABLE']);
    expect((await f.shows.findOne(f.ids.sat, at(5))).seats.available).toBe(12);
  });

  it('holds all seats or none: one taken seat refuses the request and is named', async () => {
    await hold(alice, f.ids.sat, ['A1']);

    const refused = await hold(bob, f.ids.sat, ['A2', 'A1']).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(ConflictException);
    expect((refused as Error).message).toBe('A1 is no longer available. Please pick other seats.');
    await expect(states(f.ids.sat, NOW, 'A1', 'A2')).resolves.toEqual(['HELD', 'AVAILABLE']);
    await expect(holds.current(bob, NOW)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses sold seats and live holds, and takes over a hold that lapsed', async () => {
    const taken = await hold(bob, f.ids.tonight, ['A1', 'C4', 'B3']).catch((e: unknown) => e);
    expect((taken as Error).message).toBe(
      'A1, B3 and C4 are no longer available. Please pick other seats.',
    );

    const result = await hold(bob, f.ids.tonight, ['C3']); // its old hold ran out a minute ago
    expect(result.seats.map((seat) => seat.label)).toEqual(['C3']);
    await expect(states(f.ids.tonight, NOW, 'C3')).resolves.toEqual(['HELD']);
  });

  it('keeps one hold per buyer: a new hold replaces the previous one', async () => {
    await hold(alice, f.ids.sat, ['A1', 'A2']);
    const changed = await hold(alice, f.ids.sat, ['A2', 'A3']); // overlapping seats are fine

    await expect(states(f.ids.sat, NOW, 'A1', 'A2', 'A3')).resolves.toEqual([
      'AVAILABLE',
      'HELD',
      'HELD',
    ]);
    await expect(holds.current(alice, NOW)).resolves.toMatchObject({ id: changed.id });

    // Another show replaces it too.
    await hold(alice, f.ids.late, ['A1']);
    await expect(states(f.ids.sat, NOW, 'A2', 'A3')).resolves.toEqual(['AVAILABLE', 'AVAILABLE']);
    await expect(bookings.countBy({ userId: alice, status: 'PENDING' })).resolves.toBe(1);
    await expect(f.dataSource.getRepository(BookingSeat).count()).resolves.toBe(10 + 1);
  });

  it('keeps the previous hold when the new one is refused', async () => {
    const first = await hold(alice, f.ids.sat, ['A1']);
    await hold(bob, f.ids.sat, ['B1']);

    await expect(hold(alice, f.ids.sat, ['B1'])).rejects.toBeInstanceOf(ConflictException);
    await expect(holds.current(alice, NOW)).resolves.toMatchObject({ id: first.id });
    await expect(states(f.ids.sat, NOW, 'A1', 'B1')).resolves.toEqual(['HELD', 'HELD']);
  });

  it('lets only its owner see or release a hold, and releasing frees the seats', async () => {
    const mine = await hold(alice, f.ids.sat, ['A1']);

    await expect(holds.findActive(bob, mine.id, NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(holds.release(bob, mine.id, NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(holds.findActive(alice, mine.id, NOW)).resolves.toMatchObject({ id: mine.id });

    await holds.release(alice, mine.id, NOW);
    await expect(states(f.ids.sat, NOW, 'A1')).resolves.toEqual(['AVAILABLE']);
    await expect(bookings.existsBy({ id: mine.id })).resolves.toBe(false);
    await expect(holds.release(alice, mine.id, NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(holds.current(alice, NOW)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removes unpaid holds once they lapse and puts the seats back on sale', async () => {
    const mine = await hold(alice, f.ids.sat, ['A1', 'A2']);

    // Gone for its owner the moment it lapses…
    await expect(holds.findActive(alice, mine.id, at(5))).rejects.toBeInstanceOf(NotFoundException);
    await expect(holds.release(alice, mine.id, at(5))).rejects.toBeInstanceOf(NotFoundException);
    // …and removed by the expiry sweep, with its seats and tonight's stray hold.
    await expect(holds.releaseExpired(at(4))).resolves.toBe(0);
    await expect(holds.releaseExpired(at(5))).resolves.toBe(1);

    await expect(bookings.existsBy({ id: mine.id })).resolves.toBe(false);
    await expect(
      f.dataSource.getRepository(BookingSeat).countBy({ bookingId: mine.id }),
    ).resolves.toBe(0);
    const stored = await f.dataSource.getRepository(ShowSeat).find({
      where: [
        { showId: f.ids.sat, status: 'HELD' },
        { showId: f.ids.tonight, status: 'HELD' },
      ],
    });
    expect(stored).toEqual([]); // tonight's C4 lapsed at +3 minutes as well
    // Paid bookings are untouched.
    await expect(bookings.countBy({ status: 'CONFIRMED' })).resolves.toBe(1);
  });

  it('never holds past the show start, and refuses shows that have started', async () => {
    // "late" starts at 19:30 UTC: two minutes before, the hold ends with the show's start.
    const lastMinute = new Date('2026-11-12T19:28:00Z');
    const result = await hold(alice, f.ids.late, ['A1'], lastMinute);
    expect(result.expiresAt).toBe('2026-11-12T19:30:00.000Z');

    const started = await hold(alice, f.ids.early, ['A1']).catch((e: unknown) => e);
    expect(started).toBeInstanceOf(ConflictException);
    expect((started as Error).message).toMatch(/started/);
  });

  it('rejects unknown shows and seats from another show', async () => {
    await expect(
      holds.place(alice, { showId: 'no-such-show', seatIds: ['x'] }, NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
    const [otherShowSeat] = await seatIds(f.ids.sat, 'A1');
    await expect(
      holds.place(alice, { showId: f.ids.late, seatIds: [otherShowSeat] }, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('one seat, one buyer: of many simultaneous requests for a seat, exactly one wins', async () => {
    const users = f.dataSource.getRepository(User);
    const buyers = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        users.save({ email: `rush${i}@cineseat.dev`, name: `Rush ${i}`, passwordHash: 'x' }),
      ),
    );
    const [seat] = await seatIds(f.ids.sat, 'B2');

    const results = await Promise.allSettled(
      buyers.map((buyer) => holds.place(buyer.id, { showId: f.ids.sat, seatIds: [seat] }, NOW)),
    );

    const won = results.filter((result) => result.status === 'fulfilled');
    const lost = results.filter((result) => result.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost.map((result) => result.reason)).toEqual(
      Array.from({ length: 7 }, () => expect.any(ConflictException)),
    );
    await expect(bookings.countBy({ showId: f.ids.sat })).resolves.toBe(1);
    await expect(
      f.dataSource.getRepository(BookingSeat).countBy({ showSeatId: seat }),
    ).resolves.toBe(1);
  });

  it('waits for a transaction already open on the connection instead of joining it', async () => {
    // An admin edit that takes a while and then fails: its writes roll back.
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    const adminEdit = f.dataSource
      .transaction(async (tx) => {
        await tx.insert(User, { email: 'ghost@cineseat.dev', name: 'Ghost', passwordHash: 'x' });
        await gate;
        throw new Error('admin edit failed');
      })
      .catch((e: unknown) => e);
    await new Promise((resolve) => setTimeout(resolve, 5));

    const placing = hold(alice, f.ids.sat, ['A1']);
    await new Promise((resolve) => setTimeout(resolve, 20));
    finish();

    const [failure, placed] = await Promise.all([adminEdit, placing]);
    expect((failure as Error).message).toBe('admin edit failed');
    // The hold did not ride along in the failed transaction: it is there, the ghost is not.
    await expect(holds.current(alice, NOW)).resolves.toMatchObject({ id: placed.id });
    await expect(states(f.ids.sat, NOW, 'A1')).resolves.toEqual(['HELD']);
    await expect(
      f.dataSource.getRepository(User).existsBy({ email: 'ghost@cineseat.dev' }),
    ).resolves.toBe(false);
  });

  it('lets admins change or cancel a show once its holds lapse, before any sweep', async () => {
    await hold(alice, f.ids.sat, ['A1']);
    await expect(f.shows.update(f.ids.sat, { basePrice: 45000 }, null, NOW)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      f.shows.update(f.ids.sat, { basePrice: 45000 }, null, at(5)),
    ).resolves.toMatchObject({
      priceFrom: 45000,
    });

    await hold(bob, f.ids.late, ['A1']);
    await expect(f.shows.remove(f.ids.late, null, NOW)).rejects.toBeInstanceOf(ConflictException);
    await f.shows.remove(f.ids.late, null, at(5)); // the lapsed hold no longer pins the show
    await expect(bookings.countBy({ showId: f.ids.late })).resolves.toBe(0);
  });
});
