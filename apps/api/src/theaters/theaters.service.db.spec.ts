import { ConflictException, NotFoundException } from '@nestjs/common';
import { Seat } from '../database/entities';
import {
  NOW,
  createScheduleFixture,
  type ScheduleFixture,
} from '../shows/testing/schedule-fixture';

describe('TheatersService (SQLite)', () => {
  let fx: ScheduleFixture;
  beforeAll(async () => {
    fx = await createScheduleFixture();
  });
  afterAll(() => fx.destroy());

  it('lists cinemas with counts for the cards, today in Dhaka', async () => {
    const list = await fx.theaters.list({}, NOW);
    expect(list.map((theater) => theater.name)).toEqual([
      'CineSeat Agargaon',
      'CineSeat Bashundhara',
    ]);
    expect(list[1]).toMatchObject({
      city: 'Dhaka',
      amenities: ['Recliner row', '3D'],
      screenCount: 1,
      seatCount: 12,
      today: { shows: 1, movies: 1 },
    });
    // Agargaon: this morning's show counts as today; the 01:30 show belongs to tomorrow.
    expect(list[0].today).toEqual({ shows: 1, movies: 1 });
    expect((await fx.theaters.list({ city: 'dhaka' }, NOW)).map((theater) => theater.name)).toEqual(
      ['CineSeat Bashundhara'],
    );
  });

  it('details a cinema with its screens and seat counts per tier', async () => {
    const detail = await fx.theaters.findOne(fx.ids.bashundhara, NOW);
    expect(detail.screens).toEqual([
      expect.objectContaining({
        name: 'Screen 1',
        rows: 3,
        cols: 4,
        formats: ['2D', '3D'],
        seatCounts: { total: 12, STANDARD: 4, PREMIUM: 4, RECLINER: 4 },
      }),
    ]);
    await expect(fx.theaters.findOne('nope', NOW)).rejects.toThrow(NotFoundException);
  });

  it('generates seats from a layout: lettered rows, recliners at the back', async () => {
    const screen = await fx.theaters.createScreen(
      fx.ids.agargaon,
      {
        name: 'Screen 2',
        rows: 4,
        cols: 2,
        premiumRows: 2,
        reclinerRows: 1,
        formats: ['2D'],
      },
      null,
    );
    expect(screen.layout.map((seat) => `${seat.label}:${seat.category[0]}`)).toEqual([
      'A1:S',
      'A2:S',
      'B1:P',
      'B2:P',
      'C1:P',
      'C2:P',
      'D1:R',
      'D2:R',
    ]);
    expect(screen.seatCounts).toEqual({ total: 8, STANDARD: 2, PREMIUM: 4, RECLINER: 2 });

    await expect(
      fx.theaters.createScreen(
        fx.ids.agargaon,
        {
          name: 'screen 2',
          rows: 1,
          cols: 1,
          premiumRows: 0,
          reclinerRows: 0,
          formats: ['2D'],
        },
        null,
      ),
    ).rejects.toThrow(/already has a screen/);
    await expect(
      fx.theaters.createScreen(
        'nope',
        {
          name: 'X',
          rows: 1,
          cols: 1,
          premiumRows: 0,
          reclinerRows: 0,
          formats: ['2D'],
        },
        null,
      ),
    ).rejects.toThrow(NotFoundException);

    // No shows yet, so the layout can still change — and the seats are rebuilt.
    const resized = await fx.theaters.updateScreen(
      screen.id,
      { rows: 2, cols: 3, premiumRows: 0, reclinerRows: 1 },
      null,
      NOW,
    );
    expect(resized.layout.map((seat) => seat.label)).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
    await expect(fx.dataSource.getRepository(Seat).countBy({ screenId: screen.id })).resolves.toBe(
      6,
    );

    await fx.theaters.removeScreen(screen.id, null);
    await expect(fx.dataSource.getRepository(Seat).countBy({ screenId: screen.id })).resolves.toBe(
      0,
    );
  });

  it('protects screens that have shows', async () => {
    await expect(
      fx.theaters.updateScreen(fx.ids.screenB, { name: 'Screen One' }, null, NOW),
    ).resolves.toMatchObject({ name: 'Screen One' });
    await expect(
      fx.theaters.updateScreen(
        fx.ids.screenB,
        { rows: 4, cols: 4, premiumRows: 1, reclinerRows: 1 },
        null,
        NOW,
      ),
    ).rejects.toThrow(/layout can no longer change/);
    // Tonight's show is 3D, so the screen cannot stop supporting 3D.
    await expect(
      fx.theaters.updateScreen(fx.ids.screenB, { formats: ['2D'] }, null, NOW),
    ).rejects.toThrow(ConflictException);
    await expect(fx.theaters.removeScreen(fx.ids.screenB, null)).rejects.toThrow(/has 2 shows/);
  });

  it('creates, edits and deletes a cinema — but not one with shows', async () => {
    const created = await fx.theaters.create(
      {
        name: 'CineSeat Sylhet',
        city: 'Sylhet',
        address: 'Zindabazar',
        amenities: ['Parking'],
      },
      null,
    );
    expect(created).toMatchObject({
      screenCount: 0,
      seatCount: 0,
      screens: [],
      today: { shows: 0, movies: 0 },
    });
    await expect(
      fx.theaters.update(created.id, { amenities: ['Parking', 'Food court'] }, null),
    ).resolves.toMatchObject({ amenities: ['Parking', 'Food court'] });
    await fx.theaters.remove(created.id, null);
    await expect(fx.theaters.findOne(created.id, NOW)).rejects.toThrow(NotFoundException);
    await expect(fx.theaters.remove(fx.ids.bashundhara, null)).rejects.toThrow(/has 2 shows/);
  });
});
