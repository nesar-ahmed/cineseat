import type { Movie } from '@cineseat/shared';

/**
 * Poster artwork until real posters are uploaded (`posterPath`). The seeded titles
 * keep their art-directed look; any other title gets a motif from its primary
 * genre and a palette picked by its id, so new movies look designed, not blank.
 */
export type PosterMotif =
  'blaze' | 'rain' | 'grid' | 'fog' | 'paper' | 'bokeh' | 'ridge' | 'confetti' | 'moon' | 'orbs';
export type Art = { motif: PosterMotif; palette: [string, string, string]; accent: string };

/** A movie from the API plus the artwork the UI paints for it. */
export type CatalogMovie = Movie & { art: Art };

/** Art direction for the catalog's launch titles, keyed by lower-case title. */
const ART_DIRECTION: Record<string, Art> = {
  'midnight express': {
    motif: 'blaze',
    palette: ['#2a0612', '#7f1d3a', '#f97316'],
    accent: '#fbbf24',
  },
  'the last monsoon': {
    motif: 'rain',
    palette: ['#06111d', '#1e3a5f', '#7dd3fc'],
    accent: '#bae6fd',
  },
  'neon skyline': { motif: 'grid', palette: ['#0a0620', '#3b1d6e', '#22d3ee'], accent: '#f0abfc' },
  'paper boats': { motif: 'paper', palette: ['#04161c', '#0f4c5c', '#5eead4'], accent: '#fef3c7' },
  'silent harbor': { motif: 'fog', palette: ['#07090d', '#334155', '#cbd5e1'], accent: '#fde68a' },
  kathputli: { motif: 'confetti', palette: ['#1b0a05', '#7c2d12', '#fb923c'], accent: '#fde047' },
  'echoes of tomorrow': {
    motif: 'orbs',
    palette: ['#030712', '#1e1b4b', '#818cf8'],
    accent: '#e0e7ff',
  },
  rongdhonu: { motif: 'bokeh', palette: ['#1f0616', '#9d174d', '#fda4af'], accent: '#fde68a' },
  'iron valley': { motif: 'ridge', palette: ['#0c0a09', '#57534e', '#f59e0b'], accent: '#fed7aa' },
  'the cartographer': {
    motif: 'ridge',
    palette: ['#052e16', '#166534', '#bef264'],
    accent: '#fef9c3',
  },
  'rickshaw kings': {
    motif: 'confetti',
    palette: ['#14061f', '#6d28d9', '#facc15'],
    accent: '#fef08a',
  },
  'the hollow tide': {
    motif: 'moon',
    palette: ['#020617', '#14532d', '#a7f3d0'],
    accent: '#ecfccb',
  },
  sundarbans: { motif: 'ridge', palette: ['#021a12', '#065f46', '#fbbf24'], accent: '#fef3c7' },
  'orbit of ash': { motif: 'orbs', palette: ['#0c0a09', '#44403c', '#fb7185'], accent: '#fecdd3' },
  'dhaka noir': { motif: 'rain', palette: ['#0a0a0a', '#3f1d1d', '#f87171'], accent: '#fecaca' },
  'little lanterns': {
    motif: 'orbs',
    palette: ['#0b1026', '#1d4ed8', '#fcd34d'],
    accent: '#fef9c3',
  },
  shapla: { motif: 'paper', palette: ['#1a0b12', '#831843', '#f9a8d4'], accent: '#fdf2f8' },
  'kites over karnaphuli': {
    motif: 'confetti',
    palette: ['#082f49', '#0369a1', '#fde047'],
    accent: '#fef08a',
  },
};

const GENRE_MOTIF: Record<string, PosterMotif> = {
  action: 'blaze',
  adventure: 'ridge',
  animation: 'orbs',
  comedy: 'confetti',
  drama: 'rain',
  family: 'paper',
  horror: 'moon',
  romance: 'bokeh',
  'sci-fi': 'grid',
  thriller: 'fog',
};

const PALETTES: Pick<Art, 'palette' | 'accent'>[] = [
  { palette: ['#2a0612', '#7f1d3a', '#f97316'], accent: '#fbbf24' },
  { palette: ['#06111d', '#1e3a5f', '#7dd3fc'], accent: '#bae6fd' },
  { palette: ['#0a0620', '#3b1d6e', '#22d3ee'], accent: '#f0abfc' },
  { palette: ['#04161c', '#0f4c5c', '#5eead4'], accent: '#fef3c7' },
  { palette: ['#1b0a05', '#7c2d12', '#fb923c'], accent: '#fde047' },
  { palette: ['#021a12', '#065f46', '#fbbf24'], accent: '#fef3c7' },
  { palette: ['#1f0616', '#9d174d', '#fda4af'], accent: '#fde68a' },
  { palette: ['#0b1026', '#1d4ed8', '#fcd34d'], accent: '#fef9c3' },
];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function artFor(movie: Pick<Movie, 'id' | 'title' | 'genre'>): Art {
  const directed = ART_DIRECTION[movie.title.toLowerCase()];
  if (directed) return directed;
  const motifs = Object.values(GENRE_MOTIF);
  const motif = GENRE_MOTIF[movie.genre.toLowerCase()] ?? motifs[hash(movie.genre) % motifs.length];
  return { motif, ...PALETTES[hash(movie.id) % PALETTES.length] };
}

export const withArt = (movie: Movie): CatalogMovie => ({ ...movie, art: artFor(movie) });
