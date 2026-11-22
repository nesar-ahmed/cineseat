import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminTheaterListQuerySchema, type AdminTheaterList } from '@cineseat/shared';
import { Booking, Payment, User } from '../database/entities';
import { AdminShowsService } from '../shows/admin-shows.service';
import {
  NOW,
  createScheduleFixture,
  type ScheduleFixture,
} from '../shows/testing/schedule-fixture';
import { AdminTheatersService } from './admin-theaters.service';

const names = (page: AdminTheaterList) => page.items.map((theater) => theater.name);

/**
 * The theaters read model and the audited theater/screen writes, on the
 * schedule fixture (clock: 12:00 on 12 Nov 2026 in Dhaka):
 *
 *   CineSeat Bashundhara (Dhaka)    Screen 1 — 3×4, 1 premium + 1 recliner row, 2D+3D
 *     tonight 19:00 (3D, 10 sold + 1 live hold, paid ৳5,000) · Sat 14 Nov 12:00 (2D)
 *   CineSeat Agargaon (Chattogram)  Screen 1 — 2×3, 2D
 *     10:00 today (started) · 01:30 on the 13th
 */
describe('AdminTheatersService (SQLite)', () => {
  let f: ScheduleFixture;
  let service: AdminTheatersService;
  let adminId: string;

  const list = (input: Record<string, unknown> = {}) =>
    service.list(AdminTheaterListQuerySchema.parse(input), NOW);

  beforeEach(async () => {
    f = await createScheduleFixture();
    const repo = f.dataSource.getRepository.bind(f.dataSource);
    service = new AdminTheatersService(
      f.dataSource,
      new AdminShowsService(f.dataSource, f.shows, f.config),
      f.config,
    );
    adminId = (
      await repo(User).save({
        email: 'ops@cineseat.dev',
        name: 'Olu Ops',
        role: 'ADMIN',
        passwordHash: 'x',
      })
    ).id;
    const booking = await repo(Booking).findOneByOrFail({ showId: f.ids.tonight });
    await repo(Payment).insert({
      bookingId: booking.id,
      providerRef: 'ref-ok',
      status: 'SUCCESS',
      amount: 500000,
      userId: booking.userId,
      completedAt: NOW,
    });
  });

  afterEach(() => f.destroy());

  describe('list', () => {
    it('lists cinemas by city with screens, today and all-time figures', async () => {
      const page = await list();
      expect(names(page)).toEqual(['CineSeat Agargaon', 'CineSeat Bashundhara']);
      expect(page.counts).toEqual({
        all: 2,
        cities: [
          { city: 'Chattogram', count: 1 },
          { city: 'Dhaka', count: 1 },
        ],
      });
      const [agargaon, bashundhara] = page.items;
      expect(bashundhara).toMatchObject({
        city: 'Dhaka',
        amenities: ['Recliner row', '3D'],
        formats: ['2D', '3D'],
        screens: [{ id: f.ids.screenB, name: 'Screen 1', formats: ['2D', '3D'], seats: 12 }],
        seatCount: 12,
        today: { shows: 1, movies: 1 },
        stats: {
          shows: 2,
          upcomingShows: 2,
          nextShowAt: '2026-11-12T13:00:00.000Z',
          ticketsSold: 10,
          revenue: 500000,
          // Seats sold over seats on sale in shows that have not started (tonight + Saturday).
          occupancy: { sold: 10, capacity: 24 },
        },
      });
      // The 10:00 show counts today; the 01:30 one is tomorrow in Dhaka.
      expect(agargaon).toMatchObject({
        today: { shows: 1, movies: 1 },
        stats: { shows: 2, upcomingShows: 1, occupancy: { sold: 0, capacity: 6 } },
      });
    });

    it('filters by city, amenity, screen format and schedule', async () => {
      const dhaka = await list({ city: 'dhaka' });
      expect(names(dhaka)).toEqual(['CineSeat Bashundhara']);
      expect(dhaka.total).toBe(1);
      // City tabs keep counting the other cities.
      expect(dhaka.counts.all).toBe(2);
      expect(names(await list({ amenity: '3d' }))).toEqual(['CineSeat Bashundhara']);
      expect(names(await list({ format: '3D' }))).toEqual(['CineSeat Bashundhara']);
      await f.theaters.create(
        { name: 'CineSeat Sylhet', city: 'Sylhet', address: 'Zindabazar', amenities: [] },
        null,
      );
      expect(names(await list({ schedule: 'unscheduled' }))).toEqual(['CineSeat Sylhet']);
      expect((await list({ schedule: 'scheduled' })).total).toBe(2);
    });

    it('searches name, city, address, amenities, screens or an exact id', async () => {
      expect(names(await list({ search: 'rupgan' }))).toEqual(['CineSeat Bashundhara']);
      expect(names(await list({ search: 'CHATTO' }))).toEqual(['CineSeat Agargaon']);
      expect((await list({ search: 'screen 1' })).total).toBe(2);
      expect(names(await list({ search: f.ids.agargaon }))).toEqual(['CineSeat Agargaon']);
    });

    it('sorts by any figure, both ways', async () => {
      expect(names(await list({ sort: 'tickets' }))[0]).toBe('CineSeat Bashundhara');
      expect(names(await list({ sort: 'occupancy', order: 'asc' }))[0]).toBe('CineSeat Agargaon');
      expect(names(await list({ sort: 'name', order: 'desc' }))).toEqual([
        'CineSeat Bashundhara',
        'CineSeat Agargaon',
      ]);
      expect(names(await list({ sort: 'seats' }))[0]).toBe('CineSeat Bashundhara');
    });
  });

  describe('detail', () => {
    it('has every screen with its layout, figures and limits, and the next shows', async () => {
      const detail = await service.detail(f.ids.bashundhara, NOW);
      expect(detail.screens).toEqual([
        {
          id: f.ids.screenB,
          name: 'Screen 1',
          rows: 3,
          cols: 4,
          premiumRows: 1,
          reclinerRows: 1,
          formats: ['2D', '3D'],
          seatCounts: { total: 12, STANDARD: 4, PREMIUM: 4, RECLINER: 4 },
          stats: {
            shows: 2,
            upcomingShows: 2,
            nextShowAt: '2026-11-12T13:00:00.000Z',
            ticketsSold: 10,
            revenue: 500000,
            occupancy: { sold: 10, capacity: 24 },
          },
          constraints: {
            canDelete: false,
            deleteBlockedReason: 'Screen 1 has 2 shows. Remove them before deleting the screen.',
            layoutLocked: true,
            layoutLockedReason: 'Screen 1 has 2 shows; its seat layout can no longer change.',
            formatsInUse: ['2D', '3D'],
          },
        },
      ]);
      expect(detail.upcoming.map((show) => show.id)).toEqual([f.ids.tonight, f.ids.sat]);
      expect(detail.constraints).toEqual({
        canDelete: false,
        deleteBlockedReason:
          'CineSeat Bashundhara has 2 shows. Remove them before deleting the theater.',
      });
      expect(detail).not.toHaveProperty('screens.0.seats');
    });

    it('404s for unknown ids', async () => {
      await expect(service.detail('nope', NOW)).rejects.toThrow(NotFoundException);
    });
  });

  describe('audited writes', () => {
    const history = async (id: string) =>
      (await service.detail(id, NOW)).history.map(({ action, fields, subject }) =>
        [action, fields.join(','), subject].filter(Boolean).join(' '),
      );

    it('records the theater and its screens — deleted screens included — with who did it', async () => {
      const sylhet = await f.theaters.create(
        { name: 'CineSeat Sylhet', city: 'Sylhet', address: 'Zindabazar', amenities: [] },
        adminId,
        NOW,
      );
      const screen = await f.theaters.createScreen(
        sylhet.id,
        { name: 'Screen 9', rows: 2, cols: 2, premiumRows: 0, reclinerRows: 0, formats: ['2D'] },
        adminId,
        NOW,
      );
      await f.theaters.updateScreen(
        screen.id,
        { name: 'Screen 10', formats: ['2D', '3D'] },
        adminId,
        NOW,
      );
      await f.theaters.update(sylhet.id, { address: 'Zindabazar Point' }, adminId, NOW);
      await f.theaters.removeScreen(screen.id, adminId, NOW);

      expect(await history(sylhet.id)).toEqual([
        'screen.delete Screen 10',
        'update address CineSeat Sylhet',
        'screen.update name,formats Screen 10',
        'screen.create Screen 9',
        'create CineSeat Sylhet',
      ]);
      const [latest] = (await service.detail(sylhet.id, NOW)).history;
      expect(latest.actor).toEqual({ id: adminId, name: 'Olu Ops', email: 'ops@cineseat.dev' });
    });

    it('treats unchanged values as a no-op, even where a change would be refused', async () => {
      await f.theaters.update(
        f.ids.bashundhara,
        { name: 'CineSeat Bashundhara', amenities: ['Recliner row', '3D'] },
        adminId,
        NOW,
      );
      // Screen 1 has shows, so a new layout is refused — but sending its own layout changes nothing.
      await expect(
        f.theaters.updateScreen(
          f.ids.screenB,
          { rows: 3, cols: 4, premiumRows: 1, reclinerRows: 1, formats: ['3D', '2D'] },
          adminId,
          NOW,
        ),
      ).resolves.toMatchObject({ rows: 3, cols: 4 });
      await expect(
        f.theaters.updateScreen(
          f.ids.screenB,
          { rows: 3, cols: 4, premiumRows: 2, reclinerRows: 1 },
          adminId,
          NOW,
        ),
      ).rejects.toThrow(/^rows: Screen 1 has 2 shows; its seat layout can no longer change\.$/);
      expect(await history(f.ids.bashundhara)).toEqual([]);
    });

    it('keeps theater names unique and a city spelled one way', async () => {
      const taken = await f.theaters
        .create(
          { name: 'cineseat bashundhara', city: 'Dhaka', address: 'X', amenities: [] },
          adminId,
          NOW,
        )
        .catch((e: unknown) => e);
      expect(taken).toBeInstanceOf(ConflictException);
      expect((taken as Error).message).toBe(
        'name: There is already a theater called “CineSeat Bashundhara”.',
      );

      const gulshan = await f.theaters.create(
        { name: 'CineSeat Gulshan', city: 'dhaka', address: 'Gulshan 1', amenities: [] },
        adminId,
        NOW,
      );
      expect(gulshan.city).toBe('Dhaka');
      await expect(
        f.theaters.update(gulshan.id, { name: 'CineSeat Agargaon' }, adminId, NOW),
      ).rejects.toThrow(/^name: There is already a theater called/);
      // The only theater in a city may fix its spelling.
      await expect(
        f.theaters.update(f.ids.agargaon, { city: 'CHATTOGRAM' }, adminId, NOW),
      ).resolves.toMatchObject({ city: 'CHATTOGRAM' });
      await expect(
        f.theaters.createScreen(
          gulshan.id,
          { name: 'A', rows: 1, cols: 1, premiumRows: 0, reclinerRows: 0, formats: ['2D'] },
          adminId,
          NOW,
        ),
      ).resolves.toMatchObject({ name: 'A' });
      await expect(
        f.theaters.createScreen(
          gulshan.id,
          { name: 'a', rows: 1, cols: 1, premiumRows: 0, reclinerRows: 0, formats: ['2D'] },
          adminId,
          NOW,
        ),
      ).rejects.toThrow(/^name: This theater already has a screen called “A”\.$/);
    });
  });
});
