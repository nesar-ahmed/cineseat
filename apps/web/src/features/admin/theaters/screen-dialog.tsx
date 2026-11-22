'use client';

import { useState, type FormEvent } from 'react';
import {
  CreateScreenSchema,
  ShowFormat,
  UpdateScreenSchema,
  type AdminScreen,
  type UpdateScreenInput,
} from '@cineseat/shared';
import { Dialog } from '../../../components/ui/dialog';
import { LockIcon, ScreenIcon } from '../../../components/ui/icons';
import { useAuth } from '../../auth/auth-provider';
import { Field, describedBy, focusFirstError } from '../../account/settings/form-kit';
import { useToast } from '../toaster';
import { plural } from '../ui/format';
import { CardChoice, FormErrorBanner, NumberStepper, serverFieldErrors } from '../ui/form-kit';
import { CategoryLegend, HallMap, categoryOfRow } from '../ui/hall-map';
import { useCreateScreen, useUpdateScreen } from './queries';

type Values = {
  name: string;
  formats: ShowFormat[];
  rows: number;
  cols: number;
  premiumRows: number;
  reclinerRows: number;
};
type FieldName = keyof Values;
const FIELDS: FieldName[] = ['name', 'formats', 'rows', 'cols', 'premiumRows', 'reclinerRows'];
const LAYOUT: FieldName[] = ['rows', 'cols', 'premiumRows', 'reclinerRows'];
const fieldId = (field: FieldName) => `screen-${field}`;
const FIELD_ERROR: Record<FieldName, string> = {
  name: 'Enter a name of up to 40 characters.',
  formats: 'Choose at least one format.',
  rows: 'From 1 to 26 rows (lettered A–Z).',
  cols: 'From 1 to 40 seats per row.',
  premiumRows: 'Premium and recliner rows together cannot be more than the rows.',
  reclinerRows: 'Premium and recliner rows together cannot be more than the rows.',
};

const NEW_SCREEN: Values = {
  name: '',
  formats: ['2D'],
  rows: 8,
  cols: 10,
  premiumRows: 2,
  reclinerRows: 1,
};

/**
 * Adds a screen to a cinema or edits one: its name, what its projector shows,
 * and its seat layout — rows A… from the screen, the back rows recliners, the
 * rows in front of them premium — previewed as it will be built. Once a screen
 * has shows its layout is locked (every show has its own copy of the seats), and
 * formats that upcoming shows use cannot be removed; the form says so up front.
 */
export function ScreenDialog({
  open,
  onClose,
  theaterId,
  screen,
}: {
  open: boolean;
  onClose: () => void;
  theaterId: string;
  /** The screen to edit; absent: add one. */
  screen?: AdminScreen;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={ScreenIcon}
      size="xl"
      title={screen ? `Edit ${screen.name}` : 'Add a screen'}
      description={
        screen
          ? 'Name and formats can change any time; the layout only while it has no shows.'
          : 'Seats are generated from the layout. It can change until the first show is scheduled.'
      }
    >
      {open ? <ScreenForm theaterId={theaterId} screen={screen} onDone={onClose} /> : null}
    </Dialog>
  );
}

