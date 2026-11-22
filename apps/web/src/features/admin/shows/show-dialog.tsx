'use client';

import { useState, type FormEvent } from 'react';
import {
  SEAT_SURCHARGE,
  SeatCategory,
  ShowFormat,
  UpdateShowSchema,
  type AdminShow,
  type UpdateShowInput,
} from '@cineseat/shared';
import { Dialog } from '../../../components/ui/dialog';
import { CalendarIcon, LockIcon } from '../../../components/ui/icons';
import { useAuth } from '../../auth/auth-provider';
import { Field, describedBy, focusFirstError } from '../../account/settings/form-kit';
import { money } from '../../catalog/format';
import { useCatalogFilters } from '../../catalog/queries';
import { useToast } from '../toaster';
import { CardChoice, FormErrorBanner, serverFieldErrors } from '../ui/form-kit';
import { cinemaInstant, toMinor, toTaka } from '../ui/format';
import { CATEGORY_NAME } from '../ui/hall-map';
import { showName } from './bits';
import { useUpdateShow } from './queries';

type Values = { date: string; time: string; format: ShowFormat; language: string; price: string };
type FieldName = keyof Values;
const FIELDS: FieldName[] = ['date', 'time', 'format', 'language', 'price'];
const fieldId = (field: FieldName) => `show-${field}`;
/** The API's field names → this form's. */
const ALIAS = { startsAt: 'date', basePrice: 'price' } as const;

/**
 * Changes a show's time, format, language or price — until it starts or a seat
 * is held or sold (then the dialog says why and offers nothing to save). The
 * API checks the new time against the screen's schedule and the movie's
 * release; a clash comes back on the date.
 */
export function ShowDialog({
  show,
  lockedReason,
  onClose,
}: {
  show: AdminShow | null;
  /** Why it cannot change, if known (the show's page knows; a list row guesses). */
  lockedReason: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={show !== null}
      onClose={onClose}
      icon={CalendarIcon}
      size="lg"
      title="Change this show"
      description={show ? showName(show) : ''}
    >
      {show ? <ShowForm show={show} lockedReason={lockedReason} onDone={onClose} /> : null}
    </Dialog>
  );
}

