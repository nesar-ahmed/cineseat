import type { InvoiceStatus } from '@cineseat/shared';
import { CINEMA_TIME_ZONE } from '../catalog/format';

/**
 * Invoice formatting. An invoice is a formal document, so money reads the way
 * invoices write it — currency code and two decimals ("BDT 1,600.00") — from
 * the currency the API states, not the ৳ sign the rest of the site uses (which
 * the site's fonts do not even include, so it would not print reliably).
 */
export function invoiceMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
  })
    .format(minor / 100)
    .replace(/^([A-Z]{3})\s*/, '$1 '); // one normal space after the code, everywhere
}

/** The amount alone, for table columns under a currency heading: `1,600.00`. */
export function invoiceAmount(minor: number): string {
  return (minor / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "11 Nov 2026" on the cinemas' clock, like every date on the site. */
export function invoiceDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CINEMA_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

/** "11 Nov 2026, 1:38 PM". */
export function invoiceDateTime(iso: string): string {
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: CINEMA_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
  return `${invoiceDate(iso)}, ${time}`;
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  PAID: 'Paid',
  REFUNDED: 'Refunded',
};

/** Badge colours on the dark panel. */
export const STATUS_BADGE: Record<InvoiceStatus, string> = {
  PAID: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  REFUNDED: 'border-white/15 bg-white/[0.04] text-ink-300',
};