function ScreenForm({
  theaterId,
  screen,
  onDone,
}: {
  theaterId: string;
  screen?: AdminScreen;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const create = useCreateScreen(user?.id);
  const update = useUpdateScreen(user?.id);
  const original: Values = screen
    ? {
        name: screen.name,
        formats: screen.formats,
        rows: screen.rows,
        cols: screen.cols,
        premiumRows: screen.premiumRows,
        reclinerRows: screen.reclinerRows,
      }
    : NEW_SCREEN;
  const [values, setValues] = useState(original);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string[]>([]);
  const busy = create.isPending || update.isPending;
  const locked = screen?.constraints.layoutLocked ?? false;
  const inUse = screen?.constraints.formatsInUse ?? [];
  const changed = FIELDS.filter(
    (field) => JSON.stringify(values[field]) !== JSON.stringify(original[field]),
  );

  const set = <K extends FieldName>(field: K, value: Values[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field] || (LAYOUT.includes(field) && (errors.premiumRows || errors.reclinerRows)))
      setErrors(({ [field]: _gone, premiumRows: _p, reclinerRows: _r, ...others }) => others);
  };

  const valid =
    [values.rows, values.cols, values.premiumRows, values.reclinerRows].every(Number.isInteger) &&
    values.rows >= 1 &&
    values.rows <= 26 &&
    values.cols >= 1 &&
    values.cols <= 40 &&
    values.premiumRows >= 0 &&
    values.reclinerRows >= 0 &&
    values.premiumRows + values.reclinerRows <= values.rows;
  const counts = { STANDARD: 0, PREMIUM: 0, RECLINER: 0 };
  if (valid)
    for (let row = 1; row <= values.rows; row++) counts[categoryOfRow(row, values)] += values.cols;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setFormError([]);
    const layoutChanged = changed.some((field) => LAYOUT.includes(field));
    const body: Record<string, unknown> = screen
      ? Object.fromEntries(
          [
            ...changed.filter((field) => !LAYOUT.includes(field)),
            // A new layout is always sent whole.
            ...(layoutChanged ? LAYOUT : []),
          ].map((field) => [field, values[field]]),
        )
      : values;
    const parsed = (screen ? UpdateScreenSchema : CreateScreenSchema).safeParse(body);
    if (!parsed.success) {
      const found: Partial<Record<FieldName, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as FieldName;
        if (FIELDS.includes(field)) found[field] ??= FIELD_ERROR[field];
      }
      if (Object.keys(found).length === 0) found.premiumRows = FIELD_ERROR.premiumRows;
      setErrors(found);
      focusFirstError(FIELDS.filter((field) => found[field]).map(fieldId));
      return;
    }
    try {
      if (screen) {
        if (changed.length) {
          const saved = await update.mutateAsync({
            id: screen.id,
            input: parsed.data as UpdateScreenInput,
          });
          toast({ message: `${saved.name} saved` });
        }
      } else {
        const saved = await create.mutateAsync({
          theaterId,
          input: CreateScreenSchema.parse(body),
        });
        toast({
          message: `${saved.name} was added`,
          detail: `${plural(saved.seatCounts.total, 'seat')} ready for scheduling.`,
        });
      }
      onDone();
    } catch (error) {
      // `rows:` is how the API reports a locked layout.
      const { fields, rest } = serverFieldErrors(error, FIELDS);
      setErrors(fields);
      setFormError(rest);
      focusFirstError(FIELDS.filter((field) => fields[field]).map(fieldId));
    }
  };

  const stepper = (
    field: 'rows' | 'cols' | 'premiumRows' | 'reclinerRows',
    label: string,
    min: number,
    max: number,
    words: [string, string],
  ) => (
    <Field id={fieldId(field)} label={label} error={errors[field]}>
      <NumberStepper
        id={fieldId(field)}
        value={values[field]}
        onChange={(value) => set(field, value)}
        min={min}
        max={max}
        disabled={locked}
        error={errors[field]}
        label={{ less: words[0], more: words[1] }}
      />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 pb-2">
      <FormErrorBanner title="Couldn’t save the screen" messages={formError} />
      <Field
        id={fieldId('name')}
        label="Name"
        error={errors.name}
        hint="Unique within this theater, e.g. Screen 3 or IMAX."
      >
        <input
          id={fieldId('name')}
          value={values.name}
          onChange={(event) => set('name', event.target.value)}
          maxLength={40}
          autoComplete="off"
          data-autofocus
          className="input"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describedBy(fieldId('name'), { hint: true, error: errors.name })}
        />
      </Field>
      <Field id={fieldId('formats')} label="Can show" error={errors.formats}>
        <CardChoice
          id={fieldId('formats')}
          label="Can show"
          type="checkbox"
          options={ShowFormat.options.map((format) => {
            const lock = inUse.includes(format) && values.formats.includes(format);
            return {
              value: format,
              title: format,
              text: lock
                ? 'Upcoming shows use it'
                : format === '3D'
                  ? 'Needs a 3D projector'
                  : 'Every show',
              locked: lock,
            };
          })}
          chosen={values.formats}
          onToggle={(format) =>
            set(
              'formats',
              values.formats.includes(format)
                ? values.formats.filter((item) => item !== format)
                : ([...values.formats, format].sort() as ShowFormat[]),
            )
          }
        />
      </Field>

      <fieldset className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-300">
          Seat layout
        </legend>
        {locked ? (
          <p className="mb-4 flex items-start gap-2 rounded-xl border border-gold-500/30 bg-gold-400/[0.07] px-3 py-2.5 text-sm text-gold-100">
            <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
            {screen?.constraints.layoutLockedReason}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid grid-cols-2 gap-3">
            {stepper('rows', 'Rows', 1, 26, ['Fewer rows', 'More rows'])}
            {stepper('cols', 'Seats a row', 1, 40, ['Fewer seats per row', 'More seats per row'])}
            {stepper('premiumRows', 'Premium rows', 0, 26, [
              'Fewer premium rows',
              'More premium rows',
            ])}
            {stepper('reclinerRows', 'Recliner rows', 0, 26, [
              'Fewer recliner rows',
              'More recliner rows',
            ])}
            <p className="col-span-2 text-xs leading-relaxed text-ink-400">
              Row A is nearest the screen. Recliners take the back rows, premium the rows in front
              of them; premium adds ৳100 a seat, recliner ৳200.
            </p>
          </div>
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-ink-950/60 p-4">
            {valid ? (
              <>
                <HallMap
                  rows={values.rows}
                  cols={values.cols}
                  categoryOf={(row) => categoryOfRow(row, values)}
                  label={`Preview: ${values.rows} rows of ${values.cols} seats — ${counts.STANDARD} standard, ${counts.PREMIUM} premium, ${counts.RECLINER} recliner.`}
                />
                <CategoryLegend counts={counts} />
                <p className="text-sm font-semibold tabular-nums text-ink-100">
                  {plural(values.rows * values.cols, 'seat')}
                </p>
              </>
            ) : (
              <p className="text-center text-sm text-ink-400">
                The preview appears once the layout adds up.
              </p>
            )}
          </div>
        </div>
      </fieldset>

      <div className="-mx-5 mt-1 flex flex-col-reverse gap-2 border-t border-white/[0.06] px-5 pt-4 sm:-mx-6 sm:flex-row sm:justify-end sm:px-6">
        <button type="button" onClick={onDone} className="btn-ghost py-2.5" disabled={busy}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || (screen !== undefined && changed.length === 0)}
          className="btn-primary py-2.5 disabled:opacity-50 disabled:shadow-none"
        >
          {busy ? 'Saving…' : screen ? 'Save changes' : 'Add screen'}
        </button>
      </div>
    </form>
  );
}
