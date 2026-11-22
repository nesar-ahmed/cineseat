'use client';

import { Certificate, ShowFormat } from '@cineseat/shared';
import { CERTIFICATE_LABEL } from '../../landing/content';
import {
  Choice,
  DateRange,
  FilterDrawer,
  FilterGroup,
  TogglePills,
  toggleIn,
} from '../ui/filter-kit';
import { NO_FILTERS, type FilterPatch } from './list-query';

/** Options plus anything already chosen that the vocabulary does not list (from a URL). */
const withChosen = (options: string[], chosen: string[]) => [
  ...options,
  ...chosen.filter(
    (item) => !options.some((option) => option.toLowerCase() === item.toLowerCase()),
  ),
];

/**
 * Every filter of the movies list. Genres and languages come from the catalog's
 * own vocabulary (GET /catalog/filters).
 */
export function MovieFilterDrawer({
  open,
  onClose,
  value,
  onApply,
  genres,
  languages,
}: {
  open: boolean;
  onClose: () => void;
  value: FilterPatch;
  onApply: (filters: FilterPatch) => void;
  genres: string[];
  languages: string[];
}) {
  return (
    <FilterDrawer
      open={open}
      onClose={onClose}
      title="Filter movies"
      value={value}
      empty={NO_FILTERS}
      onApply={onApply}
    >
      {(draft, set) => (
        <>
          <FilterGroup label="Schedule">
            <Choice
              options={[
                ['', 'Any'],
                ['scheduled', 'Has upcoming shows'],
                ['unscheduled', 'No upcoming shows'],
              ]}
              value={draft.schedule ?? ''}
              onChange={(schedule) =>
                set({ schedule: (schedule || null) as FilterPatch['schedule'] })
              }
            />
          </FilterGroup>
          <FilterGroup label="Poster">
            <Choice
              options={[
                ['', 'Any'],
                ['with', 'Uploaded'],
                ['without', 'Missing'],
              ]}
              value={draft.poster ?? ''}
              onChange={(poster) => set({ poster: (poster || null) as FilterPatch['poster'] })}
            />
          </FilterGroup>
          <FilterGroup label="Genres" hint="Any of these">
            <TogglePills
              options={withChosen(genres, draft.genres)}
              chosen={draft.genres}
              onToggle={(genre) => set({ genres: toggleIn(draft.genres, genre) })}
            />
          </FilterGroup>
          <FilterGroup label="Languages" hint="Any of these">
            <TogglePills
              options={withChosen(languages, draft.languages)}
              chosen={draft.languages}
              onToggle={(language) => set({ languages: toggleIn(draft.languages, language) })}
            />
          </FilterGroup>
          <FilterGroup label="Certificate">
            <TogglePills
              options={Certificate.options}
              chosen={draft.certificates}
              onToggle={(cert) =>
                set({ certificates: toggleIn(draft.certificates, cert as Certificate) })
              }
              title={(cert) => CERTIFICATE_LABEL[cert as Certificate]}
            />
          </FilterGroup>
          <FilterGroup label="Released in" hint="Formats the movie can be scheduled in">
            <TogglePills
              options={ShowFormat.options}
              chosen={draft.formats}
              onToggle={(format) => set({ formats: toggleIn(draft.formats, format as ShowFormat) })}
            />
          </FilterGroup>
          <FilterGroup label="Release date">
            <DateRange from={draft.from} to={draft.to} onChange={(range) => set(range)} />
          </FilterGroup>
        </>
      )}
    </FilterDrawer>
  );
}
