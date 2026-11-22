'use client';

import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  MOCK_TEST_CARDS,
  MOCK_WALLET_CODES,
  MockPayInputSchema,
  type MockGatewaySession,
  type MockPayInput,
  type MockPayResult,
} from '@cineseat/shared';
import { CheckIcon, CloseIcon, ShieldIcon } from '../../components/ui/icons';
import { useHydrated } from '../../hooks/use-hydrated';
import { ApiClientError, cancelMockSession, getMockSession, payMockSession } from '../../lib/api';
import { money } from '../catalog/format';
import { clock, useCountdown } from '../seats/use-countdown';

type Method = MockPayInput['method'];
const METHODS: { id: Method; label: string }[] = [
  { id: 'CARD', label: 'Card' },
  { id: 'BKASH', label: 'bKash' },
  { id: 'NAGAD', label: 'Nagad' },
];

/** Seconds before the page sends the buyer back to the merchant on its own. */
const RETURN_AFTER = 4;

/**
 * CineSeat Test Pay — the hosted payment page of the mock gateway. It plays a
 * third-party provider's page (own look, no CineSeat chrome, no CineSeat
 * session) and moves no money: only the test cards and codes listed on it are
 * accepted. The merchant learns the outcome from the gateway's webhook; this
 * page only sends the buyer back. It renders inside the root layout's <main>.
 */
export function GatewayPage({ reference }: { reference: string }) {
  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 [color-scheme:light]">
      <p className="bg-amber-400 px-4 py-2 text-center text-xs font-semibold text-amber-950">
        TEST MODE — no real money moves and real cards are not accepted. Use the test data below.
      </p>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-2.5 px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <ShieldIcon className="h-4 w-4" />
          </span>
          <span className="text-sm font-bold tracking-tight">CineSeat Test Pay</span>
          <span className="ml-auto text-xs text-slate-500">Simulated secure checkout</span>
        </div>
      </header>
      {useHydrated() ? <Gateway reference={reference} /> : <Skeleton />}
    </div>
  );
}

function Gateway({ reference }: { reference: string }) {
  const session = useQuery({
    queryKey: ['mock-session', reference],
    queryFn: () => getMockSession(reference),
    retry: false,
    staleTime: 0,
  });
  const [result, setResult] = useState<MockPayResult | null>(null);

  if (result) return <Result result={result} />;
  if (session.isPending) return <Skeleton />;
  if (session.isError) {
    const missing = session.error instanceof ApiClientError && session.error.status === 404;
    return (
      <Notice
        title={missing ? 'Payment session not found' : 'Couldn’t reach the test gateway'}
        body={
          missing ? 'This link is not valid. Start again from CineSeat.' : session.error.message
        }
        action={
          missing ? (
            <a href="/" className={LIGHT_BUTTON}>
              Go to CineSeat
            </a>
          ) : (
            <button type="button" onClick={() => void session.refetch()} className={LIGHT_BUTTON}>
              Try again
            </button>
          )
        }
      />
    );
  }
  const data = session.data;
  if (data.status !== 'OPEN') {
    return (
      <Notice
        title={
          data.status === 'COMPLETED'
            ? 'This payment is already complete'
            : 'This payment session has expired'
        }
        body={
          data.status === 'COMPLETED'
            ? 'Nothing more to do here.'
            : 'The seat hold it belonged to has ended. Go back to CineSeat to try again.'
        }
        action={
          <a href={data.returnUrl} className={LIGHT_BUTTON}>
            Return to CineSeat
          </a>
        }
      />
    );
  }
  return <PayForm session={data} onDone={setResult} onStale={() => void session.refetch()} />;
}

// ── The form ──────────────────────────────────────────────────────────────────

