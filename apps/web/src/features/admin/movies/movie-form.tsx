'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Certificate,
  CreateMovieSchema,
  MovieStatus,
  ShowFormat,
  type AdminMovieConstraints,
  type CreateMovieInput,
  type Movie,
  type UpdateMovieInput,
} from '@cineseat/shared';
import { ConfirmDialog } from '../../../components/ui/dialog';
import {
  AlertIcon,
  ChevronLeftIcon,
  ExternalLinkIcon,
  LockIcon,
} from '../../../components/ui/icons';
import { useAuth } from '../../auth/auth-provider';
import {
  Field,
  describedBy,
  focusFirstError,
  useUnsavedChangesWarning,
} from '../../account/settings/form-kit';
import { useCatalogFilters } from '../../catalog/queries';
import { runtime } from '../../catalog/format';
import { CERTIFICATE_LABEL } from '../../landing/content';
import { ADMIN_ROUTES, adminMovieHref } from '../links';
import { useToast } from '../toaster';
import {
  CardChoice,
  Counter,
  FormErrorBanner,
  Section,
  Segmented,
  TagInput,
  serverFieldErrors,
} from '../ui/form-kit';
import { shortDate } from '../ui/format';
import { STATUS_LABEL } from './bits';
import { PosterPanel, PosterPicker } from './poster-panel';
import { useCreateMovie, useUpdateMovie, useUploadPoster } from './queries';

/**
 * The form behind `/admin/movies/new` and `/admin/movies/:id/edit`.
 *
 * - Validation is the API's own: the shared `CreateMovieSchema` checks the form
 *   before sending, and anything the server still refuses (`field: message`)
 *   lands on its field.
 * - Editing sends only what changed (PATCH), and shows the limits the movie's
 *   schedule puts on formats, release day and running time before you hit them.
 * - Leaving with unsaved changes asks first (reload, tab close and Cancel).
 */

type Values = {
  title: string;
  tagline: string;
  description: string;
  genres: string[];
  language: string;
  certificate: Certificate;
  formats: ShowFormat[];
  status: MovieStatus;
  releaseDate: string;
  durationMin: string;
  director: string;
  cast: string[];
  trailerUrl: string;
};
type FieldName = keyof Values;

/** Field order on the page: focus goes to the first one with an error. */
const FIELDS: FieldName[] = [
  'title',
  'tagline',
  'description',
  'genres',
  'language',
  'certificate',
  'formats',
  'status',
  'releaseDate',
  'durationMin',
  'director',
  'cast',
  'trailerUrl',
];
const fieldId = (field: FieldName) => `movie-${field}`;

/** What to say when the schema refuses a field (its own messages are written for developers). */
const FIELD_ERROR: Record<FieldName, string> = {
  title: 'Enter a title of up to 120 characters.',
  tagline: 'Keep the tagline under 160 characters.',
  description: 'Write a description of 10 to 2,000 characters.',
  genres: 'Choose 1 to 5 genres, each 2 to 30 characters.',
  language: 'Enter the language, 2 to 40 characters.',
  certificate: 'Choose a certificate.',
  formats: 'Choose at least one format.',
  status: 'Choose a status.',
  releaseDate: 'Choose a real release date.',
  durationMin: 'Enter the running time in whole minutes, 1 to 600.',
  director: 'Use 2 to 80 characters, or leave it empty.',
  cast: 'Up to 20 names, each 2 to 80 characters.',
  trailerUrl: 'Use a full link starting with http:// or https://, or leave it empty.',
};

const EMPTY: Values = {
  title: '',
  tagline: '',
  description: '',
  genres: [],
  language: '',
  certificate: 'U',
  formats: ['2D'],
  status: 'COMING_SOON',
  releaseDate: '',
  durationMin: '',
  director: '',
  cast: [],
  trailerUrl: '',
};

function fromMovie(movie: Movie): Values {
  return {
    title: movie.title,
    tagline: movie.tagline ?? '',
    description: movie.description,
    genres: movie.genres,
    language: movie.language,
    certificate: movie.certificate,
    formats: [...movie.formats].sort() as ShowFormat[],
    status: movie.status,
    releaseDate: movie.releaseDate,
    durationMin: String(movie.durationMin),
    director: movie.director ?? '',
    cast: movie.cast,
    trailerUrl: movie.trailerUrl ?? '',
  };
}

