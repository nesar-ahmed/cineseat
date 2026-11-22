'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CreateTheaterSchema, type AdminTheater, type UpdateTheaterInput } from '@cineseat/shared';
import { Dialog } from '../../../components/ui/dialog';
import { BuildingIcon } from '../../../components/ui/icons';
import { useAuth } from '../../auth/auth-provider';
import { Field, describedBy, focusFirstError } from '../../account/settings/form-kit';
import { useCatalogFilters } from '../../catalog/queries';
import { adminTheaterHref } from '../links';
import { useToast } from '../toaster';
import { FormErrorBanner, TagInput, serverFieldErrors } from '../ui/form-kit';
import { COMMON_AMENITIES } from './list-query';
import { useCreateTheater, useUpdateTheater } from './queries';

type Values = { name: string; city: string; address: string; amenities: string[] };
type FieldName = keyof Values;
const FIELDS: FieldName[] = ['name', 'city', 'address', 'amenities'];
const fieldId = (field: FieldName) => `theater-${field}`;
const FIELD_ERROR: Record<FieldName, string> = {
  name: 'Enter a name of 2 to 80 characters.',
  city: 'Enter the city, 2 to 60 characters.',
  address: 'Enter the address, 2 to 200 characters.',
  amenities: 'Up to 12 amenities, each 2 to 40 characters.',
};

/**
 * Adds a cinema or edits one — four fields, so a dialog. Checked with the API's
 * own schema; a name that is taken comes back on the name field. A new cinema
 * opens on its page, where its screens are added.
 */
export function TheaterDialog({
  open,
  onClose,
  theater,
  amenitySuggestions = [],
}: {
  open: boolean;
  onClose: () => void;
  /** The cinema to edit; absent: add one. */
  theater?: Pick<AdminTheater, 'id' | 'name' | 'city' | 'address' | 'amenities'>;
  amenitySuggestions?: string[];
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={BuildingIcon}
      size="lg"
      title={theater ? `Edit ${theater.name}` : 'Add a theater'}
      description={
        theater
          ? 'Changes show on the site as soon as you save.'
          : 'Screens and their seat layouts are added on the theater’s page next.'
      }
    >
      {/* Mounted only while open, so every opening starts from the saved values. */}
      {open ? (
        <TheaterForm theater={theater} onDone={onClose} amenitySuggestions={amenitySuggestions} />
      ) : null}
    </Dialog>
  );
}

function TheaterForm({
  theater,
  onDone,
  amenitySuggestions,
}: {
  theater?: Pick<AdminTheater, 'id' | 'name' | 'city' | 'address' | 'amenities'>;
  onDone: () => void;
  amenitySuggestions: string[];
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const cities = useCatalogFilters().data?.cities ?? [];
  const create = useCreateTheater(user?.id);
  const update = useUpdateTheater(user?.id);
  const original: Values = {
    name: theater?.name ?? '',
    city: theater?.city ?? '',
    address: theater?.address ?? '',
    amenities: theater?.amenities ?? [],
  };
  const [values, setValues] = useState(original);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string[]>([]);
  const busy = create.isPending || update.isPending;
  const changed = FIELDS.filter(
    (field) => JSON.stringify(values[field]) !== JSON.stringify(original[field]),
  );

  const set = <K extends FieldName>(field: K, value: Values[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors(({ [field]: _gone, ...others }) => others);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setFormError([]);
    const parsed = CreateTheaterSchema.safeParse(values);
    if (!parsed.success) {
      const found: Partial<Record<FieldName, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as FieldName;
        if (FIELDS.includes(field)) found[field] ??= FIELD_ERROR[field];
      }
      setErrors(found);
      focusFirstError(FIELDS.filter((field) => found[field]).map(fieldId));
      return;
    }
    try {
      if (theater) {
        if (changed.length) {
          const patch = Object.fromEntries(
            changed.map((field) => [field, parsed.data[field]]),
          ) as UpdateTheaterInput;
          const saved = await update.mutateAsync({ id: theater.id, input: patch });
          toast({ message: 'Changes saved', detail: `${saved.name} is up to date everywhere.` });
        }
        onDone();
      } else {
        const saved = await create.mutateAsync(parsed.data);
        toast({
          message: `${saved.name} was added`,
          detail: 'Add its screens to start scheduling.',
        });
        onDone();
        router.push(adminTheaterHref(saved.id));
      }
    } catch (error) {
      const { fields, rest } = serverFieldErrors(error, FIELDS);
      setErrors(fields);
      setFormError(rest);
      focusFirstError(FIELDS.filter((field) => fields[field]).map(fieldId));
    }
  };

  const input = (field: 'name' | 'city' | 'address', extra: Record<string, unknown> = {}) => ({
    id: fieldId(field),
    value: values[field],
    onChange: (event: { target: { value: string } }) => set(field, event.target.value),
    className: 'input',
    autoComplete: 'off',
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': describedBy(fieldId(field), { hint: true, error: errors[field] }),
    ...extra,
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 pb-2">
      <FormErrorBanner title="Couldn’t save the theater" messages={formError} />
      <Field id={fieldId('name')} label="Name" error={errors.name} hint="Unique across CineSeat.">
        <input {...input('name', { maxLength: 80, 'data-autofocus': true })} />
      </Field>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Field
          id={fieldId('city')}
          label="City"
          error={errors.city}
          hint="Spelled like the other cinemas there."
        >
          <input {...input('city', { maxLength: 60, list: `${fieldId('city')}-options` })} />
          <datalist id={`${fieldId('city')}-options`}>
            {cities.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>
        </Field>
        <Field
          id={fieldId('address')}
          label="Address"
          error={errors.address}
          hint="As visitors find it."
        >
          <input {...input('address', { maxLength: 200 })} />
        </Field>
      </div>
      <Field
        id={fieldId('amenities')}
        label="Amenities"
        optional
        hint="Shown on the cinema cards; up to 12. Press Enter after each."
        error={errors.amenities}
      >
        <TagInput
          id={fieldId('amenities')}
          values={values.amenities}
          onChange={(amenities) => set('amenities', amenities)}
          max={12}
          maxLength={40}
          suggestions={[...new Set([...COMMON_AMENITIES, ...amenitySuggestions])]}
          placeholder="Add an amenity"
          error={errors.amenities}
        />
      </Field>
      <div className="-mx-5 mt-1 flex flex-col-reverse gap-2 border-t border-white/[0.06] px-5 pt-4 sm:-mx-6 sm:flex-row sm:justify-end sm:px-6">
        <button type="button" onClick={onDone} className="btn-ghost py-2.5" disabled={busy}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || (theater !== undefined && changed.length === 0)}
          className="btn-primary py-2.5 disabled:opacity-50 disabled:shadow-none"
        >
          {busy ? 'Saving…' : theater ? 'Save changes' : 'Add theater'}
        </button>
      </div>
    </form>
  );
}