function PayForm({
  session,
  onDone,
  onStale,
}: {
  session: MockGatewaySession;
  onDone: (result: MockPayResult) => void;
  /** The session changed under us (paid elsewhere, expired): reload it. */
  onStale: () => void;
}) {
  const id = useId();
  const [method, setMethod] = useState<Method>('CARD');
  const [card, setCard] = useState({ cardNumber: '', expiry: '', cvc: '', name: '' });
  const [wallet, setWallet] = useState({ wallet: '', otp: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const secondsLeft = useCountdown(session.expiresAt, onStale);

  const fail = (error: unknown) => {
    if (error instanceof ApiClientError && (error.status === 409 || error.status === 410)) {
      onStale();
      return;
    }
    const fields: Record<string, string> = {};
    const rest: string[] = [];
    for (const message of error instanceof ApiClientError
      ? error.messages
      : [(error as Error).message]) {
      const match = /^(\w+): (.*)$/.exec(message);
      if (match) fields[match[1]] = match[2];
      else rest.push(message);
    }
    setErrors(fields);
    setFormError(rest[0] ?? null);
  };
  const pay = useMutation({
    mutationFn: (input: MockPayInput) => payMockSession(session.ref, input),
    onSuccess: onDone,
    onError: fail,
  });
  const cancel = useMutation({
    mutationFn: () => cancelMockSession(session.ref),
    onSuccess: onDone,
    onError: fail,
  });
  const busy = pay.isPending || cancel.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const parsed = MockPayInputSchema.safeParse(
      method === 'CARD' ? { method, ...card } : { method, ...wallet },
    );
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
        ),
      );
      return;
    }
    setErrors({});
    pay.mutate(parsed.data);
  };

  const fillCard = (number: string) => {
    setCard((current) => ({
      cardNumber: groupDigits(number),
      expiry: '12/34',
      cvc: '123',
      name: current.name || 'Test Buyer',
    }));
    setErrors({});
  };

  return (
    <div className="mx-auto grid max-w-4xl gap-6 px-5 py-8 md:grid-cols-[1fr_1.25fr] md:py-12">
      <section aria-labelledby={`${id}-order`} className="md:pt-2">
        <h1 className="text-sm font-normal text-slate-600">Pay {session.merchant}</h1>
        <p id={`${id}-order`} className="mt-1 text-4xl font-bold tracking-tight tabular-nums">
          {money(session.amount)}
        </p>
        <p className="mt-3 text-sm text-slate-700">{session.description}</p>
        {secondsLeft !== null ? (
          <p
            className={`mt-5 inline-flex rounded-full px-3 py-1 text-xs font-semibold tabular-nums ${secondsLeft <= 60 ? 'bg-amber-100 text-amber-900' : 'bg-slate-200 text-slate-700'}`}
          >
            Session expires in {clock(secondsLeft)}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => cancel.mutate()}
          disabled={busy}
          className="mt-6 block text-sm font-semibold text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline disabled:opacity-50"
        >
          ← Cancel and return to {session.merchant}
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-3 gap-2">
          {METHODS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={method === item.id}
              onClick={() => {
                setMethod(item.id);
                setErrors({});
                setFormError(null);
              }}
              className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                method === item.id
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} noValidate className="mt-5 space-y-4">
          {method === 'CARD' ? (
            <>
              <Field id={`${id}-number`} label="Card number" error={errors.cardNumber}>
                <input
                  id={`${id}-number`}
                  inputMode="numeric"
                  autoComplete="cc-number"
                  placeholder="4242 4242 4242 4242"
                  value={card.cardNumber}
                  onChange={(event) =>
                    setCard({ ...card, cardNumber: groupDigits(event.target.value) })
                  }
                  {...invalid(errors.cardNumber, `${id}-number`)}
                  className={LIGHT_INPUT}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field id={`${id}-expiry`} label="Expiry" error={errors.expiry}>
                  <input
                    id={`${id}-expiry`}
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    placeholder="MM/YY"
                    value={card.expiry}
                    onChange={(event) =>
                      setCard({ ...card, expiry: formatExpiry(event.target.value) })
                    }
                    {...invalid(errors.expiry, `${id}-expiry`)}
                    className={LIGHT_INPUT}
                  />
                </Field>
                <Field id={`${id}-cvc`} label="CVC" error={errors.cvc}>
                  <input
                    id={`${id}-cvc`}
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    placeholder="123"
                    maxLength={4}
                    value={card.cvc}
                    onChange={(event) =>
                      setCard({ ...card, cvc: event.target.value.replace(/\D/g, '') })
                    }
                    {...invalid(errors.cvc, `${id}-cvc`)}
                    className={LIGHT_INPUT}
                  />
                </Field>
              </div>
              <Field id={`${id}-name`} label="Name on card" error={errors.name}>
                <input
                  id={`${id}-name`}
                  autoComplete="cc-name"
                  value={card.name}
                  onChange={(event) => setCard({ ...card, name: event.target.value })}
                  {...invalid(errors.name, `${id}-name`)}
                  className={LIGHT_INPUT}
                />
              </Field>
            </>
          ) : (
            <>
              <Field
                id={`${id}-wallet`}
                label={`${method === 'BKASH' ? 'bKash' : 'Nagad'} number`}
                error={errors.wallet}
              >
                <input
                  id={`${id}-wallet`}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="01712345678"
                  maxLength={11}
                  value={wallet.wallet}
                  onChange={(event) =>
                    setWallet({ ...wallet, wallet: event.target.value.replace(/\D/g, '') })
                  }
                  {...invalid(errors.wallet, `${id}-wallet`)}
                  className={LIGHT_INPUT}
                />
              </Field>
              <Field id={`${id}-otp`} label="Verification code" error={errors.otp}>
                <input
                  id={`${id}-otp`}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6 digits"
                  maxLength={6}
                  value={wallet.otp}
                  onChange={(event) =>
                    setWallet({ ...wallet, otp: event.target.value.replace(/\D/g, '') })
                  }
                  {...invalid(errors.otp, `${id}-otp`)}
                  className={LIGHT_INPUT}
                />
              </Field>
            </>
          )}

          {formError ? (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {formError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {pay.isPending ? 'Processing…' : `Pay ${money(session.amount)}`}
          </button>
        </form>

        <TestData
          method={method}
          onCard={fillCard}
          onWallet={(otp) => {
            setWallet((current) => ({ wallet: current.wallet || '01712345678', otp }));
            setErrors({});
          }}
        />
      </section>
    </div>
  );
}

/** The test data, one tap to fill it in. */
function TestData({
  method,
  onCard,
  onWallet,
}: {
  method: Method;
  onCard: (number: string) => void;
  onWallet: (otp: string) => void;
}) {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-xs text-amber-950">
      <p className="font-semibold">Test data</p>
      {method === 'CARD' ? (
        <ul className="mt-2 space-y-1.5">
          {MOCK_TEST_CARDS.map((card) => (
            <li key={card.number} className="flex items-center justify-between gap-3">
              <span>
                <span className="font-mono">{groupDigits(card.number)}</span>{' '}
                <span className="text-amber-800">
                  {card.brand} · {card.label}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onCard(card.number)}
                aria-label={`Use test card ${card.brand} ${card.number.slice(-4)}: ${card.label}`}
                className="rounded-md border border-amber-300 bg-white px-2 py-0.5 font-semibold hover:bg-amber-100"
              >
                Use
              </button>
            </li>
          ))}
          <li className="pt-1 text-amber-800">Any future expiry and any CVC.</li>
        </ul>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {(
            [
              [MOCK_WALLET_CODES.approve, 'approves'],
              [MOCK_WALLET_CODES.decline, 'declines'],
            ] as const
          ).map(([otp, outcome]) => (
            <li key={otp} className="flex items-center justify-between gap-3">
              <span>
                Code <span className="font-mono">{otp}</span>{' '}
                <span className="text-amber-800">{outcome} the payment</span>
              </span>
              <button
                type="button"
                onClick={() => onWallet(otp)}
                aria-label={`Use code ${otp}, which ${outcome} the payment`}
                className="rounded-md border border-amber-300 bg-white px-2 py-0.5 font-semibold hover:bg-amber-100"
              >
                Use
              </button>
            </li>
          ))}
          <li className="pt-1 text-amber-800">Any 11-digit 01… mobile number.</li>
        </ul>
      )}
    </div>
  );
}

// ── After paying ──────────────────────────────────────────────────────────────

function Result({ result }: { result: MockPayResult }) {
  const approved = result.status === 'SUCCEEDED';
  const [left, setLeft] = useState(RETURN_AFTER);
  useEffect(() => {
    if (left === 0) {
      window.location.assign(result.returnUrl);
      return;
    }
    const id = window.setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(id);
  }, [left, result.returnUrl]);

  return (
    <div className="mx-auto max-w-md px-5 py-16 text-center" aria-live="polite">
      <span
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${approved ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}
      >
        {approved ? <CheckIcon className="h-7 w-7" /> : <CloseIcon className="h-7 w-7" />}
      </span>
      <h1 className="mt-5 text-2xl font-bold tracking-tight">
        {approved ? 'Payment approved' : 'Payment not completed'}
      </h1>
      <p className="mt-2 text-slate-600">{result.message}</p>
      <p className="mt-6 text-sm text-slate-500">
        Returning you to CineSeat{left > 0 ? ` in ${left}…` : '…'}
      </p>
      <a href={result.returnUrl} className={`${LIGHT_BUTTON} mt-4`}>
        Return now
      </a>
    </div>
  );
}

// ── Bits ──────────────────────────────────────────────────────────────────────

const LIGHT_INPUT =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 aria-[invalid=true]:border-rose-400';
const LIGHT_BUTTON =
  'inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700';

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function invalid(error: string | undefined, id: string) {
  return error ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` } : {};
}

function Notice({ title, body, action }: { title: string; body: string; action: ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-5 py-16 text-center">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-slate-600">{body}</p>
      <div className="mt-6">{action}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div
      aria-busy="true"
      className="mx-auto grid max-w-4xl animate-pulse gap-6 px-5 py-12 md:grid-cols-[1fr_1.25fr]"
    >
      <span className="sr-only">Loading the payment page</span>
      <div aria-hidden="true" className="h-32 rounded-2xl bg-slate-200" />
      <div aria-hidden="true" className="h-96 rounded-2xl bg-slate-200" />
    </div>
  );
}

/** `4242424242424242` → `4242 4242 4242 4242` (digits only, up to 19). */
function groupDigits(value: string): string {
  return value
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** `1234` → `12/34`. */
function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}