/** The form as the API's input: trimmed, empty optional text as null. */
function toInput(values: Values) {
  const optional = (text: string) => (text.trim() ? text.trim() : null);
  return {
    title: values.title.trim(),
    tagline: optional(values.tagline),
    description: values.description.trim(),
    genres: values.genres,
    language: values.language.trim(),
    certificate: values.certificate,
    formats: values.formats,
    status: values.status,
    releaseDate: values.releaseDate,
    durationMin: values.durationMin.trim() === '' ? Number.NaN : Number(values.durationMin),
    director: optional(values.director),
    cast: values.cast,
    trailerUrl: optional(values.trailerUrl),
  };
}

type Props =
  { mode: 'create' } | { mode: 'edit'; movie: Movie; constraints: AdminMovieConstraints };

export function MovieForm(props: Props) {
  const editing = props.mode === 'edit';
  const original = useMemo(() => (editing ? fromMovie(props.movie) : EMPTY), [editing, props]);
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const vocabulary = useCatalogFilters();
  const create = useCreateMovie(user?.id);
  const update = useUpdateMovie(user?.id);
  const uploadPoster = useUploadPoster(user?.id);

  const [values, setValues] = useState<Values>(original);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string[]>([]);
  const [poster, setPoster] = useState<File | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [saved, setSaved] = useState(false);

  const changed = FIELDS.filter(
    (field) => JSON.stringify(values[field]) !== JSON.stringify(original[field]),
  );
  const dirty = !saved && (changed.length > 0 || poster !== null);
  useUnsavedChangesWarning(dirty);

  const busy = create.isPending || update.isPending || uploadPoster.isPending;
  const constraints = props.mode === 'edit' ? props.constraints : null;
  const backHref = props.mode === 'edit' ? adminMovieHref(props.movie.id) : ADMIN_ROUTES.movies;

  const set = <K extends FieldName>(field: K, value: Values[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors(({ [field]: _gone, ...others }) => others);
  };

  /** The schedule's limits, checked here so the form can say so before saving. */
  const scheduleErrors = (input: ReturnType<typeof toInput>) => {
    const found: Partial<Record<FieldName, string>> = {};
    if (!constraints || props.mode !== 'edit') return found;
    const lost = constraints.formatsInUse.filter((format) => !input.formats.includes(format));
    if (lost.length)
      found.formats = `Upcoming shows are in ${lost.join(' and ')}; keep ${lost.length === 1 ? 'it' : 'them'}.`;
    if (constraints.latestReleaseDate && input.releaseDate > constraints.latestReleaseDate)
      found.releaseDate = `It has a show on ${shortDate(constraints.latestReleaseDate)}, so it must be released by then.`;
    if (
      constraints.maxDurationMin !== null &&
      input.durationMin > props.movie.durationMin &&
      input.durationMin > constraints.maxDurationMin
    )
      found.durationMin = `At most ${constraints.maxDurationMin} minutes: a longer film would run into the next show on one of its screens.`;
    return found;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setFormError([]);
    const input = toInput(values);
    const parsed = CreateMovieSchema.safeParse(input);
    const found: Partial<Record<FieldName, string>> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as FieldName;
        if (FIELDS.includes(field)) found[field] ??= FIELD_ERROR[field];
      }
    }
    Object.assign(found, { ...scheduleErrors(input), ...found });
    if (Object.keys(found).length || !parsed.success) {
      setErrors(found);
      focusFirstError(FIELDS.filter((field) => found[field]).map(fieldId));
      return;
    }

    try {
      if (props.mode === 'create') {
        const movie = await create.mutateAsync(parsed.data as CreateMovieInput);
        setSaved(true);
        if (poster) {
          try {
            await uploadPoster.mutateAsync({ id: movie.id, file: poster });
          } catch (error) {
            toast({
              tone: 'error',
              message: 'The movie was added, but its poster didn’t upload',
              detail: (error as Error).message,
            });
          }
        }
        toast({
          message: `“${movie.title}” was added`,
          detail: 'Schedule its shows when you’re ready.',
        });
        router.push(adminMovieHref(movie.id));
      } else {
        // Only what changed; the API also ignores fields that did not.
        const patch = Object.fromEntries(
          changed.map((field) => [field, parsed.data[field as keyof CreateMovieInput]]),
        ) as UpdateMovieInput;
        if (changed.length === 0) {
          router.push(backHref);
          return;
        }
        await update.mutateAsync({ id: props.movie.id, input: patch });
        setSaved(true);
        toast({
          message: 'Changes saved',
          detail: `“${parsed.data.title}” is up to date everywhere.`,
        });
        router.push(backHref);
      }
    } catch (error) {
      const { fields, rest } = serverFieldErrors(error, FIELDS);
      setErrors(fields);
      setFormError(
        rest.length
          ? rest
          : Object.keys(fields).length
            ? []
            : ['Something went wrong. Please try again.'],
      );
      const first = FIELDS.filter((field) => fields[field]).map(fieldId);
      if (first.length) focusFirstError(first);
    }
  };

  const cancel = () => (dirty ? setConfirmLeave(true) : router.push(backHref));

  const durationValue = Number(values.durationMin);
  const durationHint =
    values.durationMin && Number.isInteger(durationValue) && durationValue > 0
      ? `${runtime(durationValue)}${constraints?.maxDurationMin != null ? ` · at most ${constraints.maxDurationMin} min with the current schedule` : ''}`
      : constraints?.maxDurationMin != null
        ? `Minutes. At most ${constraints.maxDurationMin} with the current schedule.`
        : 'Minutes, e.g. 138 for 2h 18m.';

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <header>
        <Link
          href={backHref}
          onClick={(event) => {
            if (dirty) {
              event.preventDefault();
              setConfirmLeave(true);
            }
          }}
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-400 hover:text-ink-100"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          {props.mode === 'edit' ? props.movie.title : 'Movies'}
        </Link>
        <h1 className="mt-2 font-display text-3xl text-ink-50 sm:text-4xl">
          {props.mode === 'edit' ? 'Edit movie' : 'Add a movie'}
        </h1>
        <p className="mt-1.5 text-sm text-ink-400">
          {props.mode === 'edit'
            ? 'Changes show on the site as soon as you save.'
            : 'It appears on the site as soon as it’s added. Shows are scheduled separately.'}
        </p>
      </header>

      <FormErrorBanner title="Couldn’t save the movie" messages={formError} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section title="Basics" description="What people see first.">
            <Field id={fieldId('title')} label="Title" error={errors.title}>
              <input
                id={fieldId('title')}
                value={values.title}
                onChange={(event) => set('title', event.target.value)}
                maxLength={120}
                autoComplete="off"
                className="input"
                aria-invalid={errors.title ? true : undefined}
                aria-describedby={describedBy(fieldId('title'), { error: errors.title })}
              />
            </Field>
            <Field
              id={fieldId('tagline')}
              label="Tagline"
              optional
              hint={<Counter text={values.tagline} max={160} lead="One line under the title." />}
              error={errors.tagline}
            >
              <input
                id={fieldId('tagline')}
                value={values.tagline}
                onChange={(event) => set('tagline', event.target.value)}
                maxLength={160}
                autoComplete="off"
                className="input"
                aria-invalid={errors.tagline ? true : undefined}
                aria-describedby={describedBy(fieldId('tagline'), {
                  hint: true,
                  error: errors.tagline,
                })}
              />
            </Field>
            <Field
              id={fieldId('description')}
              label="Description"
              hint={
                <Counter
                  text={values.description}
                  max={2000}
                  lead="The synopsis on the movie’s page."
                />
              }
              error={errors.description}
            >
              <textarea
                id={fieldId('description')}
                value={values.description}
                onChange={(event) => set('description', event.target.value)}
                maxLength={2000}
                rows={5}
                className="input min-h-[8rem] resize-y leading-relaxed"
                aria-invalid={errors.description ? true : undefined}
                aria-describedby={describedBy(fieldId('description'), {
                  hint: true,
                  error: errors.description,
                })}
              />
            </Field>
          </Section>

          <Section title="Classification" description="How the catalog files and filters it.">
            <Field
              id={fieldId('genres')}
              label="Genres"
              hint="Up to 5. The first is the primary genre (★) — it picks the artwork and leads the list."
              error={errors.genres}
            >
              <TagInput
                id={fieldId('genres')}
                values={values.genres}
                onChange={(genres) => set('genres', genres)}
                max={5}
                maxLength={30}
                suggestions={vocabulary.data?.genres ?? []}
                placeholder="Add a genre"
                error={errors.genres}
                primary
              />
            </Field>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                id={fieldId('language')}
                label="Language"
                error={errors.language}
                hint="As audiences see it, e.g. Bangla."
              >
                <input
                  id={fieldId('language')}
                  list={`${fieldId('language')}-options`}
                  value={values.language}
                  onChange={(event) => set('language', event.target.value)}
                  maxLength={40}
                  autoComplete="off"
                  className="input"
                  aria-invalid={errors.language ? true : undefined}
                  aria-describedby={describedBy(fieldId('language'), {
                    hint: true,
                    error: errors.language,
                  })}
                />
                <datalist id={`${fieldId('language')}-options`}>
                  {(vocabulary.data?.languages ?? []).map((language) => (
                    <option key={language} value={language} />
                  ))}
                </datalist>
              </Field>
              <Field id={fieldId('status')} label="Status" error={errors.status}>
                <Segmented
                  id={fieldId('status')}
                  label="Status"
                  value={values.status}
                  options={MovieStatus.options.map((status) => ({
                    value: status,
                    label: STATUS_LABEL[status],
                  }))}
                  onChange={(status) => set('status', status)}
                />
              </Field>
            </div>
            <Field id={fieldId('certificate')} label="Certificate" error={errors.certificate}>
              <CardChoice
                id={fieldId('certificate')}
                label="Certificate"
                type="radio"
                options={Certificate.options.map((cert) => ({
                  value: cert,
                  title: cert,
                  text: CERTIFICATE_LABEL[cert],
                }))}
                chosen={[values.certificate]}
                onToggle={(cert) => set('certificate', cert)}
              />
            </Field>
            <Field
              id={fieldId('formats')}
              label="Released in"
              hint="Shows can only be scheduled in these formats."
              error={errors.formats}
            >
              <CardChoice
                id={fieldId('formats')}
                label="Released in"
                type="checkbox"
                options={ShowFormat.options.map((format) => {
                  const locked =
                    constraints?.formatsInUse.includes(format) && values.formats.includes(format);
                  return {
                    value: format,
                    title: format,
                    text: locked
                      ? 'Upcoming shows use it'
                      : format === '3D'
                        ? 'Needs a 3D screen'
                        : 'Every screen',
                    locked,
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
          </Section>

          <Section
            title="Release and running time"
            description="Shows start on or after the release day and are spaced by the running time."
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                id={fieldId('releaseDate')}
                label="Release date"
                hint={
                  constraints?.latestReleaseDate
                    ? `On or before ${shortDate(constraints.latestReleaseDate)}, its first upcoming show.`
                    : 'The first day it can be shown (cinema time).'
                }
                error={errors.releaseDate}
              >
                <input
                  id={fieldId('releaseDate')}
                  type="date"
                  value={values.releaseDate}
                  max={constraints?.latestReleaseDate ?? undefined}
                  onChange={(event) => set('releaseDate', event.target.value)}
                  className="input"
                  aria-invalid={errors.releaseDate ? true : undefined}
                  aria-describedby={describedBy(fieldId('releaseDate'), {
                    hint: true,
                    error: errors.releaseDate,
                  })}
                />
              </Field>
              <Field
                id={fieldId('durationMin')}
                label="Running time"
                hint={durationHint}
                error={errors.durationMin}
              >
                <div className="relative">
                  <input
                    id={fieldId('durationMin')}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={600}
                    step={1}
                    value={values.durationMin}
                    onChange={(event) => set('durationMin', event.target.value)}
                    className="input pr-14"
                    aria-invalid={errors.durationMin ? true : undefined}
                    aria-describedby={describedBy(fieldId('durationMin'), {
                      hint: true,
                      error: errors.durationMin,
                    })}
                  />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-500">
                    min
                  </span>
                </div>
              </Field>
            </div>
          </Section>

          <Section title="People" description="Credits on the movie’s page; both are searchable.">
            <Field id={fieldId('director')} label="Director" optional error={errors.director}>
              <input
                id={fieldId('director')}
                value={values.director}
                onChange={(event) => set('director', event.target.value)}
                maxLength={80}
                autoComplete="off"
                className="input"
                aria-invalid={errors.director ? true : undefined}
                aria-describedby={describedBy(fieldId('director'), { error: errors.director })}
              />
            </Field>
            <Field
              id={fieldId('cast')}
              label="Cast"
              optional
              hint="In billing order, up to 20. Press Enter or comma after each name."
              error={errors.cast}
            >
              <TagInput
                id={fieldId('cast')}
                values={values.cast}
                onChange={(cast) => set('cast', cast)}
                max={20}
                maxLength={80}
                placeholder="Add a name"
                error={errors.cast}
              />
            </Field>
          </Section>

          <Section title="Trailer" description="Linked from the movie’s page.">
            <Field
              id={fieldId('trailerUrl')}
              label="Trailer link"
              optional
              error={errors.trailerUrl}
            >
              <div className="flex gap-2">
                <input
                  id={fieldId('trailerUrl')}
                  type="url"
                  inputMode="url"
                  value={values.trailerUrl}
                  onChange={(event) => set('trailerUrl', event.target.value)}
                  placeholder="https://"
                  maxLength={300}
                  autoComplete="off"
                  className="input"
                  aria-invalid={errors.trailerUrl ? true : undefined}
                  aria-describedby={describedBy(fieldId('trailerUrl'), {
                    error: errors.trailerUrl,
                  })}
                />
                {/^https?:\/\/\S+\.\S+/.test(values.trailerUrl.trim()) ? (
                  <a
                    href={values.trailerUrl.trim()}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost shrink-0 px-4 py-2.5"
                  >
                    Open
                    <ExternalLinkIcon className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            </Field>
          </Section>
        </div>

        <aside className="flex flex-col gap-6 xl:sticky xl:top-24 xl:self-start">
          {props.mode === 'edit' ? (
            <PosterPanel movie={props.movie} />
          ) : (
            <PosterPicker
              file={poster}
              onChange={setPoster}
              preview={{
                id: 'new-movie',
                title: values.title.trim() || 'Untitled',
                genre: values.genres[0] ?? 'Drama',
                director: values.director.trim() || null,
              }}
            />
          )}
          {constraints &&
          (constraints.formatsInUse.length ||
            constraints.latestReleaseDate ||
            constraints.maxDurationMin !== null) ? (
            <section className="rounded-2xl border border-gold-500/25 bg-gold-400/[0.05] p-5 text-sm">
              <h2 className="flex items-center gap-2 font-semibold text-gold-100">
                <LockIcon className="h-4 w-4" />
                Limits from its schedule
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-gold-100/80">
                {constraints.formatsInUse.length ? (
                  <li>
                    Keep {constraints.formatsInUse.join(' and ')}: upcoming shows use{' '}
                    {constraints.formatsInUse.length === 1 ? 'it' : 'them'}.
                  </li>
                ) : null}
                {constraints.latestReleaseDate ? (
                  <li>Release on or before {shortDate(constraints.latestReleaseDate)}.</li>
                ) : null}
                {constraints.maxDurationMin !== null ? (
                  <li>Running time up to {constraints.maxDurationMin} min.</li>
                ) : null}
              </ul>
              <p className="mt-2 text-xs text-gold-100/60">Move or delete shows to change these.</p>
            </section>
          ) : null}
        </aside>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-white/[0.06] bg-ink-950/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex items-center justify-end gap-3">
          <p className="mr-auto hidden text-sm text-ink-400 sm:block" aria-live="polite">
            {dirty
              ? props.mode === 'edit'
                ? `${changed.length} unsaved ${changed.length === 1 ? 'change' : 'changes'}`
                : 'Not added yet'
              : props.mode === 'edit'
                ? 'No changes'
                : ''}
          </p>
          <button type="button" onClick={cancel} className="btn-ghost py-2.5" disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || (editing && !dirty)}
            className="btn-primary py-2.5 disabled:opacity-50 disabled:shadow-none"
          >
            {busy
              ? props.mode === 'edit'
                ? 'Saving…'
                : uploadPoster.isPending
                  ? 'Uploading poster…'
                  : 'Adding…'
              : props.mode === 'edit'
                ? 'Save changes'
                : 'Add movie'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        icon={AlertIcon}
        title="Discard your changes?"
        description={
          props.mode === 'edit'
            ? 'The movie keeps what it had before you started editing.'
            : 'The movie won’t be added.'
        }
        confirmLabel="Discard"
        tone="danger"
        onConfirm={() => {
          setSaved(true);
          setConfirmLeave(false);
          router.push(backHref);
        }}
      />
    </form>
  );
}
