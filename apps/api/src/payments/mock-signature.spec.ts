import { signMockEvent, verifyMockSignature } from './mock-signature';

const SECRET = 'test-only-mock-payment-secret';
const NOW = new Date('2026-11-12T06:00:00Z');
const BODY = JSON.stringify({ id: 'evt_1', type: 'payment.succeeded', data: { amount: 80000 } });

describe('mock webhook signatures', () => {
  it('accepts exactly what was signed, recently, with the shared secret', () => {
    const header = signMockEvent(SECRET, BODY, NOW);
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(verifyMockSignature(SECRET, header, BODY, NOW)).toBe(true);
    expect(
      verifyMockSignature(SECRET, header, Buffer.from(BODY), new Date(NOW.getTime() + 60_000)),
    ).toBe(true);
  });

  it('rejects a changed body, another secret, an old timestamp and garbage', () => {
    const header = signMockEvent(SECRET, BODY, NOW);
    expect(verifyMockSignature(SECRET, header, BODY.replace('80000', '1'), NOW)).toBe(false);
    expect(verifyMockSignature('another-secret-entirely', header, BODY, NOW)).toBe(false);
    expect(verifyMockSignature(SECRET, header, BODY, new Date(NOW.getTime() + 6 * 60_000))).toBe(
      false,
    );
    expect(verifyMockSignature(SECRET, undefined, BODY, NOW)).toBe(false);
    expect(verifyMockSignature(SECRET, 't=abc,v1=zz', BODY, NOW)).toBe(false);
    expect(verifyMockSignature(SECRET, header.replace(/v1=./, 'v1=0'), BODY, NOW)).toBe(false);
  });
});