function ShowForm({
  show,
  lockedReason,
  onDone,
}: {
  show: AdminShow;
  lockedReason: string | null;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const languages = useCatalogFilters().data?.languages ?? [];
  const update = useUpdateShow(user?.id);
  const original: Values = {
    date: show.date,
    time: show.time,
    format: show.format,
    language: show.language,
    price: toTaka(show.basePrice),
  };
  const [values, setValues] = useState(original);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string[]>([]);
  const locked = lockedReason !== null;
  const changed = FIELDS.filter((field) => values[field] !== original[field]);

  const set = <K extends FieldName>(field: K, value: Values[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors(({ [field]: _gone, ...others }) => others);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (update.isPending || locked) return;
    setFormError([]);
    const found: Partial<Record<FieldName, string>> = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) found.date = 'Choose a date.';
    if (!/^\d{2}:\d{2}$/.test(values.time)) found.time = 'Choose a start time.';
    const basePrice = toMinor(values.price);
    if (!Number.isInteger(basePrice) || basePrice < 0) found.price = 'Enter a price in taka.';
    const input: UpdateShowInput = {};
    if (!found.date && !found.time && (changed.includes('date') || changed.includes('time')))
      input.startsAt = cinemaInstant(values.date, values.time);
    if (changed.includes('format')) input.format = values.format;
    if (changed.includes('language')) input.language = values.language.trim();
    if (changed.includes('price') && !found.price) input.basePrice = basePrice;
    const parsed = UpdateShowSchema.safeParse(input);
    if (!parsed.success && Object.keys(found).length === 0) {
      for (const issue of parsed.error.issues) {
        const field = (ALIAS[issue.path[0] as keyof typeof ALIAS] ?? issue.path[0]) as FieldName;
        if (FIELDS.includes(field))
          found[field] ??=
            field === 'language' ? 'Enter a language, 2 to 40 characters.' : 'Check this field.';
      }
    }
    if (Object.keys(found).length) {
      setErrors(found);
      focusFirstError(FIELDS.filter((field) => found[field]).map(fieldId));
      return;
    }
    try {
      await update.mutateAsync({ id: show.id, input: parsed.data! });
      toast({
        message: 'Show updated',
        detail: showName({ ...show, date: values.date, time: values.time }),
      });
      onDone();
    } catch (error) {
      const { fields, rest } = serverFieldErrors(error, FIELDS, ALIAS);
      setErrors(fields);
      setFormError(rest);
      focusFirstError(FIELDS.filter((field) => fields[field]).map(fieldId));
    }
  };

  const categories = SeatCategory.options.filter((category) => show.prices[category] !== undefined);
  const base = toMinor(values.price);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 pb-2">
      {locked ? (
        <p className="flex items-start gap-2 rounded-xl border border-gold-500/30 bg-gold-400/[0.07] px-3.5 py-3 text-sm text-gold-100">
          <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
          {lockedReason}
        </p>
      ) : null}
      <FormErrorBanner title="Couldn’t change the show" messages={formError} />
      <fieldset disabled={locked} className="flex flex-col gap-5 disabled:opacity-60">
        <div className="grid grid-cols-2 gap-4">
          <Field id={fieldId('date')} label="Date" error={errors.date} hint="Cinema time">
            <input
              id={fieldId('date')}
              type="date"
              value={values.date}
              onChange={(event) => set('date', event.target.value)}
              className="input"
              aria-invalid={errors.date ? true : undefined}
              aria-describedby={describedBy(fieldId('date'), { hint: true, error: errors.date })}
            />
          </Field>
          <Field id={fieldId('time')} label="Starts at" error={errors.time}>
            <input
              id={fieldId('time')}
              type="time"
              value={values.time}
              onChange={(event) => set('time', event.target.value)}
              className="input"
              aria-invalid={errors.time ? true : undefined}
              aria-describedby={describedBy(fieldId('time'), { error: errors.time })}
            />
          </Field>
        </div>
        <Field
          id={fieldId('format')}
          label="Format"
          error={errors.format}
          hint="The movie and the screen must both support it."
        >
          <CardChoice
            id={fieldId('format')}
            label="Format"
            type="radio"
            options={ShowFormat.options.map((format) => ({
              value: format,
              title: format,
              text: format === '3D' ? 'Glasses at the door' : 'Standard projection',
            }))}
            chosen={[values.format]}
            onToggle={(format) => set('format', format)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id={fieldId('language')} label="Language" error={errors.language}>
            <input
              id={fieldId('language')}
              list={`${fieldId('language')}-options`}
              value={values.language}
              onChange={(event) => set('language', event.target.value)}
              maxLength={40}
              autoComplete="off"
              className="input"
              aria-invalid={errors.language ? true : undefined}
              aria-describedby={describedBy(fieldId('language'), { error: errors.language })}
            />
            <datalist id={`${fieldId('language')}-options`}>
              {languages.map((language) => (
                <option key={language} value={language} />
              ))}
            </datalist>
          </Field>
          <Field
            id={fieldId('price')}
            label="Base price"
            error={errors.price}
            hint="Standard seat, in taka"
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">
                ৳
              </span>
              <input
                id={fieldId('price')}
                type="number"
                inputMode="decimal"
                min={0}
                step={10}
                value={values.price}
                onChange={(event) => set('price', event.target.value)}
                className="input pl-8"
                aria-invalid={errors.price ? true : undefined}
                aria-describedby={describedBy(fieldId('price'), {
                  hint: true,
                  error: errors.price,
                })}
              />
            </div>
          </Field>
        </div>
        {Number.isInteger(base) && base >= 0 ? (
          <p className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl bg-ink-950/60 px-3.5 py-2.5 text-xs text-ink-400">
            {categories.map((category) => (
              <span key={category}>
                {CATEGORY_NAME[category]}{' '}
                <span className="font-semibold tabular-nums text-ink-100">
                  {money(base + SEAT_SURCHARGE[category])}
                </span>
              </span>
            ))}
          </p>
        ) : null}
      </fieldset>
      <div className="-mx-5 mt-1 flex flex-col-reverse gap-2 border-t border-white/[0.06] px-5 pt-4 sm:-mx-6 sm:flex-row sm:justify-end sm:px-6">
        <button
          type="button"
          onClick={onDone}
          className="btn-ghost py-2.5"
          disabled={update.isPending}
        >
          {locked ? 'Close' : 'Cancel'}
        </button>
        {locked ? null : (
          <button
            type="submit"
            disabled={update.isPending || changed.length === 0}
            className="btn-primary py-2.5 disabled:opacity-50 disabled:shadow-none"
          >
            {update.isPending ? 'Saving…' : 'Save changes'}
          </button>
        )}
      </div>
    </form>
  );
}
