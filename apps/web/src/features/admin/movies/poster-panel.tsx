'use client';

import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { MAX_POSTER_BYTES, POSTER_MIME_TYPES, type Movie } from '@cineseat/shared';
import { ConfirmDialog } from '../../../components/ui/dialog';
import { ImageIcon, TrashIcon, UploadIcon } from '../../../components/ui/icons';
import { useAuth } from '../../auth/auth-provider';
import { withArt } from '../../catalog/art';
import { PosterArt } from '../../catalog/poster-art';
import { useToast } from '../toaster';
import { useRemovePoster, useUploadPoster } from './queries';

const MB = MAX_POSTER_BYTES / 1024 / 1024;

/** Why a file cannot be a poster, or null — the API's own rules, checked before uploading. */
export function posterProblem(file: File): string | null {
  if (!(POSTER_MIME_TYPES as readonly string[]).includes(file.type))
    return 'Use a JPEG, PNG or WebP image.';
  if (file.size > MAX_POSTER_BYTES) return `That image is over ${MB} MB.`;
  return null;
}

/**
 * The poster of a saved movie. Upload, replace and remove apply at once (each is
 * its own request, recorded in the movie's history) — separate from the edit
 * form's Save, and the panel says so.
 */
export function PosterPanel({ movie }: { movie: Movie }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const upload = useUploadPoster(user?.id);
  const remove = useRemovePoster(user?.id);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const send = (file: File) => {
    const issue = posterProblem(file);
    setProblem(issue);
    if (issue) return;
    upload.mutate(
      { id: movie.id, file },
      {
        onSuccess: () =>
          toast({ message: movie.posterPath ? 'Poster replaced' : 'Poster uploaded' }),
        onError: (error) => setProblem(error.message),
      },
    );
  };

  return (
    <PanelFrame
      title="Poster"
      description="Shown on the site wherever the movie appears. Changes here are saved right away."
    >
      <DropZone
        onFile={send}
        busy={upload.isPending}
        label={movie.posterPath ? 'Replace poster' : 'Upload poster'}
      >
        <PosterArt
          movie={withArt(movie)}
          credit
          className="aspect-[2/3] w-full rounded-xl ring-1 ring-white/10"
        />
      </DropZone>
      {!movie.posterPath ? (
        <p className="mt-3 flex items-start gap-2 text-xs text-ink-400">
          <ImageIcon className="mt-px h-4 w-4 shrink-0" />
          No poster yet — the site shows generated artwork until one is uploaded.
        </p>
      ) : null}
      {problem ? (
        <p role="alert" className="field-error">
          {problem}
        </p>
      ) : null}
      {movie.posterPath ? (
        <button
          type="button"
          onClick={() => setConfirmRemove(true)}
          disabled={remove.isPending || upload.isPending}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold text-ink-300 hover:text-brand-300 disabled:opacity-50"
        >
          <TrashIcon className="h-4 w-4" />
          Remove poster
        </button>
      ) : null}

      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        icon={TrashIcon}
        tone="danger"
        title="Remove the poster?"
        description="The image file is deleted and the site goes back to generated artwork. You can upload a new poster any time."
        confirmLabel="Remove poster"
        busyLabel="Removing…"
        busy={remove.isPending}
        error={remove.error?.message}
        onConfirm={() =>
          remove.mutate(movie.id, {
            onSuccess: () => {
              setConfirmRemove(false);
              toast({ message: 'Poster removed' });
            },
          })
        }
      />
    </PanelFrame>
  );
}

/**
 * The poster for a movie being added: chosen now, uploaded once the movie is
 * created. Shows how the movie will look in the catalog meanwhile.
 */
export function PosterPicker({
  file,
  onChange,
  preview,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  preview: Pick<Movie, 'id' | 'title' | 'genre' | 'director'>;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <PanelFrame
      title="Poster"
      description="Optional. It uploads when you create the movie; until then the preview shows how the catalog will look."
    >
      <DropZone
        onFile={(chosen) => {
          const issue = posterProblem(chosen);
          setProblem(issue);
          if (!issue) onChange(chosen);
        }}
        label={file ? 'Choose another image' : 'Choose an image'}
      >
        {url ? (
          // A local preview (object URL) — not an optimizable remote image.
          <img
            src={url}
            alt=""
            className="aspect-[2/3] w-full rounded-xl object-cover ring-1 ring-white/10"
          />
        ) : (
          <PosterArt
            movie={withArt({ ...preview, posterPath: null } as Movie)}
            credit
            className="aspect-[2/3] w-full rounded-xl ring-1 ring-white/10"
          />
        )}
      </DropZone>
      {problem ? (
        <p role="alert" className="field-error">
          {problem}
        </p>
      ) : null}
      {file ? (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-ink-400">
          <span className="min-w-0 truncate">
            {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 rounded-full px-2 py-1 font-semibold text-ink-300 hover:text-brand-300"
          >
            Remove
          </button>
        </div>
      ) : null}
    </PanelFrame>
  );
}

function PanelFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 shadow-inset">
      <h2 className="text-base font-semibold text-ink-50">{title}</h2>
      <p className="mb-4 mt-1 text-xs leading-relaxed text-ink-400">{description}</p>
      {children}
    </section>
  );
}

/**
 * The poster itself is the drop target: drag an image onto it, or use the
 * button under it (a real file input, so the keyboard and screen readers work).
 */
function DropZone({
  onFile,
  busy = false,
  label,
  children,
}: {
  onFile: (file: File) => void;
  busy?: boolean;
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file && !busy) onFile(file);
  };

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className="relative mx-auto max-w-[15rem]"
      >
        {children}
        <div
          aria-hidden="true"
          className={`absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm font-semibold transition motion-reduce:transition-none ${
            over
              ? 'border-gold-400 bg-ink-950/80 text-gold-200 opacity-100'
              : busy
                ? 'border-transparent bg-ink-950/70 text-ink-100 opacity-100'
                : 'border-transparent opacity-0'
          }`}
        >
          <UploadIcon
            className={`h-6 w-6 ${busy ? 'animate-bounce motion-reduce:animate-none' : ''}`}
          />
          {busy ? 'Uploading…' : 'Drop to upload'}
        </div>
      </div>
      <input
        ref={input}
        id={id}
        type="file"
        accept={POSTER_MIME_TYPES.join(',')}
        className="sr-only"
        // The label below is the one control people reach (a button to the keyboard).
        tabIndex={-1}
        aria-hidden="true"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = ''; // choosing the same file again still fires
          if (file) onFile(file);
        }}
      />
      <label
        htmlFor={id}
        aria-disabled={busy || undefined}
        className={`btn-ghost mt-4 w-full cursor-pointer py-2.5 ${busy ? 'pointer-events-none opacity-50' : ''}`}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !busy) {
            event.preventDefault();
            input.current?.click();
          }
        }}
        tabIndex={0}
        role="button"
      >
        <UploadIcon className="h-4 w-4" />
        {label}
      </label>
      <p className="mt-2 text-center text-[11px] text-ink-500">
        JPEG, PNG or WebP · up to {MB} MB · 2:3 portrait works best
      </p>
    </div>
  );
}
