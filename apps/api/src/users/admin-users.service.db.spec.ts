import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { AdminUserListQuerySchema, type AdminUserList } from '@cineseat/shared';
import {
  at,
  createCheckoutFlowFixture,
  type CheckoutFlowFixture,
} from '../bookings/testing/checkout-flow-fixture';
import { Notification, User } from '../database/entities';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminUsersService } from './admin-users.service';
import { UsersService } from './users.service';

const DAY = 24 * 60;

/**
 * The admin users read model and role changes, on the checkout-flow fixture's
 * accounts (bookings made through the real flow) plus one admin. Clock: 12:00
 * on 12 Nov 2026 in Dhaka.
 *
 *   account  joined   paid bookings           spent    refunded
 *   Ada      -30 d    —  (ADMIN)              —        —
 *   Buyer    -20 d    1 · tonight, 10 seats   ৳0       —         (no payment on record)
 *   Alice    -10 d    1 · Saturday, A1 A2     ৳800     —
 *   Bob       -5 d    1 · Saturday, B1        ৳500     —         (one card declined)
 *   Carol     -2 d    —  (holding C1–C3)      —        —
 *   Dave       today  —  (hold ended)         —        ৳400
 */
describe('AdminUsersService (SQLite)', () => {
  let f: CheckoutFlowFixture;
  let service: AdminUsersService;
  let ada: string;
  let buyer: string;

  const list = (input: Record<string, unknown> = {}) =>
    service.list(AdminUserListQuerySchema.parse(input));
  const names = (page: AdminUserList) => page.items.map((item) => item.name);

  beforeAll(() => Logger.overrideLogger(false));
  afterAll(() => Logger.overrideLogger(['log', 'error', 'warn', 'debug', 'verbose']));

  beforeEach(async () => {
    f = await createCheckoutFlowFixture();
    const repo = f.dataSource.getRepository(User);
    const notifications = new NotificationsService(
      f.dataSource.getRepository(Notification),
      f.lane,
    );
    service = new AdminUsersService(
      f.dataSource,
      new UsersService(repo, f.config, notifications),
      f.config,
      f.lane,
    );

    ada = (
      await repo.save({
        email: 'ada@cineseat.dev',
        name: 'Ada',
        phone: '01800000000',
        passwordHash: 'x',
        role: 'ADMIN',
      })
    ).id;
    buyer = (await repo.findOneByOrFail({ email: 'buyer@cineseat.dev' })).id;
    const joined: [string, number][] = [
      [ada, -30 * DAY],
      [buyer, -20 * DAY],
      [f.users.alice, -10 * DAY],
      [f.users.bob, -5 * DAY],
      [f.users.carol, -2 * DAY],
      [f.users.dave, -60],
    ];
    for (const [id, minutes] of joined) await repo.update({ id }, { createdAt: at(minutes) });
  });

  afterEach(() => f.destroy());

  describe('list', () => {
    it('lists every account, newest first, with what it booked and paid', async () => {
      const page = await list();
      expect(names(page)).toEqual(['Dave', 'Carol', 'Bob', 'Alice', 'Buyer', 'Ada']);
      expect(page.counts).toEqual({ all: 6, USER: 5, ADMIN: 1 });
      expect(page.total).toBe(6);

      const byName = Object.fromEntries(page.items.map((item) => [item.name, item]));
      expect(byName.Alice).toMatchObject({
        id: f.users.alice,
        email: 'alice@cineseat.dev',
        phone: '01700000001',
        role: 'USER',
        createdAt: at(-10 * DAY).toISOString(),
        stats: { paidBookings: 1, spent: 80000, refunded: 0, lastBookingAt: at(1).toISOString() },
      });
      expect(byName.Bob.stats).toEqual({
        paidBookings: 1,
        spent: 50000,
        refunded: 0,
        lastBookingAt: at(3).toISOString(),
      });
      expect(byName.Dave.stats).toEqual({
        paidBookings: 0,
        spent: 0,
        refunded: 40000,
        lastBookingAt: null,
      });
      expect(byName.Buyer.stats).toMatchObject({ paidBookings: 1, spent: 0 });
      expect(byName.Ada).toMatchObject({ role: 'ADMIN', stats: { paidBookings: 0 } });
      // Never the secret.
      expect(JSON.stringify(page)).not.toContain('passwordHash');
    });

    it('finds accounts by name, email, phone or id', async () => {
      expect(names(await list({ search: 'ALI' }))).toEqual(['Alice']);
      expect(names(await list({ search: 'carol@cineseat' }))).toEqual(['Carol']);
      expect(names(await list({ search: '0180' }))).toEqual(['Ada']);
      expect(names(await list({ search: f.users.bob }))).toEqual(['Bob']);
      expect((await list({ search: '%' })).total).toBe(0);
    });

    it('filters by role, activity and when they joined; the tabs count the rest', async () => {
      expect(names(await list({ role: 'ADMIN' }))).toEqual(['Ada']);
      expect(names(await list({ activity: 'booked' }))).toEqual(['Bob', 'Alice', 'Buyer']);
      expect(names(await list({ activity: 'never' }))).toEqual(['Dave', 'Carol', 'Ada']);
      // Bob joined 5 days before (7 Nov), Carol on the 10th, Dave today.
      expect(names(await list({ joinedFrom: '2026-11-07', joinedTo: '2026-11-10' }))).toEqual([
        'Carol',
        'Bob',
      ]);
      expect(names(await list({ joinedFrom: '2026-11-12' }))).toEqual(['Dave']);

      const page = await list({ role: 'USER', activity: 'never' });
      expect(names(page)).toEqual(['Dave', 'Carol']);
      expect(page.counts).toEqual({ all: 3, USER: 2, ADMIN: 1 });
    });

    it('sorts by name, paid bookings, spending and last booking', async () => {
      expect(names(await list({ sort: 'name' }))).toEqual([
        'Ada',
        'Alice',
        'Bob',
        'Buyer',
        'Carol',
        'Dave',
      ]);
      expect(names(await list({ sort: 'name', order: 'desc' }))[0]).toBe('Dave');
      // Ties go A–Z.
      expect(names(await list({ sort: 'bookings' })).slice(0, 3)).toEqual([
        'Alice',
        'Bob',
        'Buyer',
      ]);
      expect(names(await list({ sort: 'spent' })).slice(0, 2)).toEqual(['Alice', 'Bob']);
      // Never booked goes last, either way.
      expect(names(await list({ sort: 'lastBooking' }))).toEqual([
        'Bob',
        'Alice',
        'Buyer',
        'Ada',
        'Carol',
        'Dave',
      ]);
      expect(names(await list({ sort: 'lastBooking', order: 'asc' })).slice(0, 4)).toEqual([
        'Buyer',
        'Alice',
        'Bob',
        'Ada',
      ]);
      expect(names(await list({ order: 'asc' }))[0]).toBe('Ada');
    });

    it('pages without overlap', async () => {
      const pages = await Promise.all([1, 2].map((page) => list({ page, pageSize: 4 })));
      expect(pages.map((page) => page.items.length)).toEqual([4, 2]);
      expect(new Set(pages.flatMap(names)).size).toBe(6);
    });
  });

  describe('detail', () => {
    it('has the figures, favourites and whether the viewer may change the role', async () => {
      const alice = await service.detail(f.users.alice, ada, at(60));
      expect(alice).toMatchObject({
        name: 'Alice',
        role: 'USER',
        stats: {
          paidBookings: 1,
          tickets: 2,
          upcoming: 1,
          notCompleted: 0,
          spent: 80000,
          refunded: 0,
          firstBookingAt: at(1).toISOString(),
          lastBookingAt: at(1).toISOString(),
        },
        favourites: {
          movies: [{ id: f.ids.m1, title: 'Midnight Express', bookings: 1 }],
          theaters: [{ id: f.ids.bashundhara, name: 'CineSeat Bashundhara', bookings: 1 }],
        },
        constraints: { canChangeRole: true, roleLockedReason: null },
        history: [],
      });
      expect(Number.isNaN(Date.parse(alice.updatedAt))).toBe(false);

      const dave = await service.detail(f.users.dave, ada, at(60));
      expect(dave.stats).toMatchObject({ paidBookings: 0, tickets: 0, notCompleted: 1 });
      expect(dave.favourites).toEqual({ movies: [], theaters: [] });

      // Tonight's show has started two days on; its tickets are no longer upcoming.
      const later = await service.detail(buyer, ada, at(2 * DAY));
      expect(later.stats).toMatchObject({ tickets: 10, upcoming: 0 });
    });

    it('says why a role is locked: your own account, or the only admin', async () => {
      expect((await service.detail(ada, ada)).constraints).toEqual({
        canChangeRole: false,
        roleLockedReason: expect.stringMatching(/your own role/),
      });
      expect((await service.detail(ada, f.users.bob)).constraints).toEqual({
        canChangeRole: false,
        roleLockedReason: expect.stringMatching(/only admin/),
      });
    });

    it('404s for unknown ids', async () => {
      await expect(service.detail('nope', ada)).rejects.toThrow(NotFoundException);
    });
  });

  describe('changeRole', () => {
    it('makes an admin: recorded, the account is told, and the counts follow', async () => {
      const changed = await service.changeRole(f.users.bob, 'ADMIN', ada, at(10));
      expect(changed).toMatchObject({ id: f.users.bob, role: 'ADMIN' });
      expect((await list()).counts).toMatchObject({ USER: 4, ADMIN: 2 });

      const bob = await service.detail(f.users.bob, ada);
      expect(bob.role).toBe('ADMIN');
      expect(bob.history).toEqual([
        {
          id: expect.any(String),
          action: 'role.admin',
          fields: [],
          subject: 'Bob <bob@cineseat.dev>',
          actor: { id: ada, name: 'Ada', email: 'ada@cineseat.dev' },
          at: at(10).toISOString(),
        },
      ]);
      const told = await f.dataSource
        .getRepository(Notification)
        .findBy({ userId: f.users.bob, type: 'ACCOUNT_SECURITY' });
      expect(told).toEqual([
        expect.objectContaining({
          type: 'ACCOUNT_SECURITY',
          title: 'You are now a CineSeat admin',
        }),
      ]);

      // With two admins, Bob may take Ada's access away — and then he is the only one.
      await service.changeRole(ada, 'USER', f.users.bob, at(20));
      expect((await service.detail(ada, f.users.bob)).history.map((entry) => entry.action)).toEqual(
        ['role.user'],
      );
      await expect(service.changeRole(f.users.bob, 'USER', ada, at(30))).rejects.toThrow(
        /only admin/,
      );
    });

    it('two admins taking each other’s access at once leave one admin', async () => {
      await service.changeRole(f.users.bob, 'ADMIN', ada, at(10));
      const outcomes = await Promise.allSettled([
        service.changeRole(ada, 'USER', f.users.bob, at(20)),
        service.changeRole(f.users.bob, 'USER', ada, at(20)),
      ]);
      expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['fulfilled', 'rejected']);
      expect((await list()).counts.ADMIN).toBe(1);
    });

    it('never your own role, never the last admin; the same role changes nothing', async () => {
      await expect(service.changeRole(ada, 'USER', ada)).rejects.toThrow(ConflictException);
      await expect(service.changeRole(ada, 'USER', f.users.alice)).rejects.toThrow(/only admin/);
      await expect(service.changeRole(f.users.alice, 'ADMIN', f.users.alice)).rejects.toThrow(
        /your own role/,
      );

      const same = await service.changeRole(f.users.alice, 'USER', ada);
      expect(same.role).toBe('USER');
      expect((await service.detail(f.users.alice, ada)).history).toEqual([]);
      const told = await f.dataSource
        .getRepository(Notification)
        .countBy({ userId: f.users.alice, type: 'ACCOUNT_SECURITY' });
      expect(told).toBe(0);
      await expect(service.changeRole('nope', 'ADMIN', ada)).rejects.toThrow(NotFoundException);
    });
  });
});
