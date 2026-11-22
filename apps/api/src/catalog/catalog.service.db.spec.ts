import type { CatalogFacets, FacetOption } from '@cineseat/shared';
import { Movie, MovieGenre, Show, Theater } from '../database/entities';
import { MoviesService } from '../movies/movies.service';
import {
  NOW,
  TIME_ZONE,
  createCatalogFixture,
  q,
  type Fixture,
} from '../movies/testing/catalog-fixture';
import { CatalogService } from './catalog.service';

/** Which list parameter each facet group drives. */
const PARAM: Record<Exclude<keyof CatalogFacets, 'total'>, string> = {
  status: 'status',
  genres: 'genre',
  languages: 'language',
  certificates: 'certificate',
  formats: 'format',
  cities: 'city',
  theaters: 'theater',
};

const counts = (options: FacetOption[]) =>
  Object.fromEntries(options.map((option) => [option.value, option.count]));

describe('CatalogService (SQLite)', () => {
  let fx: Fixture;
  let catalog: CatalogService;
  let movies: MoviesService;

  beforeAll(async () => {
    fx = await createCatalogFixture();
    const repo = <T extends object>(entity: new () => T) => fx.dataSource.getRepository(entity);
    catalog = new CatalogService(repo(Movie), repo(MovieGenre), repo(Theater), fx.config);
    movies = new MoviesService(repo(Movie), repo(MovieGenre), repo(Show), fx.dataSource, fx.config);
  });
  afterAll(() => fx.destroy());

  it('lists the vocabulary and a week of dates in the cinemas’ time zone', async () => {
    const filters = await catalog.filters(NOW);
    expect(filters.timeZone).toBe(TIME_ZONE);
    expect(filters.dates).toEqual([
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
    ]);
    expect(filters.genres).toEqual([
      'Action',
      'Comedy',
      'Drama',
      'Family',
      'Horror',
      'Sci-Fi',
      'Thriller',
    ]);
    expect(filters.languages).toEqual(['Bangla', 'English', 'Hindi']);
    expect(filters.cities).toEqual(['Chattogram', 'Dhaka']);
    expect(filters.theaters.map((theater) => theater.name)).toEqual([
      'CineSeat Agargaon',
      'CineSeat Bashundhara',
      'CineSeat Gulshan',
    ]);
    expect(filters.sorts.map((sort) => sort.value)).toEqual([
      'popular',
      'rating',
      'release',
      'title',
      'runtime',
    ]);
  });

  it('counts every option, including zeros', async () => {
    const facets = await catalog.facets(q({ status: 'NOW_SHOWING' }), NOW);
    expect(facets.total).toBe(4);
    expect(counts(facets.status)).toEqual({ NOW_SHOWING: 4, COMING_SOON: 1 });
    expect(counts(facets.genres)).toEqual({
      Action: 1,
      Comedy: 1,
      Drama: 1,
      Family: 1,
      Horror: 1,
      'Sci-Fi': 0,
      Thriller: 1,
    });
    expect(counts(facets.certificates)).toEqual({ U: 2, 'U/A': 1, A: 1 });
    expect(counts(facets.formats)).toEqual({ '2D': 2, '3D': 1 }); // E has no upcoming show; A's Chattogram show started
    expect(counts(facets.cities)).toEqual({ Chattogram: 1, Dhaka: 2 });
    expect(facets.theaters.find((theater) => theater.value === fx.theaters.gulshan)).toMatchObject({
      label: 'CineSeat Gulshan',
      city: 'Dhaka',
      count: 1,
    });
  });

  // The contract: choosing an option gives exactly the count shown next to it.
  // Each filter group appears as an active filter in at least one case, so a
  // facet that forgot to lift its own filter would be caught.
  it.each([
    ['everything', () => ({})],
    ['now showing', () => ({ status: 'NOW_SHOWING' })],
    ['coming soon in Dhaka', () => ({ status: 'COMING_SOON', city: 'Dhaka' })],
    ['drama only', () => ({ genre: 'Drama' })],
    ['drama or comedy on the 13th', () => ({ genre: 'Drama,Comedy', date: '2026-11-13' })],
    ['Hindi, rated A', () => ({ language: 'Hindi', certificate: 'A' })],
    ['English only', () => ({ language: 'English' })],
    ['rated U only', () => ({ certificate: 'U' })],
    ['Bangla, any day in Dhaka', () => ({ language: 'Bangla', city: 'Dhaka' })],
    ['Chattogram only', () => ({ city: 'Chattogram' })],
    ['one theater', () => ({ theater: fx.theaters.gulshan })],
    ['2D only', () => ({ format: '2D' })],
    ['3D rated 4+', () => ({ format: '3D', minRating: 4 })],
    ['search "a"', () => ({ search: 'a', certificate: 'U,U/A' })],
  ])('facet counts match the list results — %s', async (_label, make) => {
    const base: Record<string, unknown> = make();
    const facets = await catalog.facets(q(base), NOW);
    expect(facets.total).toBe((await movies.list(q(base), NOW)).total);

    for (const [group, param] of Object.entries(PARAM) as [keyof typeof PARAM, string][]) {
      for (const option of facets[group]) {
        const { total } = await movies.list(q({ ...base, [param]: option.value }), NOW);
        expect({ group, value: option.value, count: option.count }).toEqual({
          group,
          value: option.value,
          count: total,
        });
      }
    }
  });
});
