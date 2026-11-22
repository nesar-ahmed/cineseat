import type { Invoice } from '@cineseat/shared';
import { LogoMark } from '../../components/ui/icons';
import { dayInfo, time12 } from '../catalog/format';
import { invoiceAmount, invoiceDate, invoiceDateTime, invoiceMoney } from './format';

/**
 * The invoice itself, as a sheet of paper: light, print-ready, and the same on
 * screen as on paper (the page around it hides itself when printing). Every
 * figure comes from GET /invoices/:id — nothing is recalculated here.
 */
export function InvoiceDocument({ invoice }: { invoice: Invoice }) {
  const { seller, buyer, show } = invoice;
  const money = (minor: number) => invoiceMoney(minor, invoice.currency);
  const paid = invoice.status === 'PAID';

  return (
    <article
      aria-label={`Invoice ${invoice.number}`}
      className="invoice-paper relative overflow-hidden rounded-3xl bg-white text-[13px] leading-relaxed text-ink-800 shadow-lift print:rounded-none print:shadow-none"
    >
      {/* A thin brand band along the top edge. */}
      <div
        aria-hidden="true"
        className="h-1.5 bg-gradient-to-r from-brand-500 via-brand-400 to-gold-400"
      />

      <div className="px-6 py-8 sm:px-10 sm:py-10">
        {/* Header: who, what, which */}
        <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-2.5">
              <LogoMark />
              <span className="font-display text-xl font-semibold tracking-tight text-ink-950">
                Cine<span className="text-brand-600">Seat</span>
              </span>
            </p>
            <address className="mt-4 not-italic text-ink-500">
              <span className="block font-semibold text-ink-800">{seller.name}</span>
              {seller.addressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
              <span className="block">
                {seller.city}, {seller.country}
              </span>
              <span className="block">
                {seller.email} · {seller.website}
              </span>
            </address>
          </div>
          <div className="sm:text-right">
            <h2 className="font-sans text-[11px] font-bold uppercase tracking-[0.3em] text-ink-400">
              Invoice
            </h2>
            <p className="mt-1 font-mono text-lg font-bold tracking-wide text-ink-950">
              {invoice.number}
            </p>
            <p
              className={`mt-3 inline-flex -rotate-2 items-center rounded-md border-2 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.25em] ${
                paid ? 'border-emerald-600 text-emerald-700' : 'border-ink-400 text-ink-500'
              }`}
            >
              {paid ? 'Paid' : 'Refunded'}
            </p>
          </div>
        </header>

        {/* Parties and references */}
        <dl className="mt-8 grid gap-6 border-y border-ink-100 py-6 sm:grid-cols-3">
          <div>
            <dt className={LABEL}>Billed to</dt>
            <dd className="mt-1.5 font-semibold text-ink-900">{buyer.name}</dd>
            <dd className="text-ink-500">{buyer.email}</dd>
            {buyer.phone ? <dd className="text-ink-500">{buyer.phone}</dd> : null}
          </div>
          <div>
            <dt className={LABEL}>Issued</dt>
            <dd className="mt-1.5 font-semibold text-ink-900">{invoiceDate(invoice.issuedAt)}</dd>
            <dt className={`${LABEL} mt-4`}>Booking</dt>
            <dd className="mt-1.5 font-mono font-semibold text-ink-900">{invoice.bookingCode}</dd>
          </div>
          <div>
            <dt className={LABEL}>Payment</dt>
            <dd className="mt-1.5 font-semibold text-ink-900">
              {invoice.payment.method ?? 'Card'}
            </dd>
            {invoice.payment.paidAt ? (
              <dd className="text-ink-500">
                {paid ? 'Paid' : 'Received'} {invoiceDateTime(invoice.payment.paidAt)}
              </dd>
            ) : null}
          </div>
        </dl>

        {/* What the money was for */}
        <section aria-label="Show" className="mt-6">
          <p className={LABEL}>Show</p>
          <p className="mt-1.5 text-base font-semibold text-ink-950">
            {show.movie.title}{' '}
            <span className="font-normal text-ink-500">
              · {show.format} · {show.language} · {show.movie.certificate}
            </span>
          </p>
          <p className="text-ink-600">
            {dayInfo(show.date).long} {show.date.slice(0, 4)} · {time12(show.time)} ·{' '}
            {show.theater.name}, {show.screen.name} · {show.theater.address}, {show.theater.city}
          </p>
        </section>

        {/* Charge lines */}
        <table className="mt-6 w-full text-left">
          <caption className="sr-only">Charges</caption>
          <thead>
            <tr className="border-b-2 border-ink-900 text-[11px] uppercase tracking-[0.14em] text-ink-500">
              <th scope="col" className="py-2.5 pr-3 font-semibold">
                Description
              </th>
              <th scope="col" className="hidden py-2.5 pr-3 font-semibold sm:table-cell">
                Seats
              </th>
              <th scope="col" className="py-2.5 pr-3 text-right font-semibold">
                Qty
              </th>
              <th scope="col" className="hidden py-2.5 pr-3 text-right font-semibold sm:table-cell">
                Unit price
              </th>
              <th scope="col" className="py-2.5 text-right font-semibold">
                Amount ({invoice.currency})
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={`${line.category}-${line.unitPrice}`} className="border-b border-ink-100">
                <td className="py-3 pr-3">
                  <span className="font-semibold text-ink-900">{line.description}</span>
                  {/* Seats under the description where there is no room for their own column. */}
                  <span className="block text-xs text-ink-500 sm:hidden">
                    {line.seats.join(', ')} · {invoiceAmount(line.unitPrice)} each
                  </span>
                </td>
                <td className="hidden py-3 pr-3 text-ink-600 sm:table-cell">
                  {line.seats.join(', ')}
                </td>
                <td className="py-3 pr-3 text-right tabular-nums">{line.quantity}</td>
                <td className="hidden py-3 pr-3 text-right tabular-nums sm:table-cell">
                  {invoiceAmount(line.unitPrice)}
                </td>
                <td className="py-3 text-right font-semibold tabular-nums text-ink-900">
                  {invoiceAmount(line.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <dl className="ml-auto mt-5 w-full max-w-xs space-y-2">
          <Total label="Subtotal" value={money(invoice.subtotal)} />
          {invoice.discount > 0 ? (
            <Total
              label={invoice.coupon ? `Offer ${invoice.coupon.code}` : 'Discount'}
              hint={invoice.coupon?.description ?? undefined}
              value={`−${money(invoice.discount)}`}
              tone="text-emerald-700"
            />
          ) : null}
          <div className="border-t-2 border-ink-900 pt-2">
            <Total label="Total" value={money(invoice.total)} strong />
          </div>
          <Total label="Amount paid" value={money(invoice.amountPaid)} />
          {invoice.amountRefunded > 0 ? (
            <Total label="Refunded" value={money(invoice.amountRefunded)} />
          ) : null}
        </dl>

        {/* Refunds and the payment trail */}
        {invoice.refunds.length > 0 ? (
          <section aria-label="Refunds" className="mt-8 rounded-2xl bg-ink-50 p-4">
            <p className={LABEL}>Refunds</p>
            <ul className="mt-2 space-y-1.5">
              {invoice.refunds.map((refund, index) => (
                <li key={index} className="flex flex-wrap justify-between gap-x-4 text-ink-600">
                  <span>
                    {refundReason(refund.reason)}
                    {refund.refundedAt ? ` — ${invoiceDateTime(refund.refundedAt)}` : ''}
                  </span>
                  <span className="whitespace-nowrap font-semibold tabular-nums text-ink-900">
                    {money(refund.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="mt-8 border-t border-ink-100 pt-5 text-xs text-ink-500">
          <p>
            Payment reference <span className="font-mono">{invoice.payment.reference}</span> via{' '}
            {invoice.payment.provider === 'mock' ? 'CineSeat Test Pay' : invoice.payment.provider}.
          </p>
          <ul className="mt-2 space-y-1">
            {invoice.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <p className="mt-4 font-semibold text-ink-700">Thank you for watching with CineSeat.</p>
        </footer>
      </div>
    </article>
  );
}

const LABEL = 'text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400';

/** "Refunded: this booking was already paid." → "This booking was already paid." */
function refundReason(reason: string | null): string {
  const text = reason?.replace(/^Refunded:\s*/, '').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : 'Refunded';
}

function Total({
  label,
  value,
  hint,
  strong = false,
  tone = '',
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
  tone?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${tone}`}>
      <dt className={strong ? 'font-bold text-ink-950' : tone ? '' : 'text-ink-500'}>
        {label}
        {hint ? <span className="block text-xs font-normal text-ink-400">{hint}</span> : null}
      </dt>
      <dd
        className={`whitespace-nowrap text-right tabular-nums ${strong ? 'text-lg font-bold text-ink-950' : 'font-semibold'}`}
      >
        {value}
      </dd>
    </div>
  );
}
