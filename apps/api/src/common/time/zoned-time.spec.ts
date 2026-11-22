import { addDays, dateInZone, dayRangeInZone, instantInZone, startOfDayInZone } from './zoned-time';

describe('zoned time', () => {
  it('finds local midnight in a fixed-offset zone (Dhaka, UTC+6)', () => {
    expect(startOfDayInZone('2026-11-12', 'Asia/Dhaka').toISOString()).toBe(
      '2026-11-11T18:00:00.000Z',
    );
    const { start, end } = dayRangeInZone('2026-11-12', 'Asia/Dhaka');
    expect(end.getTime() - start.getTime()).toBe(24 * 3600 * 1000);
  });

  it('handles daylight-saving days (New York: 23h in spring, 25h in autumn)', () => {
    const spring = dayRangeInZone('2026-03-08', 'America/New_York');
    expect(spring.start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect((spring.end.getTime() - spring.start.getTime()) / 3600000).toBe(23);
    const autumn = dayRangeInZone('2026-11-01', 'America/New_York');
    expect((autumn.end.getTime() - autumn.start.getTime()) / 3600000).toBe(25);
  });

  it('reads the local calendar date of an instant', () => {
    // 20:30 UTC is already the next morning in Dhaka.
    expect(dateInZone(new Date('2026-11-10T20:30:00Z'), 'Asia/Dhaka')).toBe('2026-11-11');
    expect(dateInZone(new Date('2026-11-10T20:30:00Z'), 'UTC')).toBe('2026-11-10');
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-11-10', -10)).toBe('2026-10-31');
  });

  it('turns a local date and clock time into an instant', () => {
    expect(instantInZone('2026-11-14', '18:00', 'Asia/Dhaka').toISOString()).toBe(
      '2026-11-14T12:00:00.000Z',
    );
    // 01:30 in Dhaka is still the previous evening in UTC.
    expect(instantInZone('2026-11-13', '01:30', 'Asia/Dhaka').toISOString()).toBe(
      '2026-11-12T19:30:00.000Z',
    );
    // New York: EDT (UTC−4) in summer, EST (UTC−5) after the November switch.
    expect(instantInZone('2026-07-01', '09:00', 'America/New_York').toISOString()).toBe(
      '2026-07-01T13:00:00.000Z',
    );
    expect(instantInZone('2026-11-02', '09:00', 'America/New_York').toISOString()).toBe(
      '2026-11-02T14:00:00.000Z',
    );
  });
});
