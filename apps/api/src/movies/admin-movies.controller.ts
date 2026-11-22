import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  AdminMovieDetailSchema,
  AdminMovieListQuerySchema,
  AdminMovieListSchema,
  AdminMoviePosterFilter,
  AdminMovieScheduleFilter,
  AdminMovieSort,
  Certificate,
  MovieStatus,
  ShowFormat,
  SortOrder,
  type AdminMovieDetail,
  type AdminMovieList,
  type AdminMovieListQuery,
} from '@cineseat/shared';
import { AUTH_COOKIE_SCHEME } from '../common/constants/session';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiQueries, listQuery } from '../common/docs/admin-queries';
import { ERROR_SCHEMA, toOpenApiSchema } from '../common/docs/openapi';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AdminMoviesService } from './admin-movies.service';

const QUERY_DOCS: MethodDecorator[] = [
  ApiQuery({
    name: 'search',
    required: false,
    description: 'Matches title, director, cast or genre (case-insensitive), or an exact movie id.',
    schema: { type: 'string' },
  }),
  ApiQuery({
    name: 'status',
    required: false,
    schema: { type: 'string', enum: MovieStatus.options },
  }),
  listQuery('genre', 'Any of these genres.'),
  listQuery('language', 'Any of these languages.'),
  listQuery('certificate', 'Any of these certificates.', Certificate.options),
  listQuery('format', 'Released in any of these formats.', ShowFormat.options),
  ApiQuery({
    name: 'schedule',
    required: false,
    description: '`scheduled`: has a show that has not started; `unscheduled`: has none.',
    schema: { type: 'string', enum: AdminMovieScheduleFilter.options },
  }),
  ApiQuery({
    name: 'poster',
    required: false,
    description: 'With or without an uploaded poster.',
    schema: { type: 'string', enum: AdminMoviePosterFilter.options },
  }),
  ApiQuery({
    name: 'releasedFrom',
    required: false,
    description: 'Release day on or after (YYYY-MM-DD, cinema time zone).',
    schema: { type: 'string', format: 'date' },
  }),
  ApiQuery({
    name: 'releasedTo',
    required: false,
    description: 'Release day on or before (YYYY-MM-DD, cinema time zone).',
    schema: { type: 'string', format: 'date' },
  }),
  ApiQuery({
    name: 'sort',
    required: false,
    description:
      '`shows` = upcoming shows, `tickets` = seats sold, `revenue` = successful payments (all time).',
    schema: { type: 'string', enum: AdminMovieSort.options, default: 'updated' },
  }),
  ApiQuery({
    name: 'order',
    required: false,
    description: 'Defaults to `asc` for `title`, `desc` for everything else.',
    schema: { type: 'string', enum: SortOrder.options },
  }),
  ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1, default: 1 } }),
  ApiQuery({
    name: 'pageSize',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  }),
];

/**
 * The movies module's read side for the admin panel. Every route is ADMIN only.
 * Changes go through the movie resource (POST/PATCH/DELETE /movies, posters,
 * POST /movies/bulk), which enforces the limits reported here.
 */
@ApiTags('admin')
@ApiCookieAuth(AUTH_COOKIE_SCHEME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/movies')
export class AdminMoviesController {
  constructor(private readonly movies: AdminMoviesService) {}

  @Get()
  @ApiOperation({
    summary: 'Movies for the admin panel — ADMIN only',
    description:
      'Every movie with its record times and all-time figures (shows, upcoming shows, next show, seats sold, revenue), with search, filters, sorting on any column and pages. `counts` gives the titles per status with every other filter applied, for status tabs.',
  })
  @ApiQueries(...QUERY_DOCS)
  @ApiResponse({
    status: 200,
    description: 'A page of movies.',
    schema: toOpenApiSchema(AdminMovieListSchema),
  })
  @ApiResponse({ status: 400, description: 'A query parameter is invalid.', schema: ERROR_SCHEMA })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'Signed in as USER — this route needs ADMIN.',
    schema: ERROR_SCHEMA,
  })
  list(
    @Query(new ZodValidationPipe(AdminMovieListQuerySchema)) query: AdminMovieListQuery,
  ): Promise<AdminMovieList> {
    return this.movies.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'One movie for the admin panel — ADMIN only',
    description:
      'The movie with its figures, its next shows (with seats sold and held), what it can still be changed to without breaking its schedule (`constraints`), and its latest recorded changes (`history`).',
  })
  @ApiParam({ name: 'id', description: 'Movie id' })
  @ApiResponse({
    status: 200,
    description: 'The movie.',
    schema: toOpenApiSchema(AdminMovieDetailSchema),
  })
  @ApiResponse({ status: 401, description: 'Not signed in.', schema: ERROR_SCHEMA })
  @ApiResponse({
    status: 403,
    description: 'Signed in as USER — this route needs ADMIN.',
    schema: ERROR_SCHEMA,
  })
  @ApiResponse({ status: 404, description: 'No movie with this id.', schema: ERROR_SCHEMA })
  detail(@Param('id') id: string): Promise<AdminMovieDetail> {
    return this.movies.detail(id);
  }
}
